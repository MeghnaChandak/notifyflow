# NotifyFlow frontend — API contract

Every endpoint the frontend calls. Source of truth for reconciling the backend.

- **Base URL:** axios `baseURL` is `/api`. The Vite dev proxy (and a production reverse proxy) strips `/api` and forwards to the API (default `http://localhost:8190`), websocket upgrade included. The API itself therefore sees paths like `/login`, `/get_my_tasks`, `/ws/socket.io`.
- **Auth:** `POST /login` once; every other request carries `Authorization: Bearer <jwt>`. A `401` on any call other than `/login` clears the session and returns to `/login`.
- **Errors:** the UI reads `err.response.data.detail` when it is a **string** (400/401/403/404/409/500). A `422` is shown as a generic schema error (FastAPI list format is not parsed).
- **Success envelope:** unless noted, `{"data": ...}` (the UI also tolerates a bare body).
- **Roles:** `ADMIN` or `USER`. UI rules: ADMIN sees Notification Settings and can delete tasks and see "All tasks"; USER can only use To-Do (no Notification Settings, no delete, no "All tasks"). The backend must enforce this too — the UI hiding is cosmetic.
- **Front-end routes** (needed for `{{record_link}}`): To-Do edit page is **`/todo/edit/:id`** (`:id` = `todo_id`); create page `/todo/create`; list `/todo?view=list`; My Tasks `/`; Notification Settings `/notification-settings`.

Notes: rows marked NEW were added for NotifyFlow; the rest are the standard To-Do and Notification Settings endpoints.

---

## 1. Auth

| Method | Path | Request | Response consumed | Where |
|---|---|---|---|---|
| POST | `/login` | JSON `{email, password}` | `{token, user: {employee_id, name, email, role}}` | NEW |

Socket.IO: client connects to path `/api/ws/socket.io` (API side `/ws/socket.io`) with handshake `auth: {token: <jwt>}` (no `Bearer `). Server joins the socket to the user's room itself. The client emits nothing.

## 2. Master data (all `GET`, JWT required)

| Path | Response `data` items — fields the UI reads | Notes |
|---|---|---|
| `/get_employees` | `employee_id`, `employee_name` (also `employee_email` is tolerated, not required) | Active employees/users. Loaded once after login (pickers for owner/assignee/subscribers/filters). |
| `/get_all_departments` | `department_id`, `department_name` | Used as "Team". May be a short seed list. |
| `/get_todo_statuses` | `todo_status_id`, `todo_status_name` | **Seed these exact names** (code compares by name): `New`(1), `Assigned`(2), `In Progress`(3), `Blocked`(4), `Resolved`(5), `Closed`(6). Ids 1–6 are also a fallback map in `todoApi.js`. |
| `/get_all_priorities` | `priority_id`, `priority_name` | Seed: `0 NA`, `1 Low`, `2 Medium`, `3 High` (UI colours by id 0–3; "NA" is matched by name). |

## 3. To-Do

| Method | Path | Params / body | Response fields consumed |
|---|---|---|---|
| POST | `/todo_tasks` | body = filters `{TITLE, TODO_CODE, PARENT_TODO:[id], OWNER:[ids], ASSIGNED_TO:[ids], CREATED_BY:[ids], TARGET_DATE:[from,to], DEPARTMENT, TERM_TYPE, STATUS, PRIORITY}` (all optional); query `page, apply_limit, page_multiplier, top_level_only, actions_only, filter_code` (`DEFAULT`/`ALL`) | `data` (array) or `data.todos`; top-level `total_count`. Each todo: see "Todo object". |
| GET | `/get_todo_task_by_id` | `todo_id` | `data` = Todo object plus `comments[]`, `subscribers[]`, `links[]`, `attachments[]`, `transactions[]`, `parent_todo` |
| POST | `/create_todo_task` | `{title, description, todo_status_id, todo_priority_id, term_type, target_date, owner_id, department_id, assigned_date, is_private, assigned_to_id, parent_todo_id, attachments?, subscribers?, comments?}` | `data.todo_id` (+ Todo fields) |
| PUT | `/update_todo_task/{todo_id}` | same body as create | `data` (Todo) |
| DELETE | `/delete_todo_task/{todo_id}` | – | status only |
| GET | `/search_todo_tasks` | `search_text` | `data[]`: `todo_id, title, todo_code, department_id, is_private, ref_no?` |
| GET | `/get_todo_subtasks` | `parent_todo_id` | `data[]` Todo objects |
| GET | `/get_my_tasks` | `tab` (`assigned_to_me`,`assigned_by_me`,`owner`,`team`,`all`), `view_as_user_id?` | `data`: `{overdue[], due_this_week[], later[], no_due_date[], completed_today[], audit[]}`. Each bucket item is a Todo object with `links: [{module, ref, id, url?}]`; `audit` rows (tab `assigned_by_me`): `todo_id, title, target_date, todo_status_name, assigned_to_name, …`. Tab `my_employees` is no longer requested. |
| GET | `/get_my_tasks_counts` | – | `data`: `{assigned_to_me, assigned_by_me, owner, team, all}` |
| POST | `/add_todo_comment` | `{todo_id, comment}` | status only |
| POST | `/add_subscribers` | `{todo_id, subscriber_id}` | status only |
| POST | `/remove_subscribers` | `{todo_id, subscriber_id}` | status only |
| POST | `/set_todo_tags` | `{todo_id, tags: [str]}` | status only |
| POST | `/add_todo_attachment` | `{todo_id, attachments: [{url, name, file_name?, object_name?, …}]}` — **replaces** the whole list (the UI sends the remaining list when removing) | status only |
| POST | `/add_todo_link` | `{todo_id, module_name, module_ref, title, url}` | `data.link_id`. **`url`** (optional, `http(s)` only): stored in the nullable `url` column of `todo_links`. `module_name` is a free-text label (≤ 50 chars). `module_record_id` may be sent by the bulk form as `module_id`/null. |
| POST | `/remove_todo_link` | `{todo_id, link_id, module_name, module_ref}` | status only |

