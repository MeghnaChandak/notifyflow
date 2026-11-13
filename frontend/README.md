# NotifyFlow — frontend

React 18 + Vite + Ant Design 4 single-page app for the NotifyFlow API: sign in, manage To-Do tasks
(My Tasks, list, kanban, subtasks, subscribers, tags, comments, references, attachments),
configure rule-based notifications (Rules, Delivery Log, Groups) and read the in-app inbox (bell).

## Requirements

- Node.js 18+ (developed on Node 22) and npm
- The NotifyFlow API running (default `http://localhost:8190`) — see `../backend`

## Run

```bash
cd frontend
npm install
cp .env.example .env      # optional; only needed if the API is not on http://localhost:8190
npm run dev               # http://localhost:3100
```

Sign in with a user created on the backend. `ADMIN` sees everything; `USER` only the To-Do screens.

## Build

```bash
npm run build             # output in dist/
npm run preview           # serve the build locally
```

## Configuration

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `VITE_API_TARGET` | dev server only | `http://localhost:8190` | Where `/api/*` is proxied (the `/api` prefix is stripped) |

The app always calls the API under `/api` (REST) and `/api/ws/socket.io` (websocket). In production,
serve `dist/` from any static server and reverse-proxy `/api/` to the API with the prefix stripped and
websocket upgrade enabled, for example with nginx:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8190/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
location / {
    root /var/www/notifyflow;
    try_files $uri /index.html;
}
```

The JWT is kept in `localStorage` (`notifyflow_token`) and sent as `Authorization: Bearer <token>`.

## Layout

```
src/
  api.js                axios setup (baseURL, bearer token, 401 handling, handleGlobally errors)
  socket.js             socket.io client (token in the handshake)
  auth/                 AuthContext (login, roles, permissions), Login, ProtectedRoute
  layout/AppLayout.jsx  sidebar + header (bell, user, logout)
  components/           small shared helpers (debounce, search box, Excel export, employee picker, save-and-notify)
  features/todo/        My Tasks, list/kanban, create & edit pages, subtasks, subscribers, tags, references, attachments
  features/notification-settings/   Rules, Delivery Log, Groups, template drawer, condition editor
  features/notifications/           header bell (inbox)
API_CONTRACT.md         every endpoint the UI calls, with the fields it reads
```
