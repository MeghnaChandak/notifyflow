from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import current_user, generate_token, hash_password, login_throttle, verify_password
from app.db import get_db
from app.schemas import LoginRequest

router = APIRouter()

# Checked when the email is unknown, so a wrong email and a wrong password take the same time
DUMMY_HASH = hash_password("not-a-real-password")


def user_payload(user):
    return {
        "user_id": user["user_id"],
        "employee_id": user["user_id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
    }


@router.post("/login", tags=["Auth"])
def login(body: LoginRequest, request: Request, conn=Depends(get_db)):
    email = body.email.strip().lower()
    client_ip = "unknown"
    if request.client is not None:
        client_ip = request.client.host
    email_key = f"email:{email}"
    ip_key = f"ip:{client_ip}"

    if login_throttle.is_locked(email_key) or login_throttle.is_locked(ip_key):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")

    cursor = conn.cursor()
    cursor.execute(
        "SELECT user_id, name, email, role, password_hash FROM users WHERE email = %s AND is_active = 1 AND is_deleted = 0",
        (email,),
    )
    user = cursor.fetchone()

    if user is None:
        verify_password(body.password, DUMMY_HASH)
        login_throttle.record_failure(email_key)
        login_throttle.record_failure(ip_key)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, user["password_hash"]):
        login_throttle.record_failure(email_key)
        login_throttle.record_failure(ip_key)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    login_throttle.clear(email_key)
    token = generate_token(user["user_id"], user["name"], user["role"])
    return {"token": token, "user": user_payload(user)}


@router.get("/me", tags=["Auth"])
def me(user=Depends(current_user)):
    return {"data": user_payload(user)}


@router.post("/logout", tags=["Auth"])
def logout(user=Depends(current_user)):
    # Tokens are stateless; the browser discards its copy. Kept so the UI has a call to make.
    return {"data": "Logged out"}
