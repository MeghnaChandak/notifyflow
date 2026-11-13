import json
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Path
from loguru import logger

from app.auth import admin_user, current_user
from app.db import get_db
from app.schemas import Attachments, Links, Subscribers, TodoMailer, TodoTags, TodoTask, UpdateTodoComment
from app.services.notifications import dispatch_notification

router = APIRouter()

CLOSED_PARENT_STATUSES = ("Resolved", "Blocked", "Closed")

# Filters of the To-Do list screen. "condition" is the SQL column, always taken from this list and
# never from the request, and filter values always travel as query parameters.
TODO_FILTERS = {
    "TODO_CODE": {"id": 1, "condition": "tt.todo_code", "type": "input", "options_query": "", "options": []},
    "TITLE": {"id": 2, "condition": "tt.title", "type": "input", "options_query": "", "options": []},
    "STATUS": {
        "id": 3, "condition": "tt.todo_status_id", "type": "select", "options": [],
        "options_query": "SELECT todo_status_id AS value, todo_status_name AS label FROM todo_statuses WHERE is_deleted = 0",
    },
    "PRIORITY": {
        "id": 4, "condition": "tt.todo_priority_id", "type": "select", "options": [],
        "options_query": "SELECT priority_id AS value, priority_name AS label FROM priorities WHERE is_deleted = 0",
    },
    "TERM_TYPE": {
        "id": 5, "condition": "tt.term_type", "type": "hardcoded_select", "options_query": "",
        "options": [
            {"value": "Short Term", "label": "Short Term"},
            {"value": "Medium Term", "label": "Medium Term"},
            {"value": "Long Term", "label": "Long Term"},
        ],
    },
    "OWNER": {
        "id": 6, "condition": "tt.owner_id", "type": "multi_select", "options": [],
        "options_query": "SELECT user_id AS value, name AS label FROM users WHERE is_active = 1 AND is_deleted = 0",
    },
    "DEPARTMENT": {
        "id": 7, "condition": "tt.department_id", "type": "select", "options": [],
        "options_query": "SELECT department_id AS value, department_name AS label FROM departments WHERE is_deleted = 0",
    },
    "CREATED_BY": {
        "id": 8, "condition": "tt.created_by", "type": "multi_select", "options": [],
        "options_query": "SELECT user_id AS value, name AS label FROM users WHERE is_active = 1 AND is_deleted = 0",
    },
    "TARGET_DATE": {"id": 9, "condition": "tt.target_date", "type": "date_range", "options_query": "", "options": []},
    "ASSIGNED_DATE": {"id": 10, "condition": "tt.assigned_date", "type": "date_range", "options_query": "", "options": []},
    "IS_PRIVATE": {
        "id": 11, "condition": "tt.is_private", "type": "hardcoded_select", "options_query": "",
        "options": [{"value": "1", "label": "Yes"}, {"value": "0", "label": "No"}],
    },
    "SUBSCRIBER": {
        "id": 12, "condition": "", "type": "multi_select", "options": [],
        "options_query": "SELECT user_id AS value, name AS label FROM users WHERE is_active = 1 AND is_deleted = 0",
    },
    "ASSIGNED_TO": {
        "id": 13, "condition": "tt.assigned_to_id", "type": "multi_select", "options": [],
        "options_query": "SELECT user_id AS value, name AS label FROM users WHERE is_active = 1 AND is_deleted = 0",
    },
    "PARENT_TODO": {"id": 14, "condition": "tt.parent_todo_id", "type": "multi_select", "options_query": "", "options": []},
}

# The columns every task list shows
TODO_SELECT = """
    SELECT tt.*,
        owner.name AS owner_name,
        assigned.name AS assigned_to_name,
        creator.name AS created_by_name,
        updater.name AS updated_by_name,
        mts.todo_status_name,
        mtp.priority_name,
        md.department_name AS department_name,
        parent.title AS parent_title,
        parent.todo_code AS parent_code
    FROM todo_tasks tt
    LEFT JOIN todo_tasks parent ON tt.parent_todo_id = parent.todo_id
    LEFT JOIN users owner ON tt.owner_id = owner.user_id
    LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
    LEFT JOIN users creator ON tt.created_by = creator.user_id
    LEFT JOIN users updater ON tt.updated_by = updater.user_id
    LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
    LEFT JOIN priorities mtp ON tt.todo_priority_id = mtp.priority_id
    LEFT JOIN departments md ON tt.department_id = md.department_id
"""

# "The user has to do with this task": owner, assignee, creator or subscriber. Uses the %s placeholder 4 times.
RELATED_TO_USER = """(
    tt.owner_id = %s OR tt.assigned_to_id = %s OR tt.created_by = %s
    OR EXISTS (
        SELECT 1 FROM todo_subscribers ats
        WHERE ats.todo_id = tt.todo_id AND ats.subscriber_id = %s AND ats.is_deleted = 0
    )
)"""


def related_params(user_id):
    return [user_id, user_id, user_id, user_id]


# ---------------------------------------------------------------------------
# Access rules
# ---------------------------------------------------------------------------

def load_todo_for_access(cursor, todo_id):
    """The columns the access rules need, or 404 when the task does not exist."""
    cursor.execute(
        "SELECT todo_id, owner_id, assigned_to_id, created_by, is_private, parent_todo_id "
        "FROM todo_tasks WHERE todo_id = %s AND is_deleted = 0",
        (todo_id,),
    )
    todo_row = cursor.fetchone()
    if not todo_row:
        raise HTTPException(status_code=404, detail="Todo Task not found")
    return todo_row


def is_subscriber(cursor, todo_id, user_id):
    cursor.execute(
        "SELECT 1 FROM todo_subscribers WHERE todo_id = %s AND subscriber_id = %s AND is_deleted = 0",
        (todo_id, user_id),
    )
    return cursor.fetchone() is not None


def can_write_todo(cursor, user, todo_row):
    """Administrators, and the owner, assignee or creator of the task."""
    if user["role"] == "ADMIN":
        return True
    user_id = user["user_id"]
    if todo_row["owner_id"] == user_id or todo_row["assigned_to_id"] == user_id or todo_row["created_by"] == user_id:
        return True
    return False


def can_read_todo(cursor, user, todo_row):
    """Anyone can read a task that is not private; a private task only its people."""
    if not todo_row["is_private"]:
        return True
    if can_write_todo(cursor, user, todo_row):
        return True
    return is_subscriber(cursor, todo_row["todo_id"], user["user_id"])


def require_read(cursor, user, todo_id):
    todo_row = load_todo_for_access(cursor, todo_id)
    if not can_read_todo(cursor, user, todo_row):
        raise HTTPException(status_code=403, detail="You do not have access to this task")
    return todo_row


def require_write(cursor, user, todo_id):
    todo_row = load_todo_for_access(cursor, todo_id)
    if not can_write_todo(cursor, user, todo_row):
        raise HTTPException(status_code=403, detail="Only the owner, assignee or creator can change this task")
    return todo_row


