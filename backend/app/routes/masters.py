from fastapi import APIRouter, Depends, HTTPException, Path

from app.auth import admin_user, current_user, hash_password
from app.db import get_db
from app.schemas import UserCreate, UserUpdate

router = APIRouter()


@router.get("/get_employees", tags=["Masters"])
def get_employees(conn=Depends(get_db), user=Depends(current_user)):
    """Active users for the pickers. Email addresses are only shown to administrators."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_id AS employee_id, name AS employee_name, email AS employee_email, department_id, manager_id
        FROM users
        WHERE is_active = 1 AND is_deleted = 0
        ORDER BY name
    """)
    rows = cursor.fetchall()

    if user["role"] != "ADMIN":
        for row in rows:
            row["employee_email"] = None
    return {"data": rows}


@router.get("/get_all_departments", tags=["Masters"])
def get_all_departments(conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    cursor.execute("SELECT department_id, department_name FROM departments WHERE is_deleted = 0 ORDER BY department_name")
    return {"data": cursor.fetchall()}


@router.get("/get_todo_statuses", tags=["Masters"])
def get_todo_statuses(conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    cursor.execute("SELECT todo_status_id, todo_status_name FROM todo_statuses WHERE is_deleted = 0 ORDER BY todo_status_id")
    return {"data": cursor.fetchall()}


@router.get("/get_all_priorities", tags=["Masters"])
def get_all_priorities(conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    cursor.execute("SELECT priority_id, priority_name FROM priorities WHERE is_deleted = 0 ORDER BY priority_id")
    return {"data": cursor.fetchall()}


# ---------------------------------------------------------------------------
# User administration
# ---------------------------------------------------------------------------

def check_department_and_manager(cursor, department_id, manager_id):
    if department_id is not None:
        cursor.execute("SELECT department_id FROM departments WHERE department_id = %s AND is_deleted = 0", (department_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="Department not found")
    if manager_id is not None:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s AND is_deleted = 0", (manager_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=400, detail="Manager not found")


@router.get("/users", tags=["Users"])
def list_users(conn=Depends(get_db), user=Depends(admin_user)):
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_id, name, email, role, department_id, manager_id, is_active, created_at
        FROM users
        WHERE is_deleted = 0
        ORDER BY name
    """)
    return {"data": cursor.fetchall()}


@router.post("/users", tags=["Users"])
def create_user(body: UserCreate, conn=Depends(get_db), user=Depends(admin_user)):
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE email = %s", (body.email,))
    if cursor.fetchone():
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    check_department_and_manager(cursor, body.department_id, body.manager_id)

    cursor.execute("""
        INSERT INTO users (name, email, password_hash, role, department_id, manager_id)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (body.name.strip(), body.email, hash_password(body.password), body.role, body.department_id, body.manager_id))
    new_user_id = cursor.lastrowid
    conn.commit()
    return {"data": {"user_id": new_user_id}}


@router.put("/users/{user_id}", tags=["Users"])
def update_user(body: UserUpdate, user_id: int = Path(...), conn=Depends(get_db), user=Depends(admin_user)):
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE user_id = %s AND is_deleted = 0", (user_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="User not found")

    # An administrator cannot lock themselves out
    if user_id == user["user_id"]:
        if body.is_active == 0:
            raise HTTPException(status_code=400, detail="You cannot disable your own account")
        if body.role == "USER":
            raise HTTPException(status_code=400, detail="You cannot remove your own administrator role")

    check_department_and_manager(cursor, body.department_id, body.manager_id)
    if body.manager_id == user_id:
        raise HTTPException(status_code=400, detail="A user cannot be their own manager")

    # Column names below are fixed in this function, never taken from the request
    changes = []
    values = []
    if body.name is not None:
        changes.append("name = %s")
        values.append(body.name.strip())
    if body.role is not None:
        changes.append("role = %s")
        values.append(body.role)
    if body.department_id is not None:
        changes.append("department_id = %s")
        values.append(body.department_id)
    if body.manager_id is not None:
        changes.append("manager_id = %s")
        values.append(body.manager_id)
    if body.is_active is not None:
        active_flag = 0
        if body.is_active:
            active_flag = 1
        changes.append("is_active = %s")
        values.append(active_flag)
    if body.password is not None:
        changes.append("password_hash = %s")
        values.append(hash_password(body.password))

    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")

    values.append(user_id)
    cursor.execute("UPDATE users SET " + ", ".join(changes) + " WHERE user_id = %s", values)
    conn.commit()
    return {"data": "User updated successfully"}
