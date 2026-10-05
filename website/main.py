"""College Connect backend (FastAPI + PostgreSQL).

Run locally:  DATABASE_URL=postgresql://user:pass@localhost/campbit uvicorn main:app --reload
On Render:    DATABASE_URL is set in the web service's environment variables.
First start creates the tables and an admin account (see the logs).
"""
import os
import json
import time
import uuid
import hmac
import hashlib
import secrets
import datetime as dt
from pathlib import Path
from collections import defaultdict
from typing import Any

import jwt  # PyJWT
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).parent
STATIC_DIR = BASE / "static"
STATIC_DIR.mkdir(exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it in Render > your service > Environment "
        "(use the Internal Database URL of your Postgres instance)."
    )

CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}
ALLOWED_EXT = set(CONTENT_TYPES)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_COLLECTION_BYTES = 8 * 1024 * 1024
ROLES = {"student", "staff", "admin"}


def load_secret() -> str:
    env = os.environ.get("SECRET_KEY")
    if env:
        return env
    # Fallback for local development only. On Render the disk is wiped on
    # redeploy, so always set SECRET_KEY there (render.yaml does this for you).
    f = BASE / ".secret"
    if f.exists():
        return f.read_text().strip()
    s = secrets.token_hex(32)
    f.write_text(s)
    return s


SECRET_KEY = load_secret()

# ---------------------------------------------------------------------------
# Who may read / write each shared data set (keys match your script.js).
# The browser cannot bypass this: the server checks the role on every call.
# ---------------------------------------------------------------------------
ALL = {"student", "staff", "admin"}
TEACH = {"staff", "admin"}
ADMIN = {"admin"}
RULES = {
    "cc_stud":       {"read": TEACH, "write": TEACH},   # students list
    "cc_staff":      {"read": TEACH, "write": ADMIN},   # staff members
    "cc_nt":         {"read": ALL,   "write": TEACH},   # notices
    "cc_hol":        {"read": ALL,   "write": TEACH},   # holidays
    "cc_ach":        {"read": ALL,   "write": ALL},     # achievements
    "cc_cmp":        {"read": ALL,   "write": ALL},     # complaints
    "cc_iss":        {"read": ALL,   "write": ALL},     # issue reports
    "cc_lv2":        {"read": ALL,   "write": ALL},     # leave requests
    "cc_admin_prof": {"read": ADMIN, "write": ADMIN},   # admin profile
}

app = FastAPI()
bearer = HTTPBearer()


# ---------------------------------------------------------------- database
def get_db():
    """One Postgres connection per request; commit on success, roll back on error."""
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + ":" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split(":")
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), 200_000
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def init_db():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                login_id TEXT UNIQUE NOT NULL,   -- roll number, employee id or (admin) email
                email TEXT,                      -- optional second way to sign in
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('student','staff','admin')),
                password_hash TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS collections (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by INTEGER
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS uploads (
                name TEXT PRIMARY KEY,           -- <uuid>.<ext>
                content_type TEXT NOT NULL,
                data BYTEA NOT NULL,
                uploaded_by INTEGER,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL"
        )
        count = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if count == 0:
            email = os.environ.get("ADMIN_EMAIL", "admin@college.example").lower()
            pw = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(9)
            conn.execute(
                "INSERT INTO users (login_id, name, role, password_hash) VALUES (%s,%s,%s,%s)",
                (email, "Admin", "admin", hash_password(pw)),
            )
            print("=" * 60)
            print(" First start: admin account created")
            print(f"   login:    {email}")
            if os.environ.get("ADMIN_PASSWORD"):
                print("   password: (the ADMIN_PASSWORD you set)")
            else:
                print(f"   password: {pw}   (change/reset it, this is shown only once)")
            print("=" * 60)


init_db()


# -------------------------------------------------------------------- auth
def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=12),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: psycopg.Connection = Depends(get_db),
):
    try:
        data = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
        uid = int(data["sub"])
    except Exception:
        raise HTTPException(401, "Session expired. Please sign in again.")
    row = db.execute("SELECT * FROM users WHERE id = %s", (uid,)).fetchone()
    if not row:                      # account was deleted
        raise HTTPException(401, "Account no longer exists.")
    return row


