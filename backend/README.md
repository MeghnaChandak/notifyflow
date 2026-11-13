# NotifyFlow API

FastAPI + MySQL 8. REST endpoints plus a Socket.IO channel for live in-app notifications.

## Run

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env                       # fill in DB_*, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
./.venv/bin/python scripts/init_db.py      # creates tables, seed data and the first admin (safe to re-run)
./.venv/bin/python main.py                 # listens on 127.0.0.1:8190
```

Generate a secret: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
Interactive API docs are at http://127.0.0.1:8190/docs.

`init_db.py` applies [schema.sql](schema.sql); running it again only adds what is missing and never changes an existing admin's password. Add more users from the API (`POST /users`, admin only).

## Layout

```
main.py                         app + Socket.IO wiring, security headers, error handler
schema.sql                      all tables and seed data (statuses, priorities, departments, notification rules)
scripts/init_db.py              applies the schema, creates the first admin
app/config.py                   settings read from the environment / .env
app/db.py                       MySQL connections (one per request; background tasks open their own)
app/auth.py                     scrypt hashing, JWT, current_user / admin_user, login throttle
app/schemas.py                  request bodies and their validation
app/routes/                     auth, masters (+ user admin), todo, files, notification_settings, inbox
app/services/notifications.py   the engine: context loaders, conditions, placeholders, recipients, attachments, send
app/services/notification_settings.py   admin side: templates, groups, logs, test send
app/services/mailer.py          SMTP (or console) mail sending
app/services/realtime.py        Socket.IO server and the in-app inbox
```

## Endpoints (all need `Authorization: Bearer <token>` except `/login` and `/health`)

| Area | Endpoints |
|---|---|
| Auth | `POST /login`, `GET /me`, `POST /logout` |
| Masters | `GET /get_employees`, `/get_all_departments`, `/get_todo_statuses`, `/get_all_priorities` |
| Users (admin) | `GET /users`, `POST /users`, `PUT /users/{id}` |
| To-Do | `POST /todo_tasks`, `GET /get_todo_task_by_id`, `POST /create_todo_task`, `PUT /update_todo_task/{id}`, `DELETE /delete_todo_task/{id}` (admin), comments, subscribers, tags, links, attachments, `GET /get_my_tasks`, `GET /get_my_tasks_counts` |
| Files | `POST /upload_todo_attachment/{id}`, `GET /files/{id}/{name}` |
| Notification settings | `/notification_settings/...` modules, templates, groups, logs, field options (admin); preview, test_send, dispatch (people who may change the record) |
| Inbox | `GET /inbox`, `POST /inbox/mark_read`, `POST /inbox/mark_all_read`; Socket.IO event `inbox-notification` |

The Socket.IO path is `/ws/socket.io`; connect with `auth: { token }`.

## Behind a reverse proxy

The browser calls `/api/...` and the proxy strips `/api` before forwarding to this app; Socket.IO needs the upgrade headers. See the nginx example in [../frontend/README.md](../frontend/README.md). Set `FRONTEND_BASE_URL` to the public address of the UI (links in mails and the Socket.IO origin check use it).
