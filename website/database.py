"""Database abstraction layer for College Connect (CampBit).

Supports both:
1. Local SQLite (default for development: app.db with WAL mode & foreign keys)
2. PostgreSQL (for Render free PostgreSQL or production via DATABASE_URL)

Provides unified connection management, cursor compatibility (parameter mapping ? -> %s,
cur.lastrowid support, DictRow / sqlite3.Row dict-like access), and schema initialization.
"""
import os
import re
import json
import sqlite3
import datetime as dt
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(BASE / "app.db")))

# Normalize Render's postgres:// prefix to postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

IS_POSTGRES = DATABASE_URL.startswith("postgresql://")

# Lazy-loaded Postgres connection pool
_pg_pool = None


def get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        try:
            import psycopg2
            from psycopg2.pool import ThreadedConnectionPool
        except ImportError as e:
            raise RuntimeError(
                "psycopg2 is required for PostgreSQL support. Install with: pip install psycopg2-binary"
            ) from e

        dsn = DATABASE_URL
        # If connecting to remote PostgreSQL (e.g. Render, Supabase, Neon) without explicit sslmode, default to require
        parsed = urlparse(dsn)
        if parsed.hostname and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            if "sslmode=" not in dsn:
                separator = "&" if "?" in dsn else "?"
                dsn = f"{dsn}{separator}sslmode=require"

        _pg_pool = ThreadedConnectionPool(minconn=1, maxconn=20, dsn=dsn, connect_timeout=15)
    return _pg_pool


def translate_query_for_postgres(sql: str) -> Tuple[str, bool]:
    """Translates SQLite query constructs (? placeholders, INSERT OR REPLACE, etc.) to PostgreSQL syntax.
    Returns (translated_sql, wants_lastrowid).
    """
    cleaned = sql.strip()

    # Translate parameter placeholders (? -> %s) outside quoted literals
    parts = []
    in_single = False
    in_double = False
    i = 0
    while i < len(cleaned):
        c = cleaned[i]
        if c == "'" and not in_double:
            in_single = not in_single
            parts.append(c)
        elif c == '"' and not in_single:
            in_double = not in_double
            parts.append(c)
        elif c == '?' and not in_single and not in_double:
            parts.append('%s')
        else:
            parts.append(c)
        i += 1
    translated = "".join(parts)

    # Convert SQLite-specific INSERT OR REPLACE / IGNORE
    translated = re.sub(
        r'INSERT\s+OR\s+REPLACE\s+INTO\s+collections\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)',
        r'INSERT INTO collections (\1) VALUES (\2) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
        translated,
        flags=re.IGNORECASE
    )
    translated = re.sub(
        r'INSERT\s+OR\s+IGNORE\s+INTO\s+shortlists\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)',
        r'INSERT INTO shortlists (\1) VALUES (\2) ON CONFLICT (guest_id, student_id) DO NOTHING',
        translated,
        flags=re.IGNORECASE
    )

    # Check if this is an INSERT statement targeting a table with an 'id' SERIAL column
    wants_lastrowid = False
    m = re.match(r'^\s*INSERT\s+INTO\s+([a-zA-Z0-9_]+)', translated, re.IGNORECASE)
    if m:
        table = m.group(1).lower()
        # Tables with auto-increment 'id' primary keys
        tables_with_serial_id = {
            "users", "resources", "contact_requests", "requests",
            "leaves", "achievements", "complaints", "issues",
            "attendance_sessions", "attendance", "audit_logs",
            "certificates", "timetable_adjustments"
        }
        if table in tables_with_serial_id and "returning" not in translated.lower():
            translated = translated.rstrip(";") + " RETURNING id"
            wants_lastrowid = True

    return translated, wants_lastrowid