def require_admin(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return user


# simple brute-force protection: 5 wrong tries -> 5 minute lock (per ID + IP)
FAILS: dict = defaultdict(list)


def check_rate(key: str):
    now = time.time()
    FAILS[key] = [t for t in FAILS[key] if now - t < 300]
    if len(FAILS[key]) >= 5:
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")


def find_user(db: psycopg.Connection, ident: str):
    """Find an account by login ID (roll / employee ID / admin email) OR by email."""
    ident = ident.strip().lower()
    return db.execute(
        "SELECT * FROM users WHERE login_id = %s OR email = %s", (ident, ident)
    ).fetchone()


class LoginIn(BaseModel):
    user: str
    password: str
    role: str


@app.post("/api/login")
def login(body: LoginIn, request: Request, db: psycopg.Connection = Depends(get_db)):
    login_id = body.user.strip().lower()
    key = f"{login_id}|{request.client.host if request.client else ''}"
    check_rate(key)
    row = find_user(db, login_id)
    if not row or not verify_password(body.password, row["password_hash"]):
        FAILS[key].append(time.time())
        raise HTTPException(401, "Incorrect ID or password. Please check and try again.")
    if row["role"] != body.role:
        raise HTTPException(403, f"This is not a {body.role} account. Pick '{row['role'].capitalize()}' above.")
    FAILS.pop(key, None)
    return {"token": create_token(row["id"]), "role": row["role"], "name": row["name"], "login_id": row["login_id"]}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return {"id": user["id"], "login_id": user["login_id"], "email": user["email"], "name": user["name"], "role": user["role"]}


# ------------------------------------------------- user management
# Only the ADMIN can create accounts and set / change passwords.
class UserIn(BaseModel):
    login_id: str = ""          # student roll no. or teacher employee ID (admin: ignored, email is used)
    name: str
    role: str
    password: str
    email: str = ""             # optional for students / teachers, required for admins


class PasswordIn(BaseModel):
    login_id: str               # login ID or email of the person
    password: str


@app.post("/api/users")
def create_user(body: UserIn, _=Depends(require_admin), db: psycopg.Connection = Depends(get_db)):
    if body.role not in ROLES:
        raise HTTPException(400, "Role must be student, staff or admin")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    name = body.name.strip()
    email = body.email.strip().lower()
    login_id = body.login_id.strip().lower()
    if len(name) < 2:
        raise HTTPException(400, "Enter the full name")
    if email and ("@" not in email or " " in email):
        raise HTTPException(400, "Enter a valid email address")
    if body.role == "admin":
        if not email:
            raise HTTPException(400, "An admin account needs an email (it is the login ID)")
        login_id = email
    elif len(login_id) < 3:
        raise HTTPException(400, "Enter the roll number / employee ID")
    for ident in {login_id, email} - {""}:
        if find_user(db, ident):
            raise HTTPException(400, "An account with this ID or email already exists")
    db.execute(
        "INSERT INTO users (login_id, email, name, role, password_hash) VALUES (%s,%s,%s,%s,%s)",
        (login_id, email or None, name, body.role, hash_password(body.password)),
    )
    return {"ok": True}


@app.get("/api/users")
def list_users(actor=Depends(require_admin), db: psycopg.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, login_id, email, name, role FROM users "
        "ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, name"
    ).fetchall()
    return [{**r, "me": r["id"] == actor["id"]} for r in rows]


@app.post("/api/users/reset-password")
def reset_password(body: PasswordIn, _=Depends(require_admin), db: psycopg.Connection = Depends(get_db)):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    row = find_user(db, body.login_id)
    if not row:
        raise HTTPException(404, "No such user")
    db.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.password), row["id"]))
    return {"ok": True}


@app.delete("/api/users/{login_id}")
def delete_user(login_id: str, actor=Depends(current_user), db: psycopg.Connection = Depends(get_db)):
    # Admin can remove any account except their own / the last admin.
    # Teachers can only remove STUDENT logins (when they remove a student from the list).
    if actor["role"] == "student":
        raise HTTPException(403, "Not allowed")
    row = find_user(db, login_id)
    if not row:
        return {"ok": True}
    if row["id"] == actor["id"]:
        raise HTTPException(400, "You cannot remove your own account")
    if actor["role"] == "staff" and row["role"] != "student":
        raise HTTPException(403, "Teachers can only remove student accounts")
    if row["role"] == "admin":
        admins = db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").fetchone()["n"]
        if admins <= 1:
            raise HTTPException(400, "You cannot remove the last admin")
    db.execute("DELETE FROM users WHERE id = %s", (row["id"],))
    return {"ok": True}


# ------------------------------------------------ shared data (collections)
class CollectionIn(BaseModel):
    data: Any


@app.get("/api/collections")
def get_collections(user=Depends(current_user), db: psycopg.Connection = Depends(get_db)):
    out = {}
    for row in db.execute("SELECT key, data FROM collections").fetchall():
        rule = RULES.get(row["key"])
        if rule and user["role"] in rule["read"]:
            out[row["key"]] = json.loads(row["data"])
    return out


@app.put("/api/collections/{key}")
def put_collection(
    key: str,
    body: CollectionIn,
    user=Depends(current_user),
    db: psycopg.Connection = Depends(get_db),
):
    rule = RULES.get(key)
    if not rule:
        raise HTTPException(404, "Unknown data set")
    if user["role"] not in rule["write"]:
        raise HTTPException(403, "You are not allowed to change this")
    text = json.dumps(body.data)
    if len(text) > MAX_COLLECTION_BYTES:
        raise HTTPException(413, "Data too large")
    db.execute(
        """INSERT INTO collections (key, data, updated_at, updated_by) VALUES (%s,%s,%s,%s)
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by""",
        (key, text, dt.datetime.now(dt.timezone.utc).isoformat(), user["id"]),
    )
    return {"ok": True}


# ------------------------------------------------------------ file upload
# Files are stored in Postgres (table "uploads"), so they survive redeploys.
@app.post("/api/upload")
async def upload(
    file: UploadFile = File(...),
    user=Depends(current_user),
    db: psycopg.Connection = Depends(get_db),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"File type not allowed: {ext}")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File too large (max 5 MB)")
    name = f"{uuid.uuid4().hex}{ext}"
    db.execute(
        "INSERT INTO uploads (name, content_type, data, uploaded_by) VALUES (%s,%s,%s,%s)",
        (name, CONTENT_TYPES[ext], data, user["id"]),
    )
    return {"url": f"/uploads/{name}"}


@app.get("/uploads/{name}")
def get_upload(name: str, db: psycopg.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT content_type, data FROM uploads WHERE name = %s", (name,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "File not found")
    return Response(
        content=bytes(row["data"]),
        media_type=row["content_type"],
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )


# Must stay last: serves the frontend for everything not matched above.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
