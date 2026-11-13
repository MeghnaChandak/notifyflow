# notifyflow
Rules-based notification engine: event-driven triggers, conditional routing, templated messages, recipient groups, and a delivery log.

NotifyFlow is a standalone web app made of two parts:

| Part | Folder | Stack | Default port |
|---|---|---|---|
| API | [backend](backend) | Python 3.10+, FastAPI, MySQL 8, Socket.IO | 8190 |
| Web UI | [frontend](frontend) | React 18, Ant Design 4, Vite | 3100 |

What it does:

- **To-Do tasks**: tasks with subtasks (actions), owner / assignee / subscribers, tags, comments, change history, file attachments, links to outside records, and a "My Tasks" view with overdue / this week / later buckets.
- **Notification rules**: an admin decides, without code, who is told what when something happens. A rule has a subject and body with `{{placeholders}}`, recipients (a person, a group, or a role such as *task owner*), an optional "only when" condition (e.g. `priority in High, Critical`), optional attachments, and flags (stop on match, fallback, exclude the person who did it).
- **Preview and test**: see exactly who would get which mail before anything is sent; send a `[TEST]` copy to yourself only.
- **Delivery log**: every rule tried on every action, as SENT / FAILED / SKIPPED with the reason.
- **In-app bell**: the same notifications appear live in the app (Socket.IO) as well as by mail.

## Quick start

You need Python 3.10+, Node 18+, and a MySQL 8 server.

```bash
# 1. Database (any MySQL 8). To start one with Docker on port 3306:
MYSQL_ROOT_PASSWORD='<choose>' MYSQL_PASSWORD='<choose>' docker compose up -d
# or create the database yourself:
#   CREATE DATABASE notifyflow CHARACTER SET utf8mb4;
#   CREATE USER 'notifyflow'@'%' IDENTIFIED BY '<password>';
#   GRANT ALL ON notifyflow.* TO 'notifyflow'@'%';

# 2. API
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then edit: DB_*, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
./.venv/bin/python scripts/init_db.py --demo-users   # tables, seed data, first admin (+ 3 demo users)
./.venv/bin/python main.py                           # http://127.0.0.1:8190

# 3. Web UI (new terminal)
cd frontend
npm install
npm run dev                                          # http://localhost:3100
```

Open http://localhost:3100 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
With `MAIL_MODE=console` (the default) mails are written to the API log instead of being sent, so you can try everything without an SMTP server. Set `MAIL_MODE=smtp` and the `SMTP_*` values to send real mail.

`--demo-users` creates `asha.rao@example.com`, `ben.carter@example.com` and `chen.wei@example.com` with the admin's password. Leave the flag out in production.

## How a notification flows

```
user saves a task ──► "Save & Notify" ──► POST /notification_settings/preview   (who gets what, nothing sent)
                                      └─► POST /notification_settings/dispatch  (after the user confirms)
                                                │ background task, own DB connection
                                                ▼
        load the record's values and roles ─► for each rule of the action, in order:
          condition true? ─► resolve recipients (person / group / role) ─► fill {{placeholders}}
          ─► send mail ─► write notif_logs ─► add to each recipient's in-app inbox ─► push over Socket.IO
```

The engine lives in [backend/app/services/notifications.py](backend/app/services/notifications.py).

## Adding another module (tickets, orders, ...)

The engine is not tied to To-Do. To make a new module raise notifications:

1. In `notifications.py`, write a `load_<module>_context(conn, record_id)` that returns `{"values": {...}, "roles": {...}}` (values feed `{{placeholders}}` and conditions; roles map a name such as `REQUESTER` to a user id or a list of ids), and add the module to `MODULES` with its list of fields and roles (these fill the admin screens).
2. Add the page path to `RECORD_LINK_PATHS` so `{{record_link}}` works.
3. Insert a row into `notif_modules` and one per event into `notif_actions` (see the To-Do seed in [backend/schema.sql](backend/schema.sql)).
4. Where the event happens, queue `dispatch_notification("<ACTION_KEY>", record_id, user_id)` as a background task.
5. Register an access rule for the module in `require_record_access` ([backend/app/routes/notification_settings.py](backend/app/routes/notification_settings.py)) so only people allowed to change a record can notify about it.

## Security notes

Built with the OWASP ASVS / Top 10 in mind:

- Passwords are stored as scrypt hashes; login is rate limited per email and per address and gives the same answer and timing for an unknown email and a wrong password.
- Tokens are signed JWTs (HS256, pinned algorithm, expiry). The user and role are re-read from the database on every request, so disabling an account or changing a role takes effect at once. The API refuses to start without a `SECRET_KEY` of at least 32 characters.
- Every endpoint requires a login; notification settings, user management and "all tasks" require the ADMIN role, enforced on the server (the UI only hides things). Private tasks and file downloads are checked per record.
- All SQL uses parameters; the only text put into SQL comes from fixed lists in the code. Filter and column names are never taken from the request.
- Mail templates are plain text replacement, never evaluated. Header injection (line breaks in subject or addresses) is refused.
- Template attachments fetched from a URL go through an SSRF guard: http/https only, optional host allow-list (`ATTACHMENT_ALLOWED_HOSTS`), public addresses only, no redirects, size cap.
- Uploads: size limit, random stored names, sanitised file names, served only as downloads with `nosniff`, and only to people who may read the task.
- Links stored on a task must be `http(s)://`; attachment links must be `http(s)://` or one of this app's own `/files/` paths (no `javascript:`).
- Socket.IO connections must present a valid token and are placed in the user's own room by the server; a client cannot ask for someone else's.
- Errors return a generic message; details go to the server log only. Responses carry `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Cache-Control: no-store`.

Before going live, also: serve everything over HTTPS (terminate TLS at your reverse proxy), add a `Content-Security-Policy` header there, put the API behind that proxy only (it listens on 127.0.0.1), keep `.env` out of version control, back up the database and the `uploads/` folder, and run the API under a process manager. Known limits: the login throttle is in memory (one server process); the JWT is kept in browser storage, so a CSP and dependency hygiene matter; there is no token revocation list (disable the user instead).

## Folders

```
backend/    FastAPI app: app/routes (HTTP), app/services (engine, mail, realtime), schema.sql, scripts/
frontend/   React app: src/features/todo, src/features/notification-settings, src/features/notifications
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for details.
