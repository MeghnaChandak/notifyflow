import os

from dotenv import load_dotenv

load_dotenv()


def read_int(name, default):
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return int(value)


def read_text(name, default):
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def read_list(name):
    value = os.getenv(name)
    items = []
    if value is None:
        return items
    for piece in value.split(","):
        if piece.strip() != "":
            items.append(piece.strip())
    return items


# Database (MySQL 8)
DB_HOST = read_text("DB_HOST", "127.0.0.1")
DB_PORT = read_int("DB_PORT", 3306)
DB_USER = read_text("DB_USER", "notifyflow")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = read_text("DB_NAME", "notifyflow")

# Auth. SECRET_KEY must be set; the app refuses to start without a long random value.
SECRET_KEY = os.getenv("SECRET_KEY", "")
TOKEN_EXPIRE_MINUTES = read_int("TOKEN_EXPIRE_MINUTES", 480)
LOGIN_MAX_FAILURES = read_int("LOGIN_MAX_FAILURES", 5)
LOGIN_LOCK_MINUTES = read_int("LOGIN_LOCK_MINUTES", 15)

# CORS: comma separated origins. Leave empty when the UI is served from the same origin (nginx / Vite proxy).
CORS_ORIGINS = read_list("CORS_ORIGINS")

# Public URL of the web UI, used for {{record_link}} in mails
FRONTEND_BASE_URL = read_text("FRONTEND_BASE_URL", "http://localhost:3100")

# Mail. MAIL_MODE=console only logs the mail (good for demos); MAIL_MODE=smtp really sends it.
MAIL_MODE = read_text("MAIL_MODE", "console")
SMTP_HOST = read_text("SMTP_HOST", "localhost")
SMTP_PORT = read_int("SMTP_PORT", 587)
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_TLS = read_text("SMTP_USE_TLS", "true").lower() == "true"
MAIL_FROM = read_text("MAIL_FROM", "notifyflow@example.com")

# Mail attachments fetched from a URL. When ATTACHMENT_ALLOWED_HOSTS is set, only those hosts are allowed.
ATTACHMENT_ALLOWED_HOSTS = read_list("ATTACHMENT_ALLOWED_HOSTS")
ATTACHMENT_MAX_BYTES = read_int("ATTACHMENT_MAX_BYTES", 10 * 1024 * 1024)

# Files attached to to-dos
UPLOAD_DIR = read_text("UPLOAD_DIR", "uploads")
UPLOAD_MAX_BYTES = read_int("UPLOAD_MAX_BYTES", 10 * 1024 * 1024)
