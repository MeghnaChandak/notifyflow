import json
import os
import re
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app import config
from app.db import get_db
from app.auth import current_user
from app.routes.todo import require_read, require_write

router = APIRouter()

STORED_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$")


def safe_file_name(name):
    """The file name without any folder part, limited to harmless characters."""
    if name is None:
        name = ""
    base_name = os.path.basename(name.replace("\\", "/"))
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base_name).strip(" .")
    if cleaned == "":
        cleaned = "file"
    return cleaned[:100]


def todo_folder(todo_id):
    return os.path.join(os.path.abspath(config.UPLOAD_DIR), str(int(todo_id)))


@router.post("/upload_todo_attachment/{todo_id}", tags=["TodoTask"])
def upload_todo_attachment(todo_id: int, file: UploadFile = File(...), conn=Depends(get_db), user=Depends(current_user)):
    """Stores one file for a to-do and appends {url, name} to the task's attachment list."""
    cursor = conn.cursor()
    require_write(cursor, user, todo_id)

    content = file.file.read(config.UPLOAD_MAX_BYTES + 1)
    if len(content) > config.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File is larger than {config.UPLOAD_MAX_BYTES // (1024 * 1024)} MB")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    original_name = safe_file_name(file.filename)
    stored_name = uuid.uuid4().hex[:12] + "_" + original_name
    folder = todo_folder(todo_id)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, stored_name), "wb") as saved_file:
        saved_file.write(content)

    cursor.execute("SELECT attachments FROM todo_tasks WHERE todo_id = %s", (todo_id,))
    row = cursor.fetchone()
    attachments = []
    if row and row["attachments"]:
        attachments = json.loads(row["attachments"])
    attachments.append({"url": f"/files/{todo_id}/{stored_name}", "name": original_name})
    cursor.execute("UPDATE todo_tasks SET attachments = %s WHERE todo_id = %s", (json.dumps(attachments), todo_id))
    conn.commit()

    return {"data": {"url": f"/files/{todo_id}/{stored_name}", "name": original_name}}


@router.get("/files/{todo_id}/{stored_name}", tags=["TodoTask"])
def download_todo_attachment(todo_id: int, stored_name: str, conn=Depends(get_db), user=Depends(current_user)):
    """Sends an uploaded file to someone who may read the task. Always as a download, never rendered by the browser."""
    cursor = conn.cursor()
    require_read(cursor, user, todo_id)

    if not STORED_NAME_PATTERN.match(stored_name):
        raise HTTPException(status_code=404, detail="File not found")
    path = os.path.join(todo_folder(todo_id), stored_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")

    # The name shown to the user is the original one, without the random prefix
    download_name = stored_name.split("_", 1)[-1]
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=download_name,
        headers={"X-Content-Type-Options": "nosniff"},
    )
