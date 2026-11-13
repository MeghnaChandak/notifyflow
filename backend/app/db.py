import pymysql
import pymysql.cursors

from app import config


def open_connection():
    """A new connection that returns rows as dicts. The caller commits and closes it."""
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=5,
    )


def get_db():
    """Request scoped connection. Background tasks must open their own with open_connection(),
    because this one is closed when the response is sent."""
    conn = open_connection()
    try:
        yield conn
    finally:
        conn.close()