class PostgresCursorWrapper:
    """Wraps a psycopg2 cursor to provide sqlite3.Cursor compatible interface."""
    def __init__(self, raw_cursor):
        self._cur = raw_cursor
        self.lastrowid = None

    def execute(self, query: str, params: Any = None):
        translated_sql, wants_lastrowid = translate_query_for_postgres(query)
        if params is None:
            self._cur.execute(translated_sql)
        else:
            if isinstance(params, (list, tuple)):
                self._cur.execute(translated_sql, params)
            elif isinstance(params, dict):
                self._cur.execute(translated_sql, params)
            else:
                self._cur.execute(translated_sql, (params,))

        if wants_lastrowid:
            try:
                row = self._cur.fetchone()
                if row:
                    self.lastrowid = row[0]
            except Exception:
                self.lastrowid = None
        else:
            self.lastrowid = None
        return self

    def executemany(self, query: str, seq_of_params: Any):
        translated_sql, _ = translate_query_for_postgres(query)
        self._cur.executemany(translated_sql, seq_of_params)
        return self

    def __iter__(self):
        # sqlite3 cursors are iterable (for row in db.execute(...)); psycopg2 wrapper must be too
        return iter(self._cur)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def fetchmany(self, size=None):
        return self._cur.fetchmany(size) if size else self._cur.fetchmany()

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    def close(self):
        self._cur.close()


class PostgresConnectionWrapper:
    """Wraps a psycopg2 connection to mimic sqlite3.Connection behavior."""
    def __init__(self, raw_conn, pool=None):
        self._conn = raw_conn
        self._pool = pool

    def cursor(self):
        from psycopg2.extras import DictCursor
        raw_cur = self._conn.cursor(cursor_factory=DictCursor)
        return PostgresCursorWrapper(raw_cur)

    def execute(self, query: str, params: Any = None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        if self._pool is not None:
            self._pool.putconn(self._conn)
        else:
            self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()


def get_sqlite_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # High-performance, concurrency-safe SQLite settings
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


def get_connection():
    """Returns a unified database connection (PostgresConnectionWrapper or sqlite3.Connection)."""
    if IS_POSTGRES:
        pool = get_pg_pool()
        raw_conn = pool.getconn()
        return PostgresConnectionWrapper(raw_conn, pool=pool)
    return get_sqlite_connection()


def get_db():
    """FastAPI dependency yielding a database connection and managing transaction commit/rollback."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------- Schema DDL
SQLITE_TABLES_DDL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    login_id TEXT UNIQUE NOT NULL,
    email TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student','faculty','hod','principal','warden','placement_officer','admin','guest')),
    password_hash TEXT NOT NULL,
    pw_version INTEGER NOT NULL DEFAULT 0,
    dept TEXT,
    hostel TEXT,
    photo TEXT,
    phone TEXT
);

CREATE TABLE IF NOT EXISTS collections (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    dept TEXT NOT NULL DEFAULT '',
    semester TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploader_id INTEGER NOT NULL,
    uploader_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cgpa TEXT NOT NULL DEFAULT '',
    backlogs INTEGER NOT NULL DEFAULT 0,
    subjects TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 0,
    anon_code TEXT UNIQUE,
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS shortlists (
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    guest_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guest_id, student_id)
);

CREATE TABLE IF NOT EXISTS contact_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    guest_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    anon_code TEXT NOT NULL,
    company TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    officer_id INTEGER,
    officer_note TEXT,
    officer_at TEXT,
    student_at TEXT
);

CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    requester_id TEXT NOT NULL,
    requester_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT '',
    target_user TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'normal',
    title TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    action_note TEXT NOT NULL DEFAULT '',
    action_by TEXT NOT NULL DEFAULT '',
    action_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    dept TEXT NOT NULL DEFAULT '',
    hostel TEXT NOT NULL DEFAULT '',
    leave_type TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    stage TEXT NOT NULL DEFAULT 'Pending',
    target_role TEXT NOT NULL DEFAULT 'hod',
    action_by TEXT DEFAULT '',
    action_note TEXT DEFAULT '',
    action_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Certification',
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    verified_by TEXT DEFAULT '',
    verified_role TEXT DEFAULT '',
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Open',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    action_by TEXT DEFAULT '',
    action_note TEXT DEFAULT '',
    action_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    session_id TEXT UNIQUE NOT NULL,
    client_uuid TEXT UNIQUE,
    dept TEXT NOT NULL,
    year TEXT NOT NULL,
    subject TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    date TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT '1',
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    teacher_name TEXT NOT NULL,
    total_students INTEGER NOT NULL DEFAULT 0,
    present_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    session_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    marked_by INTEGER NOT NULL REFERENCES users(id),
    marked_at TEXT NOT NULL,
    client_uuid TEXT,
    UNIQUE(session_id, student_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER,
    login_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    cert_id TEXT NOT NULL UNIQUE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_roll TEXT NOT NULL,
    student_name TEXT NOT NULL,
    dept TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Achievement',
    description TEXT NOT NULL DEFAULT '',
    issued_by TEXT NOT NULL,
    issuer_role TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    revoke_reason TEXT DEFAULT '',
    revoked_by TEXT DEFAULT '',
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    dept TEXT NOT NULL,
    year TEXT NOT NULL DEFAULT '3',
    adjustment_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    original_teacher TEXT NOT NULL DEFAULT '',
    substitute_teacher TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '1',
    room TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    posted_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

SQLITE_INDEXES_DDL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_college_id ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user_id ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_leaves_college_id ON leaves(college_id);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_college_id ON achievements(college_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_college_id ON complaints(college_id);
CREATE INDEX IF NOT EXISTS idx_issues_user_id ON issues(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_session_id ON attendance_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_college_id ON audit_logs(college_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_certificates_college_id ON certificates(college_id);
CREATE INDEX IF NOT EXISTS idx_certificates_cert_id ON certificates(cert_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student_roll ON certificates(student_roll);
CREATE INDEX IF NOT EXISTS idx_certificates_sha256 ON certificates(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_timetable_adj_college_id ON timetable_adjustments(college_id);
CREATE INDEX IF NOT EXISTS idx_timetable_adj_dept ON timetable_adjustments(dept);
CREATE INDEX IF NOT EXISTS idx_timetable_adj_date ON timetable_adjustments(date);
CREATE INDEX IF NOT EXISTS idx_contact_requests_tenant ON contact_requests(college_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_student ON contact_requests(college_id, student_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(college_id, status);
CREATE INDEX IF NOT EXISTS idx_shortlists_tenant ON shortlists(college_id, guest_id);
"""

POSTGRES_TABLES_DDL = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    login_id TEXT UNIQUE NOT NULL,
    email TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student','faculty','hod','principal','warden','placement_officer','admin','guest')),
    password_hash TEXT NOT NULL,
    pw_version INTEGER NOT NULL DEFAULT 0,
    dept TEXT,
    hostel TEXT,
    photo TEXT,
    phone TEXT
);

