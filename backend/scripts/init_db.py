"""Creates the tables, loads the seed data and creates the first administrator.

Usage (from the backend folder):
    python scripts/init_db.py
    python scripts/init_db.py --demo-users      # also adds three demo users (same password as the admin)

Reads ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD from the environment / .env. Running it again does not
change an existing administrator's password.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.db import open_connection  # noqa: E402

SCHEMA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "schema.sql")


def read_statements():
    lines = []
    with open(SCHEMA_FILE, "r", encoding="utf-8") as schema_file:
        for line in schema_file:
            if line.strip().startswith("--"):
                continue
            lines.append(line)

    statements = []
    for piece in "".join(lines).split(";"):
        if piece.strip() != "":
            statements.append(piece.strip())
    return statements


def create_user(cursor, name, email, password, role, department_name):
    cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
    if cursor.fetchone() is not None:
        print(f"User {email} already exists, left unchanged")
        return

    cursor.execute("SELECT department_id FROM departments WHERE department_name = %s", (department_name,))
    department = cursor.fetchone()
    department_id = None
    if department is not None:
        department_id = department["department_id"]

    cursor.execute(
        "INSERT INTO users (name, email, password_hash, role, department_id) VALUES (%s, %s, %s, %s, %s)",
        (name, email, hash_password(password), role, department_id),
    )
    print(f"Created {role} user {email}")


def main():
    admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    admin_name = os.getenv("ADMIN_NAME", "Administrator").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "")
    if admin_email == "" or len(admin_password) < 10:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) in the environment or .env first")
        sys.exit(1)

    conn = open_connection()
    try:
        cursor = conn.cursor()
        for statement in read_statements():
            cursor.execute(statement)
        conn.commit()
        print(f"Schema applied to database '{config.DB_NAME}'")

        create_user(cursor, admin_name, admin_email, admin_password, "ADMIN", "General")

        if "--demo-users" in sys.argv:
            create_user(cursor, "Asha Rao", "asha.rao@example.com", admin_password, "USER", "Operations")
            create_user(cursor, "Ben Carter", "ben.carter@example.com", admin_password, "USER", "Engineering")
            create_user(cursor, "Chen Wei", "chen.wei@example.com", admin_password, "USER", "Finance")

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
