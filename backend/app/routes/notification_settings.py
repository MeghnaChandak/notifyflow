from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.auth import admin_user, current_user
from app.db import get_db
from app.routes.todo import can_write_todo, load_todo_for_access
from app.schemas import (
    AddNotificationGroup,
    AddNotificationTemplate,
    EditNotificationGroup,
    EditNotificationTemplate,
    NotificationPreviewRequest,
)
from app.services.notification_settings import (
    action_has_templates,
    delete_group,
    delete_template,
    list_employees,
    list_field_options,
    list_groups,
    list_logs,
    list_modules,
    list_templates,
    save_group,
    save_template,
    send_test_notifications,
)
from app.services.notifications import check_known_module, dispatch_notification, prepare_notifications

router = APIRouter()


def find_module_code(cursor, action_key):
    cursor.execute("""
        SELECT nm.module_code
        FROM notif_actions na
        JOIN notif_modules nm ON nm.module_id = na.module_id
        WHERE na.action_key = %s AND na.is_deleted = 0
    """, (action_key,))
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"no active action found for key {action_key}")
    return row["module_code"]


def require_record_access(cursor, user, action_key, module_key):
    """A user may preview or send notifications only for a record they may change.
    Administrators may for any record. Each module registers its own rule here."""
    module_code = find_module_code(cursor, action_key)
    check_known_module(module_code)
    if user["role"] == "ADMIN":
        return

    if module_code == "TODO":
        todo_row = load_todo_for_access(cursor, module_key)
        if not can_write_todo(cursor, user, todo_row):
            raise HTTPException(status_code=403, detail="Only the owner, assignee or creator can send notifications for this task")
        return

    raise HTTPException(status_code=403, detail="Administrator access is required")


@router.get("/notification_settings/modules", tags=["NotificationSettings"])
def get_notification_modules(conn=Depends(get_db), user=Depends(admin_user)):
    return {"data": list_modules(conn.cursor())}


@router.get("/notification_settings/action_has_templates", tags=["NotificationSettings"])
def get_action_has_templates(action_key: str, conn=Depends(get_db), user=Depends(current_user)):
    """Tells save screens whether to offer "Save & Notify" (is any template set up for this action)."""
    return {"data": {"has_templates": action_has_templates(conn.cursor(), action_key)}}


@router.post("/notification_settings/dispatch", tags=["NotificationSettings"])
def dispatch_notification_now(body: NotificationPreviewRequest, background_tasks: BackgroundTasks,
                              conn=Depends(get_db), user=Depends(current_user)):
    """The "Send" step of Save & Notify: queues the mail after the user confirmed the preview."""
    require_record_access(conn.cursor(), user, body.action_key, body.module_key)
    background_tasks.add_task(dispatch_notification, body.action_key, body.module_key, user["user_id"])
    return {"data": "Notification queued"}


@router.get("/notification_settings/field_options", tags=["NotificationSettings"])
def get_notification_field_options(module_code: str, field: str, conn=Depends(get_db), user=Depends(admin_user)):
    """Dropdown choices for one condition field of one module (empty list = free text)."""
    return {"data": list_field_options(conn.cursor(), module_code, field)}


@router.get("/notification_settings/templates", tags=["NotificationSettings"])
def get_notification_templates(action_id: int = 0, conn=Depends(get_db), user=Depends(admin_user)):
    return {"data": list_templates(conn.cursor(), action_id)}


@router.post("/notification_settings/add_template", tags=["NotificationSettings"])
def add_notification_template(template: AddNotificationTemplate, conn=Depends(get_db), user=Depends(admin_user)):
    template_id = save_template(conn.cursor(), user["user_id"], template, 0)
    conn.commit()
    return {"data": {"message": "Template added successfully", "template_id": template_id}}


@router.post("/notification_settings/modify_template", tags=["NotificationSettings"])
def modify_notification_template(template: EditNotificationTemplate, conn=Depends(get_db), user=Depends(admin_user)):
    save_template(conn.cursor(), user["user_id"], template, template.template_id)
    conn.commit()
    return {"data": {"message": "Template updated successfully"}}


