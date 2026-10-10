#!/usr/bin/env python3
"""Database Migration Tool: Local SQLite -> Render PostgreSQL

This script migrates all schemas, tables, constraints, sequences, and data
from the local SQLite database (app.db) into a target PostgreSQL database
(e.g., Render Free PostgreSQL).

Usage:
  # Using target argument:
  python3 migrate_to_postgres.py --target "postgresql://user:password@hostname:5432/dbname"

  # Or using DATABASE_URL defined in .env / environment:
  python3 migrate_to_postgres.py

  # Test / Dry Run (preview rows without modifying target database):
  python3 migrate_to_postgres.py --target "postgresql://..." --dry-run
"""
import os
import sys
import argparse
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent.parent
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

import database

# Topological order of tables respecting Foreign Key dependencies
TABLES_IN_ORDER = [
    "users",
    "collections",
    "resources",
    "student_profiles",
    "shortlists",
    "contact_requests",
    "requests",
    "leaves",
    "achievements",
    "complaints",
    "issues",
    "attendance_sessions",
    "attendance",
]

SERIAL_TABLES = [
    "users",
    "resources",
    "contact_requests",
    "requests",
    "leaves",
    "achievements",
    "complaints",
    "issues",
    "attendance_sessions",
    "attendance",
]


def normalize_postgres_url(url: str) -> str:
    cleaned = url.strip()
    if cleaned.startswith("postgres://"):
        cleaned = "postgresql://" + cleaned[len("postgres://"):]
    parsed = urlparse(cleaned)
    if parsed.hostname and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        if "sslmode=" not in cleaned:
            separator = "&" if "?" in cleaned else "?"
            cleaned = f"{cleaned}{separator}sslmode=require"
    return cleaned


def migrate(source_db_path: Path, target_pg_url: str, dry_run: bool = False):
    print("=" * 65)
    print("🚀 CampBit College Connect: SQLite -> PostgreSQL Migration Tool")
    print("=" * 65)
    print(f"📁 Source SQLite DB : {source_db_path}")
    print(f"🐘 Target PostgreSQL: {urlparse(target_pg_url).netloc or 'Configured URL'}")
    print(f"🔍 Dry Run Mode     : {'YES (No data written)' if dry_run else 'NO (Live Migration)'}")
    print("-" * 65)

    if not source_db_path.exists():
        print(f"❌ Error: Source database '{source_db_path}' not found!")
        sys.exit(1)

    try:
        import psycopg2
        from psycopg2.extras import execute_values
    except ImportError:
        print("❌ Error: psycopg2 is required. Run: pip install psycopg2-binary")
        sys.exit(1)

    # 1. Connect to SQLite
    src_conn = sqlite3.connect(str(source_db_path))
    src_conn.row_factory = sqlite3.Row

    # 2. Connect to PostgreSQL
    try:
        pg_conn = psycopg2.connect(target_pg_url)
        pg_conn.autocommit = False
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {e}")
        sys.exit(1)

    print("✅ Connected to both source SQLite and target PostgreSQL successfully.")

    if not dry_run:
        print("\n🔨 Ensuring PostgreSQL tables and indexes exist...")
        with pg_conn.cursor() as cur:
            for stmt in database.POSTGRES_TABLES_DDL.strip().split(";"):
                s = stmt.strip()
                if s:
                    cur.execute(s)
        pg_conn.commit()
        print("✅ PostgreSQL schema initialized.")

    print("\n📦 Migrating table records...")
    stats = {}

    for table in TABLES_IN_ORDER:
        # Check source table exists
        src_check = src_conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()[0]
        if not src_check:
            print(f"  ⚠️ Table '{table}' not present in SQLite source. Skipping.")
            continue

        # Get column names from SQLite
        col_info = src_conn.execute(f"PRAGMA table_info({table})").fetchall()
        col_names = [c[1] for c in col_info]

        # Fetch all rows from source
        rows = src_conn.execute(f"SELECT * FROM {table}").fetchall()
        total_rows = len(rows)

        if dry_run:
            print(f"  🔍 [DRY RUN] Table '{table}': {total_rows} records ready to migrate.")
            stats[table] = (total_rows, total_rows)
            continue

        if total_rows == 0:
            print(f"  ℹ️ Table '{table}': 0 records (empty).")
            stats[table] = (0, 0)
            continue

        # Insert into PostgreSQL
        cols_str = ", ".join(f'"{c}"' for c in col_names)
        values = [[r[c] for c in col_names] for r in rows]

        with pg_conn.cursor() as cur:
            # We use ON CONFLICT DO NOTHING to ensure idempotence
            insert_sql = f'INSERT INTO "{table}" ({cols_str}) VALUES %s ON CONFLICT DO NOTHING'
            execute_values(cur, insert_sql, values, page_size=500)
            pg_conn.commit()

            # Verify count in PostgreSQL
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            pg_count = cur.fetchone()[0]

        print(f"  ✅ Table '{table}': {total_rows} SQLite rows -> {pg_count} Postgres rows.")
        stats[table] = (total_rows, pg_count)

    # 3. Reset PostgreSQL SERIAL Sequences
    if not dry_run:
        print("\n🔢 Resetting PostgreSQL Auto-Increment Sequences...")
        with pg_conn.cursor() as cur:
            for table in SERIAL_TABLES:
                try:
                    cur.execute(f"""
                        SELECT setval(
                            pg_get_serial_sequence('{table}', 'id'),
                            COALESCE((SELECT MAX(id) FROM "{table}"), 1),
                            true
                        )
                    """)
                    pg_conn.commit()
                    print(f"  ✅ Reset sequence for '{table}'")
                except Exception as seq_err:
                    pg_conn.rollback()
                    # Non-fatal if sequence name differs
                    print(f"  ℹ️ Sequence notice on '{table}': {seq_err}")

    src_conn.close()
    pg_conn.close()

    print("\n" + "=" * 65)
    print("🎉 MIGRATION COMPLETED SUCCESSFULLY")
    print("=" * 65)
    print(f"{'Table Name':<25} {'SQLite Source':<15} {'PostgreSQL Target':<15}")
    print("-" * 65)
    for t, (s_cnt, p_cnt) in stats.items():
        print(f"{t:<25} {s_cnt:<15} {p_cnt:<15}")
    print("=" * 65)
    print("\n💡 To deploy to Render with this PostgreSQL database:")
    print("   1. In your Render Dashboard -> Environment Variables:")
    print("      Set DATABASE_URL = <Your Render PostgreSQL Internal/External URL>")
    print("   2. The CampBit backend automatically detects PostgreSQL and connects!")
    print("-" * 65)


def main():
    parser = argparse.ArgumentParser(description="Migrate CampBit database from SQLite to PostgreSQL")
    parser.add_argument(
        "--source",
        default=str(database.DB_PATH),
        help=f"Path to source SQLite database (default: {database.DB_PATH})"
    )
    parser.add_argument(
        "--target",
        default="",
        help="Target PostgreSQL connection URL (e.g., postgresql://user:pass@host:5432/db). Defaults to DATABASE_URL."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview migration without modifying the target PostgreSQL database"
    )

    args = parser.parse_args()
    target_url = args.target or os.environ.get("DATABASE_URL", "")

    if not target_url:
        print("❌ Error: Target PostgreSQL URL must be provided via --target or DATABASE_URL in .env / environment.")
        print("Example: python3 migrate_to_postgres.py --target \"postgresql://user:pass@render-db-host:5432/campbit\"")
        sys.exit(1)

    normalized_target = normalize_postgres_url(target_url)
    migrate(Path(args.source), normalized_target, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
