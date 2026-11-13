import base64
import hashlib
import hmac
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request

from app import config
from app.db import get_db

ALGORITHM = "HS256"
SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1


def hash_password(password):
    """scrypt hash stored as scrypt$salt$hash (both base64)."""
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=64)
    return "scrypt$" + base64.b64encode(salt).decode("ascii") + "$" + base64.b64encode(digest).decode("ascii")


def verify_password(password, stored_hash):
    try:
        parts = stored_hash.split("$")
        if len(parts) != 3 or parts[0] != "scrypt":
            return False
        salt = base64.b64decode(parts[1])
        expected = base64.b64decode(parts[2])
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=64)
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


def check_secret_key():
    """Called at start-up so a missing or weak secret stops the app instead of weakening every token."""
    if len(config.SECRET_KEY) < 32:
        raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 characters")


def generate_token(user_id, name, role):
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=config.TOKEN_EXPIRE_MINUTES)
    payload = {"user_id": user_id, "name": name, "role": role, "exp": expires_at}
    return jwt.encode(payload, config.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token):
    """Returns the token payload, or raises 401. Accepts the raw token or 'Bearer <token>'."""
    if token is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    token = token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if token == "":
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        return jwt.decode(token, config.SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


def current_user(request: Request, conn=Depends(get_db)):
    """The logged-in user, read fresh from the database so a disabled account or a changed role
    takes effect immediately. Returns {user_id, name, email, role}."""
    payload = decode_token(request.headers.get("Authorization", ""))

    cursor = conn.cursor()
    cursor.execute(
        "SELECT user_id, name, email, role FROM users WHERE user_id = %s AND is_active = 1 AND is_deleted = 0",
        (payload.get("user_id"),),
    )
    user = cursor.fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    return user


def admin_user(user=Depends(current_user)):
    if user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Administrator access is required")
    return user


class LoginThrottle:
    """Counts failed logins per email and per client address, in memory (one server process).
    After LOGIN_MAX_FAILURES failures the key is locked for LOGIN_LOCK_MINUTES."""

    def __init__(self):
        self.failures = {}
        self.lock = threading.Lock()

    def is_locked(self, key):
        with self.lock:
            entry = self.failures.get(key)
            if entry is None:
                return False
            if entry["locked_until"] > time.time():
                return True
            if entry["locked_until"] != 0:
                del self.failures[key]
            return False

    def record_failure(self, key):
        with self.lock:
            entry = self.failures.get(key)
            if entry is None:
                entry = {"count": 0, "locked_until": 0}
                self.failures[key] = entry
            entry["count"] = entry["count"] + 1
            if entry["count"] >= config.LOGIN_MAX_FAILURES:
                entry["locked_until"] = time.time() + config.LOGIN_LOCK_MINUTES * 60

    def clear(self, key):
        with self.lock:
            if key in self.failures:
                del self.failures[key]


login_throttle = LoginThrottle()
