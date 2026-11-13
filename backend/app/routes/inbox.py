from fastapi import APIRouter, Depends

from app.auth import current_user
from app.db import get_db
from app.schemas import InboxMarkRead

router = APIRouter()


@router.get("/inbox", tags=["Inbox"])
def get_inbox(limit: int = 30, unread_only: bool = False, conn=Depends(get_db), user=Depends(current_user)):
    """The logged-in user's in-app notifications, newest first, plus how many are unread."""
    if limit < 1 or limit > 200:
        limit = 30
    cursor = conn.cursor()

    unread_filter = ""
    if unread_only:
        unread_filter = "AND is_read = 0"
    cursor.execute(f"""
        SELECT inbox_id, title, message, module_code, module_key, is_read, created_time
        FROM inbox_notifications
        WHERE user_id = %s {unread_filter}
        ORDER BY inbox_id DESC
        LIMIT %s
    """, (user["user_id"], limit))
    rows = cursor.fetchall()

    cursor.execute(
        "SELECT COUNT(*) AS unread_count FROM inbox_notifications WHERE user_id = %s AND is_read = 0",
        (user["user_id"],),
    )
    unread_count = cursor.fetchone()["unread_count"]

    return {"data": rows, "unread_count": unread_count}


@router.post("/inbox/mark_read", tags=["Inbox"])
def mark_read(body: InboxMarkRead, conn=Depends(get_db), user=Depends(current_user)):
    if body.inbox_ids:
        placeholders = ",".join(["%s"] * len(body.inbox_ids))
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE inbox_notifications SET is_read = 1 WHERE user_id = %s AND inbox_id IN ({placeholders})",
            [user["user_id"]] + body.inbox_ids,
        )
        conn.commit()
    return {"data": "ok"}


@router.post("/inbox/mark_all_read", tags=["Inbox"])
def mark_all_read(conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    cursor.execute("UPDATE inbox_notifications SET is_read = 1 WHERE user_id = %s AND is_read = 0", (user["user_id"],))
    conn.commit()
    return {"data": "ok"}