**Todo object fields read:** `todo_id, todo_code, parent_todo_id, parent_title, parent_assigned_to_name, title, description, todo_status_id, todo_status_name, todo_priority_id, term_type, target_date, owner_id, owner_name, assigned_to_id, assigned_to_name, department_id, department_name, created_by, created_by_name, created_time|created_at, updated_time|updated_at, assigned_date, is_private, expected_duration_days?, links[{link_id, module_name, module_ref, title, url}]` (get-by-id) or `links[{module, ref, id, url}]` (my-tasks), `comments[{comment_id|temp_id, comment, created_by, created_by_name, created_time}]`, `subscribers[{subscriber_id, …name}]`, `attachments[{url, name}]`, `transactions[]` (history rows with `change_json`).

### File upload — NEW

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/upload_todo_attachment/{todo_id}` | multipart form: `file`, `todo_id` | any 2xx; UI reloads the todo afterwards | Should append `{url, name}` to the task's attachments. Max 10 MB (enforced client side too). `url` = full `http(s)` address **or** a path relative to the API root (e.g. `/files/abc.pdf`, no `/api`); relative ones are fetched with the bearer token and opened as a blob, so the file endpoint must accept the `Authorization` header. |

## 4. Notification Settings (ADMIN only in the UI)

| Method | Path | Params / body | Response fields consumed |
|---|---|---|---|
| GET | `/notification_settings/modules` | – | `data[]`: `module_id, module_code, module_name, fields[{value,label,has_options}], roles[{value,label}], actions[{action_id, module_id, action_code, action_key, name}]` |
| GET | `/notification_settings/field_options` | `module_code, field` | `data[]`: `{value, label}` |
| GET | `/notification_settings/templates` | `action_id` (0 = all) | `data[]`: `template_id, action_id, action_key, action_name, module_code, module_name, template_name, channel, subject, body, recipients[{send_as,type,value,value_label?,condition}], attachments[], condition, stop_on_match, is_fallback, exclude_actor` |
| POST | `/notification_settings/add_template` | `{action_id, template_name, subject, body, recipients, attachments, condition, stop_on_match, is_fallback, exclude_actor}` | status |
| POST | `/notification_settings/modify_template` | same + `template_id` | status |
| DELETE | `/notification_settings/delete_template` | `template_id` | status |
| GET | `/notification_settings/groups` | – | `data[]`: `group_id, group_code, group_name, employee_ids[], members[{employee_id, employee_name, email}]` |
| POST | `/notification_settings/add_group` | `{group_code, group_name, employee_ids}` | status |
| POST | `/notification_settings/modify_group` | same + `group_id` | status |
| DELETE | `/notification_settings/delete_group` | `group_id` | status |
| GET | `/notification_settings/employees` | `search_text?`, `employee_ids?` | `data[]`: `{employee_id, employee_name, email}` (the UI shows "name (email)"; a missing email shows "no email") |
| GET | `/notification_settings/logs` | `module_code, module_key, status, page, page_size` (`client_id` is no longer sent; default 0 is fine) | `data: {rows[], total}`; row: `log_id, created_time, module_code, action_key, module_key, template_name, to_list, cc_list, bcc_list, subject, body, status, error, attachments_list?` |
| POST | `/notification_settings/preview` | `{action_key, module_key}` | `data[]`: `template_id, template_name, status (READY|SKIPPED), error, to_emails[], cc_emails[], bcc_emails[], subject, body` |
| POST | `/notification_settings/test_send` | `{action_key, module_key}` | `data: {sent_to, mails_sent}` |
| POST | `/notification_settings/dispatch` | `{action_key, module_key}` | status (used by "Send" after Save & Notify; action key `TODO_CREATE`) |

Used by the To-Do forms: after saving a task, "Save & Notify" calls `/notification_settings/preview` then `/notification_settings/dispatch` with `action_key = "TODO_CREATE"` and `module_key = todo_id`.

## 5. In-app inbox (the header bell) — NEW

| Method | Path | Params / body | Response |
|---|---|---|---|
| GET | `/inbox` | `limit=30`, `unread_only=false` | `{"data": [{inbox_id, title, message, module_code, module_key, is_read (0/1), created_time}], "unread_count": n}` |
| POST | `/inbox/mark_read` | `{inbox_ids: [1,2]}` | `{"data": "ok"}` |
| POST | `/inbox/mark_all_read` | – | `{"data": "ok"}` |

Realtime: socket.io event **`inbox-notification`**, payload `{inbox_id, title, message, module_code, module_key, created_time}`. The client prepends it, bumps the unread count and shows a toast. Clicking an item marks it read; `module_code == "TODO"` with `module_key = todo_id` opens `/todo/edit/<todo_id>`.

