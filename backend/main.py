import asyncio

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from uvicorn import run

from app import config
from app.auth import check_secret_key
from app.routes import auth, files, inbox, masters, notification_settings, todo
from app.services import realtime

check_secret_key()

api = FastAPI(title="NotifyFlow API")

# The UI is normally served from the same origin (dev proxy / nginx), so CORS is only opened for listed origins
if config.CORS_ORIGINS:
    api.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )


@api.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


@api.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    # The real error goes to the log; the caller only gets a generic message
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@api.on_event("startup")
async def remember_event_loop():
    realtime.set_main_loop(asyncio.get_running_loop())


api.include_router(auth.router)
api.include_router(masters.router)
api.include_router(todo.router)
api.include_router(files.router)
api.include_router(notification_settings.router)
api.include_router(inbox.router)


@api.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# Socket.IO is served under /ws (the browser reaches it as /api/ws/socket.io through the proxy).
# It wraps the REST app instead of being mounted inside it, so both see the paths they expect.
app = socketio.ASGIApp(realtime.sio, other_asgi_app=api, socketio_path="ws/socket.io")

if __name__ == "__main__":
    logger.info("Starting NotifyFlow API")
    run("main:app", host="127.0.0.1", port=8190, reload=False)