def visible_clause(user):
    """SQL + params that limit a list to the tasks the user may see (admins see everything)."""
    if user["role"] == "ADMIN":
        return "1=1", []
    return "(tt.is_private = 0 OR " + RELATED_TO_USER + ")", related_params(user["user_id"])


def check_user_exists(cursor, user_id, label):
    cursor.execute("SELECT user_id FROM users WHERE user_id = %s AND is_active = 1 AND is_deleted = 0", (user_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=400, detail=f"{label} not found")


def check_lookup_exists(cursor, table, id_column, value, label):
    # table and id_column are fixed names from this file, never request data
    cursor.execute(f"SELECT {id_column} FROM {table} WHERE {id_column} = %s AND is_deleted = 0", (value,))
    if not cursor.fetchone():
        raise HTTPException(status_code=400, detail=f"{label} not found")


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

@router.get("/todo_task_get_queries", tags=["TodoTask"])
def get_queries(user=Depends(current_user)):
    data = {}
    for name, item in TODO_FILTERS.items():
        data[name] = {
            "id": item["id"],
            "join": "",
            "condition": item["condition"],
            "variables": [],
            "type": item["type"],
            "format": "",
            "show": True,
            "scope": "",
            "scope_column": "",
            "append": "where",
            "search_type": "normal",
            "options": item["options"],
        }
    return {"data": data}


@router.post("/todo_task/execute_query", tags=["TodoTask"])
def execute_query(parameter: str, variables: List = Body(default=[]), conn=Depends(get_db), user=Depends(current_user)):
    """Dropdown choices of one filter. Only the fixed query of a known filter runs; variables are ignored."""
    item = TODO_FILTERS.get(parameter)
    if item is None:
        raise HTTPException(status_code=400, detail=f"Unknown filter: {parameter}")
    if item["options_query"] == "":
        return {"data": []}

    cursor = conn.cursor()
    cursor.execute(item["options_query"])
    return {"data": cursor.fetchall()}


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------

@router.post("/todo_tasks", tags=["TodoTask"])
def todo_tasks(
        query: dict = Body(...),
        page: int = 1,
        apply_limit: bool = True,
        page_multiplier: int = 10,
        top_level_only: bool = False,
        for_export: bool = False,
        actions_only: bool = False,
        filter_code: str = "DEFAULT",
        conn=Depends(get_db),
        user=Depends(current_user),
):
    """top_level_only=true leaves out subtasks (use /get_todo_subtasks for those).
    actions_only=true returns only subtasks (actions).
    filter_code=ALL (administrators only) lists every todo; otherwise only the todos related to the user.
    for_export=true returns every match with each parent's subtasks right after it."""
    user_id = user["user_id"]

    if page < 1 or page_multiplier < 1 or page_multiplier > 500:
        raise HTTPException(status_code=400, detail="page must be 1 or more and page_multiplier between 1 and 500")

    cursor = conn.cursor()
    offset = (page - 1) * page_multiplier

    filters = {}
    for key, value in query.items():
        if value is not None and value != "" and value != []:
            filters[key] = value

    where_text = " WHERE 1=1"
    where_values = []

    for key, value in filters.items():
        if key not in TODO_FILTERS:
            raise HTTPException(status_code=400, detail=f"Unknown filter: {key}")
        item = TODO_FILTERS[key]

        if key == "SUBSCRIBER":
            subscriber_values = value
            if not isinstance(subscriber_values, list):
                subscriber_values = [subscriber_values]
            placeholders = ",".join(["%s"] * len(subscriber_values))
            where_text += (
                " AND EXISTS (SELECT 1 FROM todo_subscribers fs WHERE fs.todo_id = tt.todo_id AND fs.is_deleted = 0"
                f" AND fs.subscriber_id IN ({placeholders}))"
            )
            where_values.extend(subscriber_values)
        elif isinstance(value, list) and item["type"] == "multi_select":
            placeholders = ",".join(["%s"] * len(value))
            where_text += f" AND {item['condition']} IN ({placeholders})"
            where_values.extend(value)
        elif item["type"] == "date_range":
            if not isinstance(value, list) or len(value) != 2:
                raise HTTPException(status_code=400, detail=f"{key} needs a start and an end date")
            where_text += f" AND {item['condition']} BETWEEN %s AND %s"
            where_values.extend([f"{str(value[0])[:10]} 00:00:00", f"{str(value[1])[:10]} 23:59:59"])
        elif item["type"] == "input":
            where_text += f" AND {item['condition']} LIKE %s"
            where_values.append(f"%{str(value)}%")
        else:
            where_text += f" AND {item['condition']} = %s"
            where_values.append(value)

    if filter_code == "ALL":
        if user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only administrators can list all tasks")
    else:
        where_text += " AND " + RELATED_TO_USER
        where_values.extend(related_params(user_id))

    where_text += " AND tt.is_deleted = 0"
    if actions_only:
        where_text += " AND tt.parent_todo_id IS NOT NULL"
    elif top_level_only or for_export:
        where_text += " AND tt.parent_todo_id IS NULL"

    limit_text = ""
    limit_values = []
    if apply_limit and not for_export:
        limit_text = " LIMIT %s, %s"
        limit_values = [offset, page_multiplier]

    list_query = f"{TODO_SELECT} {where_text} ORDER BY tt.created_time DESC {limit_text}"
    cursor.execute(list_query, where_values + limit_values)
    rows = cursor.fetchall()

    total_count = len(rows)
    if apply_limit and not for_export:
        count_query = f"SELECT COUNT(*) AS total_count FROM todo_tasks tt {where_text}"
        cursor.execute(count_query, where_values)
        total_count = cursor.fetchone()["total_count"]

    if for_export and actions_only:
        return {"data": rows}

    if for_export:
        parent_ids = []
        for parent in rows:
            parent_ids.append(parent["todo_id"])

        subtasks_by_parent = {}
        if parent_ids:
            placeholders = ",".join(["%s"] * len(parent_ids))
            export_subtasks_query = f"""
                {TODO_SELECT}
                WHERE tt.parent_todo_id IN ({placeholders}) AND tt.is_deleted = 0
                ORDER BY tt.created_time
            """
            cursor.execute(export_subtasks_query, parent_ids)
            for subtask in cursor.fetchall():
                subtasks_by_parent.setdefault(subtask["parent_todo_id"], []).append(subtask)

        export_rows = []
        for parent in rows:
            export_rows.append(parent)
            for subtask in subtasks_by_parent.get(parent["todo_id"], []):
                export_rows.append(subtask)
        return {"data": export_rows}

    # Subscribers and comments for all rows in two queries
    todo_ids = []
    for row in rows:
        todo_ids.append(row["todo_id"])

    subscribers_by_todo = {}
    comments_by_todo = {}
    if todo_ids:
        placeholders = ",".join(["%s"] * len(todo_ids))
        cursor.execute(f"""
            SELECT ats.todo_id, ats.subscriber_id, u.name AS subscriber_name
            FROM todo_subscribers ats
            LEFT JOIN users u ON ats.subscriber_id = u.user_id
            WHERE ats.todo_id IN ({placeholders}) AND ats.is_deleted = 0
        """, todo_ids)
        for sub in cursor.fetchall():
            subscribers_by_todo.setdefault(sub["todo_id"], []).append(
                {"subscriber_id": sub["subscriber_id"], "subscriber_name": sub["subscriber_name"]}
            )

        cursor.execute(f"""
            SELECT todo_id, comment
            FROM todo_comments
            WHERE todo_id IN ({placeholders}) AND is_deleted = 0
            ORDER BY comment_id DESC
        """, todo_ids)
        for comment_row in cursor.fetchall():
            comments_by_todo.setdefault(comment_row["todo_id"], []).append({"comment": comment_row["comment"]})

    for row in rows:
        if row.get("attachments"):
            row["attachments"] = json.loads(row["attachments"])
        row["subscribers"] = subscribers_by_todo.get(row["todo_id"], [])
        row["comments"] = comments_by_todo.get(row["todo_id"], [])

    return {"data": rows, "total_count": total_count}


@router.get("/get_todo_task_by_id", tags=["TodoTask"])
def get_todo_task_by_id(todo_id: int, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_read(cursor, user, todo_id)

    cursor.execute(f"{TODO_SELECT} WHERE tt.todo_id = %s AND tt.is_deleted = 0", (todo_id,))
    res = cursor.fetchone()
    if not res:
        raise HTTPException(status_code=404, detail="Todo Task not found")

    if res.get("attachments"):
        res["attachments"] = json.loads(res["attachments"])

    cursor.execute("""
        SELECT ats.subscriber_id, u.name AS subscriber_name
        FROM todo_subscribers ats
        LEFT JOIN users u ON ats.subscriber_id = u.user_id
        WHERE ats.todo_id = %s AND ats.is_deleted = 0
    """, (todo_id,))
    res["subscribers"] = cursor.fetchall()

    cursor.execute("""
        SELECT tc.*, u.name AS created_by_name
        FROM todo_comments tc
        LEFT JOIN users u ON tc.created_by = u.user_id
        WHERE tc.todo_id = %s AND tc.is_deleted = 0
        ORDER BY tc.comment_id DESC
    """, (todo_id,))
    res["comments"] = cursor.fetchall()

    cursor.execute("""
        SELECT ta.*, u.name AS updated_by_name
        FROM todo_activity ta
        LEFT JOIN users u ON u.user_id = ta.updated_by
        WHERE ta.todo_id = %s
        ORDER BY ta.transaction_id DESC
    """, (todo_id,))
    transactions = cursor.fetchall()
    for row in transactions:
        if row["change_json"]:
            row["change_json"] = json.loads(row["change_json"])
    res["transactions"] = transactions

    cursor.execute("""
        SELECT atl.link_id, atl.todo_id, atl.module_name, atl.module_ref, atl.module_record_id, atl.title, atl.url,
               atl.created_at, creator.name AS created_by_name,
               atl.updated_at, updater.name AS updated_by_name
        FROM todo_links atl
        LEFT JOIN users creator ON atl.created_by = creator.user_id
        LEFT JOIN users updater ON atl.updated_by = updater.user_id
        WHERE atl.todo_id = %s AND atl.is_deleted = 0
        ORDER BY atl.created_at DESC
    """, (todo_id,))
    res["links"] = cursor.fetchall()

    cursor.execute("SELECT tag_name FROM todo_tags WHERE todo_id = %s AND is_deleted = 0", (todo_id,))
    tags = []
    for row in cursor.fetchall():
        tags.append(row["tag_name"])
    res["tags"] = tags

    res["parent_todo"] = None
    if res.get("parent_todo_id"):
        cursor.execute("""
            SELECT tt.todo_id, tt.todo_code, tt.title, mts.todo_status_name
            FROM todo_tasks tt
            LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
            WHERE tt.todo_id = %s
        """, (res["parent_todo_id"],))
        res["parent_todo"] = cursor.fetchone()

    return {"data": res}


# ---------------------------------------------------------------------------
# Create / update / delete
# ---------------------------------------------------------------------------

@router.post("/create_todo_task", tags=["TodoTask"])
def create_todo_task(todo: TodoTask, conn=Depends(get_db), user=Depends(current_user)):
    user_id = user["user_id"]
    cursor = conn.cursor()

    department_id = todo.department_id
    is_private = todo.is_private

    # A Resolved/Blocked/Closed todo cannot take new subtasks
    if todo.parent_todo_id:
        cursor.execute("""
            SELECT mts.todo_status_name, tt.department_id, tt.is_private, tt.todo_id, tt.owner_id,
                   tt.assigned_to_id, tt.created_by
            FROM todo_tasks tt
            LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
            WHERE tt.todo_id = %s AND tt.is_deleted = 0
        """, (todo.parent_todo_id,))
        parent_status = cursor.fetchone()
        if not parent_status:
            raise HTTPException(status_code=404, detail="Parent todo not found")
        if parent_status["is_private"] and not can_read_todo(cursor, user, parent_status):
            raise HTTPException(status_code=403, detail="You do not have access to this task")
        if parent_status["todo_status_name"] in CLOSED_PARENT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Can't add a subtask — the parent todo is {parent_status['todo_status_name']}",
            )
        # An action always has the same team and privacy as its todo
        department_id = parent_status["department_id"]
        is_private = parent_status["is_private"]

    # Quick-add sends little, so status and priority get defaults
    todo_status_id = todo.todo_status_id
    if not todo_status_id:
        cursor.execute("""
            SELECT todo_status_id FROM todo_statuses WHERE is_deleted = 0
            ORDER BY (todo_status_name = 'New') DESC, todo_status_id LIMIT 1
        """)
        default_status = cursor.fetchone()
        if not default_status:
            raise HTTPException(status_code=400, detail="No todo status is set up, so a status is required")
        todo_status_id = default_status["todo_status_id"]
    else:
        check_lookup_exists(cursor, "todo_statuses", "todo_status_id", todo_status_id, "Status")

    todo_priority_id = todo.todo_priority_id
    if todo_priority_id is None:
        cursor.execute("""
            SELECT priority_id FROM priorities WHERE is_deleted = 0
            ORDER BY (priority_name = 'NA') DESC, priority_id LIMIT 1
        """)
        default_priority = cursor.fetchone()
        if not default_priority:
            raise HTTPException(status_code=400, detail="No priority is set up, so a priority is required")
        todo_priority_id = default_priority["priority_id"]
    else:
        check_lookup_exists(cursor, "priorities", "priority_id", todo_priority_id, "Priority")

    if department_id:
        check_lookup_exists(cursor, "departments", "department_id", department_id, "Department")

    # Owner and assignee default to the person creating it
    owner_id = todo.owner_id
    if not owner_id:
        owner_id = user_id
    check_user_exists(cursor, owner_id, "Owner")
    assigned_to_id = todo.assigned_to_id
    if not assigned_to_id:
        assigned_to_id = user_id
    check_user_exists(cursor, assigned_to_id, "Assignee")
    assigned_date = todo.assigned_date
    if not assigned_date:
        assigned_date = datetime.now()

    cursor.execute("""
        INSERT INTO todo_tasks
            (title, description, todo_status_id, todo_priority_id, term_type, target_date, owner_id,
             department_id, assigned_date, assigned_to_id, is_private, parent_todo_id, created_by, created_time)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        todo.title, todo.description, todo_status_id, todo_priority_id, todo.term_type, todo.target_date,
        owner_id, department_id, assigned_date, assigned_to_id, is_private, todo.parent_todo_id,
        user_id, datetime.now(),
    ))
    new_todo_id = cursor.lastrowid
    cursor.execute("UPDATE todo_tasks SET todo_code = %s WHERE todo_id = %s", (f"TD{new_todo_id}", new_todo_id))
    conn.commit()

    return {"data": {"todo_id": new_todo_id}}


def valid_attachment_url(url):
    lowered = url.lower()
    return lowered.startswith("http://") or lowered.startswith("https://") or url.startswith("/files/")


def display_value(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return value


@router.put("/update_todo_task/{todo_id}", tags=["TodoTask"])
def update_todo_task(todo: TodoTask, todo_id: int = Path(...), conn=Depends(get_db), user=Depends(current_user)):
    user_id = user["user_id"]
    cursor = conn.cursor()
    require_write(cursor, user, todo_id)

    cursor.execute(f"{TODO_SELECT} WHERE tt.todo_id = %s AND tt.is_deleted = 0", (todo_id,))
    existing_todo = cursor.fetchone()
    if not existing_todo:
        raise HTTPException(status_code=404, detail="Todo Task not found")

    # An action keeps the team and privacy of its todo
    department_id = todo.department_id
    is_private = todo.is_private
    if existing_todo["parent_todo_id"]:
        department_id = existing_todo["department_id"]
        is_private = existing_todo["is_private"]

    # Required columns keep their old value when the request leaves them out
    todo_status_id = todo.todo_status_id
    if not todo_status_id:
        todo_status_id = existing_todo["todo_status_id"]
    todo_priority_id = todo.todo_priority_id
    if todo_priority_id is None:
        todo_priority_id = existing_todo["todo_priority_id"]
    owner_id = todo.owner_id
    if not owner_id:
        owner_id = existing_todo["owner_id"]
    assigned_to_id = todo.assigned_to_id
    if not assigned_to_id:
        assigned_to_id = existing_todo["assigned_to_id"]

    # Names of the new values, for the change log (and to reject ids that do not exist)
    cursor.execute("SELECT todo_status_name FROM todo_statuses WHERE todo_status_id = %s AND is_deleted = 0", (todo_status_id,))
    status_row = cursor.fetchone()
    if not status_row:
        raise HTTPException(status_code=400, detail="Status not found")
    cursor.execute("SELECT priority_name FROM priorities WHERE priority_id = %s AND is_deleted = 0", (todo_priority_id,))
    priority_row = cursor.fetchone()
    if not priority_row:
        raise HTTPException(status_code=400, detail="Priority not found")

    check_user_exists(cursor, owner_id, "Owner")
    check_user_exists(cursor, assigned_to_id, "Assignee")
    cursor.execute("SELECT name FROM users WHERE user_id = %s", (owner_id,))
    owner_name = cursor.fetchone()["name"]
    cursor.execute("SELECT name FROM users WHERE user_id = %s", (assigned_to_id,))
    assigned_to_name = cursor.fetchone()["name"]

    department_name = None
    if department_id:
        cursor.execute("SELECT department_name FROM departments WHERE department_id = %s AND is_deleted = 0", (department_id,))
        department_row = cursor.fetchone()
        if not department_row:
            raise HTTPException(status_code=400, detail="Department not found")
        department_name = department_row["department_name"]

    # Can't close a todo while any of its subtasks are still open
    if status_row["todo_status_name"] == "Closed":
        cursor.execute("""
            SELECT tt.todo_id FROM todo_tasks tt
            LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
            WHERE tt.parent_todo_id = %s AND tt.is_deleted = 0
              AND (mts.todo_status_name IS NULL OR mts.todo_status_name != 'Closed')
            LIMIT 1
        """, (todo_id,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Can't mark this complete — one or more subtasks are still open")

    # Track changes: display name, old value, new value
    compared_fields = [
        ("Title", existing_todo["title"], todo.title),
        ("Description", existing_todo["description"], todo.description),
        ("Status", existing_todo["todo_status_name"], status_row["todo_status_name"]),
        ("Priority", existing_todo["priority_name"], priority_row["priority_name"]),
        ("Term Type", existing_todo["term_type"], todo.term_type),
        ("Target Date", display_value(existing_todo["target_date"]), display_value(todo.target_date)),
        ("Owner", existing_todo["owner_name"], owner_name),
        ("Assigned To", existing_todo["assigned_to_name"], assigned_to_name),
        ("Department", existing_todo["department_name"], department_name),
        ("Assigned Date", display_value(existing_todo["assigned_date"]), display_value(todo.assigned_date)),
        ("Private", existing_todo["is_private"], is_private),
    ]
    todo_field_changes = {}
    for display_name, old_value, new_value in compared_fields:
        if old_value != new_value:
            todo_field_changes[display_name] = {"old": old_value, "new": new_value}

    if todo_field_changes:
        change_log = [{"service": "Todo Task", "changes": todo_field_changes}]
        cursor.execute(
            "INSERT INTO todo_activity (todo_id, comment, change_json, updated_by, created_time) VALUES (%s, %s, %s, %s, %s)",
            (todo_id, "Todo Task Updated", json.dumps(change_log, default=str), user_id, datetime.now()),
        )

    cursor.execute("""
        UPDATE todo_tasks
        SET title = %s, description = %s, todo_status_id = %s, todo_priority_id = %s, term_type = %s,
            target_date = %s, owner_id = %s, department_id = %s, assigned_date = %s,
            is_private = %s, assigned_to_id = %s, updated_by = %s, updated_time = %s
        WHERE todo_id = %s
    """, (
        todo.title, todo.description, todo_status_id, todo_priority_id, todo.term_type,
        todo.target_date, owner_id, department_id, todo.assigned_date,
        is_private, assigned_to_id, user_id, datetime.now(), todo_id,
    ))

    # When a todo's team or privacy changes, its actions follow
    team_changed = existing_todo["department_id"] != department_id
    privacy_changed = existing_todo["is_private"] != is_private
    if not existing_todo["parent_todo_id"] and (team_changed or privacy_changed):
        cursor.execute("""
            UPDATE todo_tasks
            SET department_id = %s, is_private = %s, updated_by = %s, updated_time = %s
            WHERE parent_todo_id = %s AND is_deleted = 0
        """, (department_id, is_private, user_id, datetime.now(), todo_id))

    conn.commit()
    return {"data": "Todo Task updated successfully"}


@router.delete("/delete_todo_task/{todo_id}", tags=["TodoTask"])
def delete_todo_task(todo_id: int, conn=Depends(get_db), user=Depends(admin_user)):
    user_id = user["user_id"]
    cursor = conn.cursor()
    load_todo_for_access(cursor, todo_id)

    # Delete related subscribers and comments, including those of the todo's actions
    cursor.execute("""
        UPDATE todo_subscribers SET is_deleted = 1, updated_by = %s, updated_time = %s
        WHERE todo_id = %s OR todo_id IN (SELECT todo_id FROM (SELECT todo_id FROM todo_tasks WHERE parent_todo_id = %s) AS actions)
    """, (user_id, datetime.now(), todo_id, todo_id))

    cursor.execute("""
        UPDATE todo_comments SET is_deleted = 1, updated_by = %s, updated_time = %s
        WHERE todo_id = %s OR todo_id IN (SELECT todo_id FROM (SELECT todo_id FROM todo_tasks WHERE parent_todo_id = %s) AS actions)
    """, (user_id, datetime.now(), todo_id, todo_id))

    cursor.execute("""
        UPDATE todo_tasks SET is_deleted = 1, updated_by = %s, updated_time = %s
        WHERE todo_id = %s OR parent_todo_id = %s
    """, (user_id, datetime.now(), todo_id, todo_id))

    conn.commit()
    return {"data": "Todo Task deleted successfully"}


# ---------------------------------------------------------------------------
# Comments, subscribers, attachments, links, tags
# ---------------------------------------------------------------------------

@router.post("/add_todo_comment", tags=["TodoTask"])
def add_todo_comment(comment_data: UpdateTodoComment, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_read(cursor, user, comment_data.todo_id)

    cursor.execute(
        "INSERT INTO todo_comments (todo_id, comment, created_by, created_time, is_deleted) VALUES (%s, %s, %s, %s, 0)",
        (comment_data.todo_id, comment_data.comment, user["user_id"], datetime.now()),
    )
    conn.commit()
    return {"data": "Comment added successfully"}


@router.post("/add_subscribers", tags=["TodoTask"])
def add_subscribers(data: Subscribers, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_write(cursor, user, data.todo_id)
    check_user_exists(cursor, data.subscriber_id, "Subscriber")

    if not is_subscriber(cursor, data.todo_id, data.subscriber_id):
        cursor.execute(
            "INSERT INTO todo_subscribers (todo_id, subscriber_id, created_by, created_time, is_deleted) "
            "VALUES (%s, %s, %s, %s, 0)",
            (data.todo_id, data.subscriber_id, user["user_id"], datetime.now()),
        )

    conn.commit()
    return {"data": "Subscribers added successfully"}


@router.post("/remove_subscribers", tags=["ToDoTask"])
def remove_subscribers(data: Subscribers, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_write(cursor, user, data.todo_id)

    cursor.execute(
        "UPDATE todo_subscribers SET is_deleted = 1, updated_by = %s, updated_time = %s "
        "WHERE todo_id = %s AND subscriber_id = %s",
        (user["user_id"], datetime.now(), data.todo_id, data.subscriber_id),
    )
    conn.commit()
    return {"data": "Subscribers removed successfully"}


@router.post("/add_todo_attachment", tags=["TodoTask"])
def add_todo_attachment(data: Attachments, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_write(cursor, user, data.todo_id)

    for item in data.attachments:
        item_url = str(item.get("url", ""))
        if item_url != "" and not valid_attachment_url(item_url):
            raise HTTPException(status_code=400, detail="Attachment links must start with http://, https:// or /files/")

    attachment_text = json.dumps(data.attachments)
    if len(attachment_text) > 200000:
        raise HTTPException(status_code=400, detail="Attachment list is too large")
    cursor.execute("UPDATE todo_tasks SET attachments = %s WHERE todo_id = %s", (attachment_text, data.todo_id))
    conn.commit()
    return {"data": "Todo Task Attachments added successfully"}


@router.post("/add_todo_link", tags=["TodoTask"])
def add_todo_link(data: Links, conn=Depends(get_db), user=Depends(current_user)):
    user_id = user["user_id"]
    cursor = conn.cursor()
    require_write(cursor, user, data.todo_id)

    cursor.execute(
        "SELECT link_id FROM todo_links WHERE todo_id = %s AND module_name = %s AND module_ref = %s",
        (data.todo_id, data.module_name, data.module_ref),
    )
    existing_link = cursor.fetchone()

    if existing_link:
        cursor.execute("""
            UPDATE todo_links
            SET title = %s, module_record_id = %s, url = %s, updated_by = %s, updated_at = %s, is_deleted = 0
            WHERE link_id = %s
        """, (data.title, data.module_record_id, data.url, user_id, datetime.now(), existing_link["link_id"]))
        conn.commit()
        return {"data": {"link_id": existing_link["link_id"], "action": "updated"}}

    cursor.execute("""
        INSERT INTO todo_links (todo_id, module_name, module_ref, module_record_id, title, url, created_by, created_at, is_deleted)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0)
    """, (data.todo_id, data.module_name, data.module_ref, data.module_record_id, data.title, data.url, user_id, datetime.now()))
    link_id = cursor.lastrowid
    conn.commit()
    return {"data": {"link_id": link_id, "action": "created"}}


@router.post("/remove_todo_link", tags=["TodoTask"])
def remove_todo_link(data: Links, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()

    cursor.execute("SELECT todo_id FROM todo_links WHERE link_id = %s", (data.link_id,))
    link = cursor.fetchone()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    require_write(cursor, user, link["todo_id"])

    cursor.execute(
        "UPDATE todo_links SET is_deleted = 1, updated_by = %s, updated_at = %s WHERE link_id = %s",
        (user["user_id"], datetime.now(), data.link_id),
    )
    conn.commit()
    return {"data": "Todo link removed successfully"}


@router.get("/todo_links_for_record", tags=["TodoTask"])
def todo_links_for_record(module_name: str, module_ref: str = "", module_record_id: str = "",
                          conn=Depends(get_db), user=Depends(current_user)):
    """Todos linked to an outside record, grouped by parent. A linked parent shows all its subtasks;
    a linked subtask shows under its parent alone."""
    cursor = conn.cursor()
    visible_sql, visible_values = visible_clause(user)

    cursor.execute(f"""
        SELECT tt.todo_id, tt.parent_todo_id
        FROM todo_links atl
        JOIN todo_tasks tt ON tt.todo_id = atl.todo_id
        WHERE atl.module_name = %s
          AND ((%s != '' AND atl.module_ref = %s) OR (%s != '' AND atl.module_record_id = %s))
          AND atl.is_deleted = 0 AND tt.is_deleted = 0 AND {visible_sql}
    """, [module_name, module_ref, module_ref, module_record_id, module_record_id] + visible_values)
    linked_rows = cursor.fetchall()
    if not linked_rows:
        return {"data": []}

    linked_ids = set()
    parent_ids = set()
    directly_linked_parent_ids = set()
    for row in linked_rows:
        linked_ids.add(row["todo_id"])
        if row["parent_todo_id"] is None:
            parent_ids.add(row["todo_id"])
            directly_linked_parent_ids.add(row["todo_id"])
        else:
            parent_ids.add(row["parent_todo_id"])

    placeholders = ",".join(["%s"] * len(parent_ids))
    todo_select = """
        SELECT tt.*, mts.todo_status_name, mtp.priority_name, md.department_name AS department_name,
               assigned.name AS assigned_to_name
        FROM todo_tasks tt
        LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
        LEFT JOIN priorities mtp ON tt.todo_priority_id = mtp.priority_id
        LEFT JOIN departments md ON tt.department_id = md.department_id
        LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
    """

    cursor.execute(f"{todo_select} WHERE tt.todo_id IN ({placeholders}) AND tt.is_deleted = 0", list(parent_ids))
    parents_by_id = {}
    for row in cursor.fetchall():
        parents_by_id[row["todo_id"]] = row

    cursor.execute(f"""
        {todo_select} WHERE tt.parent_todo_id IN ({placeholders}) AND tt.is_deleted = 0
        ORDER BY tt.created_time DESC
    """, list(parent_ids))
    subtasks_by_parent = {}
    for row in cursor.fetchall():
        subtasks_by_parent.setdefault(row["parent_todo_id"], []).append(row)

    groups = []
    for parent_id in parent_ids:
        parent = parents_by_id.get(parent_id)
        if not parent:
            continue
        candidates = subtasks_by_parent.get(parent_id, [])
        if parent_id in directly_linked_parent_ids:
            subtasks = candidates
        else:
            subtasks = []
            for candidate in candidates:
                if candidate["todo_id"] in linked_ids:
                    subtasks.append(candidate)
        groups.append({"todo": parent, "subtasks": subtasks})

    return {"data": groups}


@router.get("/search_todo_tasks", tags=["TodoTask"])
def search_todo_tasks(search_text: str = "", conn=Depends(get_db), user=Depends(current_user)):
    """Parent-todo picker for new actions. Resolved/Blocked/Closed todos are left out."""
    cursor = conn.cursor()
    visible_sql, visible_values = visible_clause(user)

    cursor.execute(f"""
        SELECT tt.todo_id, tt.todo_code, tt.title, tt.is_private, tt.department_id
        FROM todo_tasks tt
        LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
        WHERE tt.title LIKE %s AND tt.parent_todo_id IS NULL AND tt.is_deleted = 0
          AND (mts.todo_status_name IS NULL OR mts.todo_status_name NOT IN ('Resolved', 'Blocked', 'Closed'))
          AND {visible_sql}
        ORDER BY tt.created_time DESC
        LIMIT 200
    """, [f"%{search_text}%"] + visible_values)
    return {"data": cursor.fetchall()}


@router.get("/get_todo_subtasks", tags=["TodoTask"])
def get_todo_subtasks(parent_todo_id: int, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_read(cursor, user, parent_todo_id)

    # Same columns as /todo_tasks
    cursor.execute(f"""
        {TODO_SELECT}
        WHERE tt.parent_todo_id = %s AND tt.is_deleted = 0
        ORDER BY tt.created_time DESC
    """, (parent_todo_id,))
    return {"data": cursor.fetchall()}


@router.get("/todo_task_by_link", tags=["TodoTask"])
def todo_task_by_link(module_name: str, module_ref: str, conn=Depends(get_db), user=Depends(current_user)):
    """An open todo already linked to this outside record, if any."""
    cursor = conn.cursor()
    visible_sql, visible_values = visible_clause(user)

    cursor.execute(f"""
        SELECT tt.todo_id, tt.title, mts.todo_status_name, assigned.name AS assigned_to_name
        FROM todo_links atl
        JOIN todo_tasks tt ON tt.todo_id = atl.todo_id
        LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
        LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
        WHERE atl.module_name = %s AND atl.module_ref = %s
          AND atl.is_deleted = 0 AND tt.is_deleted = 0
          AND (mts.todo_status_name IS NULL OR mts.todo_status_name != 'Closed')
          AND {visible_sql}
        ORDER BY tt.created_time DESC
        LIMIT 1
    """, [module_name, module_ref] + visible_values)
    return {"data": cursor.fetchone()}


@router.post("/set_todo_tags", tags=["TodoTask"])
def set_todo_tags(data: TodoTags, conn=Depends(get_db), user=Depends(current_user)):
    cursor = conn.cursor()
    require_write(cursor, user, data.todo_id)

    # Replace all tags
    cursor.execute("UPDATE todo_tags SET is_deleted = 1 WHERE todo_id = %s", (data.todo_id,))

    for tag_name in data.tags:
        tag_name = tag_name.strip()
        if not tag_name:
            continue
        cursor.execute(
            "INSERT INTO todo_tags (todo_id, tag_name, created_by, created_time, is_deleted) VALUES (%s, %s, %s, %s, 0)",
            (data.todo_id, tag_name, user["user_id"], datetime.now()),
        )

    conn.commit()
    return {"data": "Tags updated successfully"}


@router.post("/send_todo_notification", tags=["TodoTask"])
def send_todo_notification(data: TodoMailer, background_tasks: BackgroundTasks, conn=Depends(get_db),
                           user=Depends(current_user)):
    """Queues the TODO_CREATE notification (recipients and wording come from Notification Settings)."""
    cursor = conn.cursor()
    require_write(cursor, user, data.todo_id)

    background_tasks.add_task(dispatch_notification, "TODO_CREATE", data.todo_id, user["user_id"])
    return {"data": "Notification queued"}


# ---------------------------------------------------------------------------
# My Tasks
# ---------------------------------------------------------------------------

def link_summary(row):
    return {"module": row["module_name"], "ref": row["module_ref"], "id": row["module_record_id"], "url": row["url"]}


@router.get("/get_my_tasks", tags=["TodoTask"])
def get_my_tasks(tab: str = "assigned_to_me", view_as_user_id: int = None, conn=Depends(get_db),
                 user=Depends(current_user)):
    """My Actions data. A todo with open subtasks shows its subtasks instead of itself.
    view_as_user_id shows another person's view (administrators, or that person's manager)."""
    cursor = conn.cursor()
    user_id = user["user_id"]

    if view_as_user_id and view_as_user_id != user_id:
        if user["role"] != "ADMIN":
            cursor.execute("SELECT manager_id FROM users WHERE user_id = %s", (view_as_user_id,))
            target = cursor.fetchone()
            if not target or target["manager_id"] != user_id:
                raise HTTPException(status_code=403, detail="You can only view your own team's tasks")
        user_id = view_as_user_id

    if tab == "assigned_by_me":
        return get_assigned_by_me(cursor, user_id)

    empty_bucket_data = {"overdue": [], "due_this_week": [], "later": [], "no_due_date": [], "completed_today": [], "audit": []}

    if tab == "owner":
        where_clause = "tt.owner_id = %s"
        where_params = [user_id]
    elif tab == "team":
        cursor.execute("SELECT department_id FROM users WHERE user_id = %s", (user_id,))
        user_row = cursor.fetchone()
        department_id = None
        if user_row:
            department_id = user_row["department_id"]
        where_clause = "tt.department_id = %s AND tt.is_private = 0"
        where_params = [department_id]
    elif tab == "my_employees":
        cursor.execute("SELECT user_id FROM users WHERE manager_id = %s AND is_deleted = 0", (user_id,))
        report_ids = []
        for row in cursor.fetchall():
            report_ids.append(row["user_id"])
        if not report_ids:
            return {"data": empty_bucket_data}
        placeholders = ",".join(["%s"] * len(report_ids))
        where_clause = f"(tt.owner_id IN ({placeholders}) OR tt.assigned_to_id IN ({placeholders}))"
        where_params = report_ids + report_ids
    elif tab == "all":
        if user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only administrators can list all tasks")
        where_clause = "1=1"
        where_params = []
    else:
        # assigned_to_me: assigned to me, or a subtask of a todo assigned to me
        where_clause = "(tt.assigned_to_id = %s OR parent.assigned_to_id = %s)"
        where_params = [user_id, user_id]

    cursor.execute(f"""
        SELECT tt.*, mts.todo_status_name, mtp.priority_name,
               owner.name AS owner_name, assigned.name AS assigned_to_name, creator.name AS created_by_name,
               md.department_name AS department_name, parent.title AS parent_title,
               parent_assigned.name AS parent_assigned_to_name
        FROM todo_tasks tt
        LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
        LEFT JOIN priorities mtp ON tt.todo_priority_id = mtp.priority_id
        LEFT JOIN users owner ON tt.owner_id = owner.user_id
        LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
        LEFT JOIN users creator ON tt.created_by = creator.user_id
        LEFT JOIN departments md ON tt.department_id = md.department_id
        LEFT JOIN todo_tasks parent ON tt.parent_todo_id = parent.todo_id
        LEFT JOIN users parent_assigned ON parent.assigned_to_id = parent_assigned.user_id
        WHERE {where_clause} AND tt.is_deleted = 0
        ORDER BY tt.target_date IS NULL, tt.target_date ASC
        LIMIT 1000
    """, where_params)
    my_items = cursor.fetchall()

    parent_ids = []
    for row in my_items:
        if row["parent_todo_id"] is None:
            parent_ids.append(row["todo_id"])
    open_subtask_counts = {}
    if parent_ids:
        placeholders = ",".join(["%s"] * len(parent_ids))
        cursor.execute(f"""
            SELECT tt.parent_todo_id, COUNT(*) AS open_count
            FROM todo_tasks tt
            LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
            WHERE tt.parent_todo_id IN ({placeholders}) AND tt.is_deleted = 0
              AND (mts.todo_status_name IS NULL OR mts.todo_status_name != 'Closed')
            GROUP BY tt.parent_todo_id
        """, parent_ids)
        for row in cursor.fetchall():
            open_subtask_counts[row["parent_todo_id"]] = row["open_count"]

    # A todo with open subtasks steps aside for them
    leaves = []
    leaf_ids = []
    for row in my_items:
        if row["parent_todo_id"] is not None or open_subtask_counts.get(row["todo_id"], 0) == 0:
            leaves.append(row)
            leaf_ids.append(row["todo_id"])

    if leaf_ids:
        placeholders = ",".join(["%s"] * len(leaf_ids))
        cursor.execute(f"""
            SELECT todo_id, module_name, module_ref, module_record_id, url FROM todo_links
            WHERE todo_id IN ({placeholders}) AND is_deleted = 0
        """, leaf_ids)
        leaf_links_by_todo = {}
        for row in cursor.fetchall():
            leaf_links_by_todo.setdefault(row["todo_id"], []).append(link_summary(row))
        for row in leaves:
            row["links"] = leaf_links_by_todo.get(row["todo_id"], [])
            if row.get("attachments"):
                row["attachments"] = json.loads(row["attachments"])

    today = datetime.now().date()
    week_end = today + timedelta(days=7)
    overdue = []
    due_this_week = []
    later = []
    no_due_date = []
    completed_today = []
    for row in leaves:
        if row["todo_status_name"] == "Closed":
            updated_date = None
            if row["updated_time"]:
                updated_date = row["updated_time"].date()
            if updated_date == today:
                completed_today.append(row)
            continue

        # Every open todo lands in exactly one bucket
        target_date = None
        if row["target_date"]:
            target_date = row["target_date"].date()
        if not target_date:
            no_due_date.append(row)
        elif target_date < today:
            overdue.append(row)
        elif target_date <= week_end:
            due_this_week.append(row)
        else:
            later.append(row)

    return {
        "data": {
            "overdue": overdue,
            "due_this_week": due_this_week,
            "later": later,
            "no_due_date": no_due_date,
            "completed_today": completed_today,
            "audit": [],
        }
    }


def audit_row(row, remarks_by_todo, links_by_todo):
    complete = row["todo_status_name"] == "Closed"
    completed_at = None
    if complete:
        completed_at = row["updated_time"]
    return {
        "todo_id": row["todo_id"],
        "title": row["title"],
        "assigned_to_name": row["assigned_to_name"],
        "is_complete": complete,
        "completed_at": completed_at,
        "target_date": row["target_date"],
        "created_at": row["created_time"],
        "remark": remarks_by_todo.get(row["todo_id"]),
        "links": links_by_todo.get(row["todo_id"], []),
    }


def get_assigned_by_me(cursor, user_id):
    """The 'assigned by me' audit: what I created, with its subtasks and the latest remark of each."""
    cursor.execute("""
        SELECT tt.todo_id, tt.title, tt.target_date, tt.created_time, tt.updated_time, mts.todo_status_name,
               assigned.name AS assigned_to_name
        FROM todo_tasks tt
        LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
        LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
        WHERE tt.created_by = %s AND tt.parent_todo_id IS NULL AND tt.is_deleted = 0
        ORDER BY tt.created_time DESC
        LIMIT 100
    """, (user_id,))
    parents = cursor.fetchall()
    parent_ids = []
    for parent in parents:
        parent_ids.append(parent["todo_id"])

    subtasks_by_parent = {}
    if parent_ids:
        placeholders = ",".join(["%s"] * len(parent_ids))
        cursor.execute(f"""
            SELECT tt.todo_id, tt.parent_todo_id, tt.title, tt.target_date, tt.created_time, tt.updated_time,
                   mts.todo_status_name, assigned.name AS assigned_to_name
            FROM todo_tasks tt
            LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
            LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
            WHERE tt.parent_todo_id IN ({placeholders}) AND tt.is_deleted = 0
            ORDER BY tt.created_time DESC
        """, parent_ids)
        for row in cursor.fetchall():
            subtasks_by_parent.setdefault(row["parent_todo_id"], []).append(row)

    # Actions I created under a todo that isn't mine never show up as a nested subtask above,
    # since that parent isn't in parent_ids, so they are listed on their own.
    orphan_parent_condition = ""
    orphan_params = [user_id]
    if parent_ids:
        placeholders = ",".join(["%s"] * len(parent_ids))
        orphan_parent_condition = f"AND tt.parent_todo_id NOT IN ({placeholders})"
        orphan_params = orphan_params + parent_ids
    cursor.execute(f"""
        SELECT tt.todo_id, tt.title, tt.target_date, tt.created_time, tt.updated_time, mts.todo_status_name,
               assigned.name AS assigned_to_name, parent.title AS parent_title
        FROM todo_tasks tt
        LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id
        LEFT JOIN users assigned ON tt.assigned_to_id = assigned.user_id
        LEFT JOIN todo_tasks parent ON tt.parent_todo_id = parent.todo_id
        WHERE tt.created_by = %s AND tt.parent_todo_id IS NOT NULL {orphan_parent_condition} AND tt.is_deleted = 0
        ORDER BY tt.created_time DESC
        LIMIT 100
    """, orphan_params)
    orphan_actions = cursor.fetchall()

    all_ids = list(parent_ids)
    for subtasks in subtasks_by_parent.values():
        for subtask in subtasks:
            all_ids.append(subtask["todo_id"])
    for orphan in orphan_actions:
        all_ids.append(orphan["todo_id"])

    remarks_by_todo = {}
    links_by_todo = {}
    if all_ids:
        placeholders = ",".join(["%s"] * len(all_ids))
        cursor.execute(f"""
            SELECT todo_id, comment FROM todo_comments
            WHERE todo_id IN ({placeholders}) AND is_deleted = 0
            ORDER BY comment_id DESC
        """, all_ids)
        for row in cursor.fetchall():
            remarks_by_todo.setdefault(row["todo_id"], row["comment"])

        cursor.execute(f"""
            SELECT todo_id, module_name, module_ref, module_record_id, url FROM todo_links
            WHERE todo_id IN ({placeholders}) AND is_deleted = 0
        """, all_ids)
        for row in cursor.fetchall():
            links_by_todo.setdefault(row["todo_id"], []).append(link_summary(row))

    audit = []
    for parent in parents:
        parent_audit = audit_row(parent, remarks_by_todo, links_by_todo)
        parent_audit["subtasks"] = []
        for sub in subtasks_by_parent.get(parent["todo_id"], []):
            parent_audit["subtasks"].append(audit_row(sub, remarks_by_todo, links_by_todo))
        audit.append(parent_audit)

    for orphan in orphan_actions:
        orphan_audit = audit_row(orphan, remarks_by_todo, links_by_todo)
        orphan_audit["parent_title"] = orphan["parent_title"]
        orphan_audit["subtasks"] = []
        audit.append(orphan_audit)

    return {"data": {"overdue": [], "due_this_week": [], "completed_today": [], "audit": audit}}


@router.get("/get_my_tasks_counts", tags=["TodoTask"])
def get_my_tasks_counts(conn=Depends(get_db), user=Depends(current_user)):
    """Tile counts for My Actions. Approximate: parents with open subtasks are still counted."""
    cursor = conn.cursor()
    user_id = user["user_id"]

    open_condition = "tt.is_deleted = 0 AND (mts.todo_status_name IS NULL OR mts.todo_status_name != 'Closed')"
    status_join = "LEFT JOIN todo_statuses mts ON tt.todo_status_id = mts.todo_status_id"

    # Same rule as the assigned_to_me tab
    cursor.execute(f"""
        SELECT COUNT(*) AS count FROM todo_tasks tt
        {status_join}
        LEFT JOIN todo_tasks parent ON tt.parent_todo_id = parent.todo_id
        WHERE (tt.assigned_to_id = %s OR parent.assigned_to_id = %s) AND {open_condition}
    """, (user_id, user_id))
    assigned_to_me = cursor.fetchone()["count"]

    # Anything I created, top-level todos and actions alike
    cursor.execute(f"""
        SELECT COUNT(*) AS count FROM todo_tasks tt {status_join}
        WHERE tt.created_by = %s AND {open_condition}
    """, (user_id,))
    assigned_by_me = cursor.fetchone()["count"]

    cursor.execute(f"""
        SELECT COUNT(*) AS count FROM todo_tasks tt {status_join}
        WHERE tt.owner_id = %s AND {open_condition}
    """, (user_id,))
    owner = cursor.fetchone()["count"]

    cursor.execute("SELECT department_id FROM users WHERE user_id = %s", (user_id,))
    user_row = cursor.fetchone()
    department_id = None
    if user_row:
        department_id = user_row["department_id"]
    cursor.execute(f"""
        SELECT COUNT(*) AS count FROM todo_tasks tt {status_join}
        WHERE tt.department_id = %s AND tt.is_private = 0 AND {open_condition}
    """, (department_id,))
    team = cursor.fetchone()["count"]

    cursor.execute("SELECT user_id FROM users WHERE manager_id = %s AND is_deleted = 0", (user_id,))
    report_ids = []
    for row in cursor.fetchall():
        report_ids.append(row["user_id"])
    my_employees = 0
    if report_ids:
        placeholders = ",".join(["%s"] * len(report_ids))
        cursor.execute(f"""
            SELECT COUNT(*) AS count FROM todo_tasks tt {status_join}
            WHERE (tt.owner_id IN ({placeholders}) OR tt.assigned_to_id IN ({placeholders})) AND {open_condition}
        """, report_ids + report_ids)
        my_employees = cursor.fetchone()["count"]

    visible_sql, visible_values = visible_clause(user)
    cursor.execute(f"""
        SELECT COUNT(*) AS count FROM todo_tasks tt {status_join}
        WHERE {open_condition} AND {visible_sql}
    """, visible_values)
    all_count = cursor.fetchone()["count"]

    return {
        "data": {
            "assigned_to_me": assigned_to_me,
            "assigned_by_me": assigned_by_me,
            "owner": owner,
            "team": team,
            "my_employees": my_employees,
            "all": all_count,
        }
    }
