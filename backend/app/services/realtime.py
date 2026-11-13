"""Socket.IO server and the in-app inbox.

A browser connects with the login token; the server puts it in the room of the user inside the token
(never a room the client names), so one user cannot listen to another user's notifications.
"""

import asyncio
from datetime import datetime

import socketio
from fastapi import HTTPException
from loguru import logger

from app import config
from app.auth import decode_token
from app.db import open_connection

allowed_origins = list(config.CORS_ORIGINS)
allowed_origins.append(config.FRONTEND_BASE_URL.rstrip("/"))

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=allowed_origins)

# The running event loop, saved at start-up so background threads can emit to sockets
main_loop = None


def set_main_loop(loop):
    global main_loop
    main_loop = loop


def user_room(user_id):
    return f"notification-user-{user_id}"


def user_is_active(user_id):
    conn = open_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s AND is_active = 1 AND is_deleted = 0", (user_id,))
        return cursor.fetchone() is not None
    finally:
        conn.close()


@sio.event
async def connect(sid, environ, auth):
    # Also remember the loop here, in case the start-up hook did not run
    set_main_loop(asyncio.get_running_loop())

    token = None
    if isinstance(auth, dict):
        token = auth.get("token")

    try:
        payload = decode_token(token)
    except HTTPException:
        raise socketio.exceptions.ConnectionRefusedError("unauthorized")

    user_id = payload.get("user_id")
    active = await asyncio.to_thread(user_is_active, user_id)
    if not active:
        raise socketio.exceptions.ConnectionRefusedError("unauthorized")

    await sio.enter_room(sid, user_room(user_id))


@sio.event
async def disconnect(sid):
    pass


@sio.on("subscribe-notification-service")
async def subscribe_notification_service(sid, *args):
    """Kept so clients written for the old protocol still work. The room comes from the login token
    at connect time, so nothing the client sends here is used."""
    return None


def emit_to_user(user_id, payload):
    """Pushes an event to one user's open browser tabs. Safe to call from a background thread."""
    if main_loop is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(
            sio.emit("inbox-notification", payload, room=user_room(user_id)), main_loop
        )
    except Exception as e:
        logger.warning(f"Could not push notification to user {user_id}: {e}")


def add_inbox_messages(conn, user_ids, title, message, module_code, module_key):
    """Stores one in-app notification per user and pushes it to their open tabs.
    The rows are written on the caller's connection; the caller commits."""
    cursor = conn.cursor()
    short_message = message
    if short_message is not None and len(short_message) > 1000:
        short_message = short_message[:1000] + "..."
    short_title = title
    if len(short_title) > 255:
        short_title = short_title[:252] + "..."

    saved = []
    for user_id in user_ids:
        cursor.execute(
            """
            INSERT INTO inbox_notifications (user_id, title, message, module_code, module_key)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, short_title, short_message, module_code, module_key),
        )
        saved.append({"user_id": user_id, "inbox_id": cursor.lastrowid})

    # Push after the rows exist; a user who reloads will read the same rows from /inbox
    for item in saved:
        emit_to_user(item["user_id"], {
            "inbox_id": item["inbox_id"],
            "title": short_title,
            "message": short_message,
            "module_code": module_code,
            "module_key": module_key,
            "created_time": datetime.now().isoformat(),
        })