@router.delete("/notification_settings/delete_template", tags=["NotificationSettings"])
def delete_notification_template(template_id: int, conn=Depends(get_db), user=Depends(admin_user)):
    delete_template(conn.cursor(), user["user_id"], template_id)
    conn.commit()
    return {"data": {"message": "Template deleted successfully"}}


@router.get("/notification_settings/groups", tags=["NotificationSettings"])
def get_notification_groups(conn=Depends(get_db), user=Depends(admin_user)):
    return {"data": list_groups(conn.cursor())}


@router.post("/notification_settings/add_group", tags=["NotificationSettings"])
def add_notification_group(group: AddNotificationGroup, conn=Depends(get_db), user=Depends(admin_user)):
    group_id = save_group(conn.cursor(), group, 0)
    conn.commit()
    return {"data": {"message": "Group added successfully", "group_id": group_id}}


@router.post("/notification_settings/modify_group", tags=["NotificationSettings"])
def modify_notification_group(group: EditNotificationGroup, conn=Depends(get_db), user=Depends(admin_user)):
    save_group(conn.cursor(), group, group.group_id)
    conn.commit()
    return {"data": {"message": "Group updated successfully"}}


@router.delete("/notification_settings/delete_group", tags=["NotificationSettings"])
def delete_notification_group(group_id: int, conn=Depends(get_db), user=Depends(admin_user)):
    delete_group(conn.cursor(), group_id)
    conn.commit()
    return {"data": {"message": "Group deleted successfully"}}


@router.get("/notification_settings/employees", tags=["NotificationSettings"])
def get_notification_employees(search_text: str = "", employee_ids: str = "", conn=Depends(get_db),
                               user=Depends(current_user)):
    """employee_ids is a comma-separated list of ids to look up; when given, search_text is ignored."""
    id_list = []
    for piece in employee_ids.split(","):
        if piece.strip():
            if not piece.strip().isdigit():
                raise HTTPException(status_code=400, detail="employee_ids must be numbers separated by commas")
            id_list.append(int(piece.strip()))

    return {"data": list_employees(conn.cursor(), search_text, id_list)}


@router.get("/notification_settings/logs", tags=["NotificationSettings"])
def get_notification_logs(module_code: str = "", module_key: str = "", status: str = "", client_id: int = 0,
                          page: int = 1, page_size: int = 50, conn=Depends(get_db), user=Depends(admin_user)):
    # client_id is accepted for older screens and ignored: this product has no clients
    return {"data": list_logs(conn.cursor(), module_code, module_key, status, page, page_size)}


@router.get("/notification_settings/module_attachments", tags=["NotificationSettings"])
def get_notification_module_attachments(module_code: str, entity_id: int, tag: str, user=Depends(admin_user)):
    """Tagged attachments of a record. The To-Do module has none, so this is always an empty list."""
    return {"data": []}


@router.post("/notification_settings/preview", tags=["NotificationSettings"])
def preview_notifications(body: NotificationPreviewRequest, conn=Depends(get_db), user=Depends(current_user)):
    """Shows what an action would send for a real record (who gets what), without sending."""
    require_record_access(conn.cursor(), user, body.action_key, body.module_key)

    results, problem = prepare_notifications(conn, body.action_key, body.module_key, user["user_id"], None)
    if problem:
        raise HTTPException(status_code=404, detail=problem)

    # Attachment bytes cannot be sent as JSON, so only the file names are shown
    for result in results:
        attachment_names = []
        for attachment in result["attachments"]:
            attachment_names.append(attachment["filename"])
        result["attachments"] = attachment_names

    return {"data": results}


@router.post("/notification_settings/test_send", tags=["NotificationSettings"])
def test_send_notifications(body: NotificationPreviewRequest, conn=Depends(get_db), user=Depends(current_user)):
    """Like preview, but also emails the result to the logged-in person only."""
    require_record_access(conn.cursor(), user, body.action_key, body.module_key)
    return {"data": send_test_notifications(conn, body.action_key, body.module_key, user["user_id"])}