CREATE TABLE IF NOT EXISTS collections (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    dept TEXT NOT NULL DEFAULT '',
    semester TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploader_id INTEGER NOT NULL,
    uploader_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cgpa TEXT NOT NULL DEFAULT '',
    backlogs INTEGER NOT NULL DEFAULT 0,
    subjects TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 0,
    anon_code TEXT UNIQUE,
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS shortlists (
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    guest_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guest_id, student_id)
);

CREATE TABLE IF NOT EXISTS contact_requests (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    guest_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    anon_code TEXT NOT NULL,
    company TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    officer_id INTEGER,
    officer_note TEXT,
    officer_at TEXT,
    student_at TEXT
);

CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    requester_id TEXT NOT NULL,
    requester_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT '',
    target_user TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'normal',
    title TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    action_note TEXT NOT NULL DEFAULT '',
    action_by TEXT NOT NULL DEFAULT '',
    action_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaves (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    dept TEXT NOT NULL DEFAULT '',
    hostel TEXT NOT NULL DEFAULT '',
    leave_type TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    stage TEXT NOT NULL DEFAULT 'Pending',
    target_role TEXT NOT NULL DEFAULT 'hod',
    action_by TEXT DEFAULT '',
    action_note TEXT DEFAULT '',
    action_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Certification',
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    verified_by TEXT DEFAULT '',
    verified_role TEXT DEFAULT '',
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Open',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    action_by TEXT DEFAULT '',
    action_note TEXT DEFAULT '',
    action_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    session_id TEXT UNIQUE NOT NULL,
    client_uuid TEXT UNIQUE,
    dept TEXT NOT NULL,
    year TEXT NOT NULL,
    subject TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    date TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT '1',
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    teacher_name TEXT NOT NULL,
    total_students INTEGER NOT NULL DEFAULT 0,
    present_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    session_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    marked_by INTEGER NOT NULL REFERENCES users(id),
    marked_at TEXT NOT NULL,
    client_uuid TEXT,
    UNIQUE(session_id, student_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    user_id INTEGER,
    login_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    cert_id TEXT NOT NULL UNIQUE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_roll TEXT NOT NULL,
    student_name TEXT NOT NULL,
    dept TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Achievement',
    description TEXT NOT NULL DEFAULT '',
    issued_by TEXT NOT NULL,
    issuer_role TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    revoke_reason TEXT DEFAULT '',
    revoked_by TEXT DEFAULT '',
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_adjustments (
    id SERIAL PRIMARY KEY,
    college_id TEXT NOT NULL DEFAULT 'BPUT',
    dept TEXT NOT NULL,
    year TEXT NOT NULL DEFAULT '3',
    adjustment_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    original_teacher TEXT NOT NULL DEFAULT '',
    substitute_teacher TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '1',
    room TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    posted_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

POSTGRES_INDEXES_DDL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_college_id ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user_id ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_leaves_college_id ON leaves(college_id);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_college_id ON achievements(college_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_college_id ON complaints(college_id);
CREATE INDEX IF NOT EXISTS idx_issues_user_id ON issues(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_session_id ON attendance_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_college_id ON audit_logs(college_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_pg_certificates_college_id ON certificates(college_id);
CREATE INDEX IF NOT EXISTS idx_pg_certificates_cert_id ON certificates(cert_id);
CREATE INDEX IF NOT EXISTS idx_pg_certificates_student_roll ON certificates(student_roll);
CREATE INDEX IF NOT EXISTS idx_pg_certificates_sha256 ON certificates(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_pg_timetable_adj_college_id ON timetable_adjustments(college_id);
CREATE INDEX IF NOT EXISTS idx_pg_timetable_adj_dept ON timetable_adjustments(dept);
CREATE INDEX IF NOT EXISTS idx_pg_timetable_adj_date ON timetable_adjustments(date);
CREATE INDEX IF NOT EXISTS idx_pg_contact_requests_tenant ON contact_requests(college_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_pg_contact_requests_student ON contact_requests(college_id, student_id);
CREATE INDEX IF NOT EXISTS idx_pg_contact_requests_status ON contact_requests(college_id, status);
CREATE INDEX IF NOT EXISTS idx_pg_shortlists_tenant ON shortlists(college_id, guest_id);
"""


def init_db(password_hasher_fn=None):
    """Initializes tables, constraints, indexes, and initial admin seed on current database."""
    conn = get_connection()
    try:
        if IS_POSTGRES:
            # PostgreSQL execution
            print("[init_db] connected to PostgreSQL, creating tables...", flush=True)
            conn.execute("SET lock_timeout = '15s'")
            conn.execute("SET statement_timeout = '60s'")
            for statement in POSTGRES_TABLES_DDL.strip().split(";"):
                stmt = statement.strip()
                if stmt:
                    conn.execute(stmt)
            conn.commit()

            # Postgres migration loop for college_id
            for tbl in ("users", "resources", "requests", "leaves", "achievements", "complaints", "issues", "attendance_sessions", "attendance", "certificates", "timetable_adjustments", "contact_requests", "shortlists"):
                try:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS college_id TEXT NOT NULL DEFAULT 'BPUT'")
                except Exception:
                    pass
            try:
                conn.execute("ALTER TABLE leaves ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'Pending'")
            except Exception:
                pass
            conn.commit()

             
            # Older Postgres databases may lack these columns; add them before indexes
            for col_def in (
                "email TEXT",
                "dept TEXT",
                "hostel TEXT",
                "photo TEXT",
                "phone TEXT",
                "pw_version INTEGER NOT NULL DEFAULT 0",
            ):
                conn.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_def}")
            conn.execute("ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS client_uuid TEXT")
            conn.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS client_uuid TEXT")
            conn.commit()
        
            print("[init_db] column migrations done, creating indexes...", flush=True)
            # Postgres indexes execution
            for statement in POSTGRES_INDEXES_DDL.strip().split(";"):
                stmt = statement.strip()
                if stmt:
                    conn.execute(stmt)
            conn.commit()
            conn.execute("RESET lock_timeout")
            conn.execute("RESET statement_timeout")
            conn.commit()
            print("[init_db] PostgreSQL schema ready", flush=True)

            # Seed admin if users table is empty
            count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if count == 0 and password_hasher_fn:
                import secrets
                email = os.environ.get("ADMIN_EMAIL", "admin@college.example").lower()
                pw = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(9)
                conn.execute(
                    "INSERT INTO users (college_id, login_id, name, role, password_hash) VALUES (%s, %s, %s, %s, %s)",
                    ("BPUT", email, "Admin", "admin", password_hasher_fn(pw))
                )
                conn.commit()
                print("=" * 60)
                print(" PostgreSQL database initialized. Admin account created:")
                print(f"   login:    {email}")
                print(f"   password: {pw}")
                print("=" * 60)
        else:
            # SQLite execution
            conn.executescript(SQLITE_TABLES_DDL)

            # SQLite migration checks for legacy app.db columns
            for tbl in ("users", "resources", "requests", "leaves", "achievements", "complaints", "issues", "attendance_sessions", "attendance", "certificates", "timetable_adjustments", "contact_requests", "shortlists"):
                try:
                    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
                    if cols and "college_id" not in cols:
                        conn.execute(f"ALTER TABLE {tbl} ADD COLUMN college_id TEXT NOT NULL DEFAULT 'BPUT'")
                except Exception:
                    pass

            try:
                lcols = [r[1] for r in conn.execute("PRAGMA table_info(leaves)").fetchall()]
                if lcols and "stage" not in lcols:
                    conn.execute("ALTER TABLE leaves ADD COLUMN stage TEXT NOT NULL DEFAULT 'Pending'")
            except Exception:
                pass

            cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
            for col in ("email", "dept", "hostel", "photo", "phone"):
                if col not in cols:
                    conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
            if "pw_version" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN pw_version INTEGER NOT NULL DEFAULT 0")

            # SQLite indexes execution
            conn.executescript(SQLITE_INDEXES_DDL)

            # Seed admin if users table is empty
            count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if count == 0 and password_hasher_fn:
                import secrets
                email = os.environ.get("ADMIN_EMAIL", "admin@college.example").lower()
                pw = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(9)
                conn.execute(
                    "INSERT INTO users (college_id, login_id, name, role, password_hash) VALUES (?,?,?,?,?)",
                    ("BPUT", email, "Admin", "admin", password_hasher_fn(pw))
                )
                conn.commit()
                print("=" * 60)
                print(" Local SQLite database initialized. Admin account created:")
                print(f"   login:    {email}")
                print(f"   password: {pw}")
                print("=" * 60)

            # Seed default recruiter guest if missing
            recruiter = conn.execute("SELECT id FROM users WHERE login_id = 'recruiter_tcs'").fetchone()
            if not recruiter and password_hasher_fn:
                conn.execute(
                    "INSERT INTO users (college_id, login_id, email, name, role, password_hash) VALUES (?,?,?,?,?,?)",
                    ("BPUT", "recruiter_tcs", "campus.hiring@tcs.example", "TCS Talent Acquisition", "guest", password_hasher_fn("Recruiter123!"))
                )
                conn.commit()
            conn.commit()
    finally:
        conn.close()
