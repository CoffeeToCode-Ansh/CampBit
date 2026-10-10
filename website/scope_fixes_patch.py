"""Drop-in replacements for main.py: scope complaints + attendance per role.

Replace these in main.py (same names/decorators as before):
  - get_complaints, get_complaint, change_complaint_status   (and add the two helpers)
  - sync_attendance, get_attendance
Everything used here (norm_dept, require_roles, current_user, get_db, dt, HTTPException,
List, BaseModel) already exists in main.py.
"""
import sqlite3
import datetime as dt
from typing import List, Optional
from pydantic import BaseModel
from fastapi import HTTPException, Depends

from main import (
    app,
    get_db,
    current_user,
    require_roles,
    norm_dept,
    ComplaintStatusIn,
    AttendanceSyncIn,
)

# ------------------------------------------------------------------ complaints
HOSTEL_CATS = ("Hostel", "Mess", "Food & Mess", "Cleanliness", "Food")
COLLEGE_CATS = ("Academic", "College")


def complaint_visible(row, user, db) -> bool:
    """Submitter, principal/admin, the warden of the submitter's hostel (hostel categories),
    or the HOD of the submitter's department (academic/college categories). Nobody else."""
    role = user["role"]
    if role in ("principal", "admin") or row["user_id"] == user["id"]:
        return True
    if role not in ("warden", "hod"):
        return False
    owner = db.execute("SELECT dept, hostel FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    if not owner:
        return False
    if role == "warden":
        h = (user["hostel"] or "").strip().lower()
        return bool(h) and row["category"] in HOSTEL_CATS and (owner["hostel"] or "").strip().lower() == h
    d = norm_dept(user["dept"])
    return bool(d) and row["category"] in COLLEGE_CATS and norm_dept(owner["dept"]) == d


def complaint_out(row, user) -> dict:
    d = dict(row)
    if d.get("is_anonymous") and user["role"] not in ("admin", "principal") and d["user_id"] != user["id"]:
        d["login_id"], d["user_id"] = "", None          # staff handling it must not learn who filed it
    return d


@app.get("/api/complaints")
def get_complaints(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM complaints ORDER BY id DESC").fetchall()
    return [complaint_out(r, user) for r in rows if complaint_visible(r, user, db)]


@app.get("/api/complaints/{cid}")
def get_complaint(cid: int, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM complaints WHERE id = ?", (cid,)).fetchone()
    if not row or not complaint_visible(row, user, db):
        raise HTTPException(404, "Complaint not found")   # same answer for "missing" and "not yours"
    return complaint_out(row, user)


@app.post("/api/complaints/{cid}/status")
def change_complaint_status(cid: int, body: ComplaintStatusIn, user=Depends(require_roles("warden", "hod", "principal", "admin")), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM complaints WHERE id = ?", (cid,)).fetchone()
    if not row or not complaint_visible(row, user, db):
        raise HTTPException(404, "Complaint not found")
    status = body.status.strip()
    if not status or len(status) > 40:
        raise HTTPException(400, "Invalid status")
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    db.execute(
        "UPDATE complaints SET status = ?, action_by = ?, action_note = ?, action_at = ?, updated_at = ? WHERE id = ?",
        (status, f"{user['name']} ({user['role'].upper()})", body.action_note.strip()[:500], now, now, cid))
    return {"ok": True, "complaint": complaint_out(db.execute("SELECT * FROM complaints WHERE id = ?", (cid,)).fetchone(), user)}


# ------------------------------------------------------------------ attendance
ATT_STATUSES = {"present", "absent", "late"}


@app.post("/api/attendance/sync")
def sync_attendance(body: AttendanceSyncIn, user=Depends(require_roles("faculty", "hod", "principal", "admin")), db: sqlite3.Connection = Depends(get_db)):
    role = user["role"]
    if role in ("faculty", "hod") and norm_dept(body.dept) != norm_dept(user["dept"]):
        raise HTTPException(403, "You can only mark attendance for your own department")
    if not body.records or len(body.records) > 500:
        raise HTTPException(400, "Between 1 and 500 records per batch")
    if any(r.status not in ATT_STATUSES for r in body.records):
        raise HTTPException(400, "Status must be present, absent or late")

    done = db.execute("SELECT session_id FROM attendance_sessions WHERE client_uuid = ?", (body.client_uuid,)).fetchone()
    if done:                                                  # exact retry of a batch already stored
        return {
            "ok": True,
            "status": "already_synced",
            "client_uuid": body.client_uuid,
            "session_id": done["session_id"],
            "synced_count": len(body.records),
            "message": "Idempotent: this attendance session was already received and processed."
        }

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    sess = db.execute("SELECT * FROM attendance_sessions WHERE session_id = ?", (body.session_id,)).fetchone()
    if sess and sess["teacher_id"] != user["id"] and role not in ("principal", "admin"):
        raise HTTPException(409, "This class session was already marked by another teacher")
    if not sess:
        db.execute(
            "INSERT INTO attendance_sessions (session_id, client_uuid, dept, year, subject, section, date, period, teacher_id, teacher_name, total_students, present_count, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?)",
            (body.session_id, body.client_uuid, body.dept, body.year, body.subject, body.section, body.date, body.period, user["id"], user["name"], now))

    added = 0
    for it in body.records:                                   # first write wins; a re-sync never overwrites a mark
        cur = db.execute(
            "INSERT INTO attendance (session_id, student_id, student_name, status, marked_by, marked_at, client_uuid) VALUES (?,?,?,?,?,?,?) "
            "ON CONFLICT(session_id, student_id) DO NOTHING",
            (body.session_id, it.student_id, it.student_name, it.status, user["id"], now, body.client_uuid))
        added += cur.rowcount or 0
    total, present = db.execute("SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) FROM attendance WHERE session_id = ?", (body.session_id,)).fetchone()
    db.execute("UPDATE attendance_sessions SET total_students = ?, present_count = ? WHERE session_id = ?", (total, present, body.session_id))
    return {
        "ok": True,
        "status": "synced",
        "client_uuid": body.client_uuid,
        "session_id": body.session_id,
        "synced_count": added,
        "present_count": present,
        "skipped_existing": len(body.records) - added,
        "message": f"Successfully recorded roll call for {added} students."
    }


@app.get("/api/attendance")
def get_attendance(session_id: str = "", student_id: str = "", date: str = "", user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    role = user["role"]
    base = ("SELECT a.*, s.subject, s.dept, s.year, s.date, s.period, s.teacher_name "
            "FROM attendance a JOIN attendance_sessions s ON a.session_id = s.session_id WHERE 1=1")
    params: list = []
    if role == "student":                                     # own rows only; filters from the URL are ignored
        base += " AND LOWER(a.student_id) = LOWER(?)"
        params.append(user["login_id"])
        rows = db.execute(base + " ORDER BY a.id DESC", params).fetchall()
        total = len(rows)
        present = sum(1 for r in rows if r["status"] == "present")
        return {"records": [dict(r) for r in rows], "total": total, "present": present,
                "percentage": round(present / total * 100, 1) if total else None}   # no data -> null, not a made-up 85
    if role not in ("faculty", "hod", "principal", "admin"):
        raise HTTPException(403, "You are not allowed to do this")
    if role == "faculty":
        base += " AND s.teacher_id = ?"; params.append(user["id"])
    elif role == "hod":
        base += " AND LOWER(TRIM(s.dept)) = ?"; params.append(norm_dept(user["dept"]))
    if session_id:
        base += " AND a.session_id = ?"; params.append(session_id)
    if student_id:
        base += " AND LOWER(a.student_id) = LOWER(?)"; params.append(student_id)
    if date:
        base += " AND s.date = ?"; params.append(date)
    return {"records": [dict(r) for r in db.execute(base + " ORDER BY a.id DESC LIMIT 200", params).fetchall()]}
