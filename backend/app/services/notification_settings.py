"""
Admin side of the notification engine: templates, groups, delivery log and test mail.
Nothing here commits; the route commits once. Sending logic lives in notifications.py.
"""

import json

from fastapi import HTTPException

from app.services.mailer import send_mail
from app.services.notifications import get_user_contacts, prepare_notifications, require_module_help

# Dropdown choices per (module_code, field); each query returns value and label.
# A choice's value must be the same kind of value the module's load_context puts in
# "values" (an id or a name), otherwise the condition never matches.
FIELD_OPTION_QUERIES = {
    ("TODO", "status"): """
        SELECT todo_status_name AS value, todo_status_name AS label
        FROM todo_statuses
        WHERE is_deleted = 0
        ORDER BY todo_status_id
    """,
    ("TODO", "priority"): """
        SELECT priority_name AS value, priority_name AS label
        FROM priorities
        WHERE is_deleted = 0
        ORDER BY priority_id
    """,
    ("TODO", "department"): """
        SELECT department_name AS value, department_name AS label
        FROM departments
        WHERE is_deleted = 0
        ORDER BY department_name
    """,
}

# Fields with fixed choices need no query
FIELD_OPTION_LISTS = {
    ("TODO", "is_subtask"): ["Yes", "No"],
}


def list_field_options(cursor, module_code, field):
    """Dropdown choices for one condition field of one module, as [{value, label}].
    An empty list means the field has no fixed choices (the screen shows a text box)."""
    option_key = (module_code, field)

    if option_key in FIELD_OPTION_LISTS:
        options = []
        for item in FIELD_OPTION_LISTS[option_key]:
            options.append({"value": item, "label": item})
        return options

    option_query = FIELD_OPTION_QUERIES.get(option_key)
    if option_query is None:
        return []

    cursor.execute(option_query)
    return cursor.fetchall()


def list_modules(cursor):
    """Modules with their actions, plus the condition fields and ROLE recipients each offers."""
    cursor.execute("SELECT module_id, module_code, module_name FROM notif_modules WHERE is_deleted = 0 ORDER BY module_name")
    modules = cursor.fetchall()

    cursor.execute("""
        SELECT action_id, module_id, action_code, action_key, name
        FROM notif_actions
        WHERE is_deleted = 0
        ORDER BY action_id
    """)
    actions = cursor.fetchall()

    for module in modules:
        module["actions"] = []
        for action in actions:
            if action["module_id"] == module["module_id"]:
                module["actions"].append(action)

        module_help = require_module_help(module["module_code"])
        module["roles"] = module_help["roles"]

        # has_options tells the screen which fields get a dropdown
        module["fields"] = []
        for field in module_help["fields"]:
            option_key = (module["module_code"], field["value"])
            field_info = dict(field)
            field_info["has_options"] = False
            if option_key in FIELD_OPTION_QUERIES or option_key in FIELD_OPTION_LISTS:
                field_info["has_options"] = True
            module["fields"].append(field_info)

    return modules


def action_has_templates(cursor, action_key):
    """True if this action has at least one active template (decides whether "Save & Notify" is offered)."""
    query = """
        SELECT COUNT(*) AS template_count
        FROM notif_templates nt
        JOIN notif_actions na ON na.action_id = nt.action_id
        WHERE na.action_key = %(action_key)s AND na.is_deleted = 0 AND nt.is_deleted = 0
    """
    cursor.execute(query, {"action_key": action_key})
    return cursor.fetchone()["template_count"] > 0


def list_templates(cursor, action_id):
    """Templates of one action, or of every action when action_id is 0."""
    action_filter = ""
    if action_id != 0:
        action_filter = "AND nt.action_id = %(action_id)s"

    template_query = f"""
        SELECT nt.template_id, nt.action_id, na.action_key, na.name AS action_name,
               nm.module_code, nm.module_name, nt.template_name, nt.channel,
               nt.subject, nt.body, nt.condition_json, nt.recipients_json,
               nt.attachments_json, nt.stop_on_match, nt.is_fallback,
               nt.exclude_actor
        FROM notif_templates nt
        JOIN notif_actions na ON na.action_id = nt.action_id
        JOIN notif_modules nm ON nm.module_id = na.module_id
        WHERE nt.is_deleted = 0 {action_filter}
        ORDER BY nm.module_name, na.action_id, nt.is_fallback, nt.template_id
    """
    cursor.execute(template_query, {"action_id": action_id})
    templates = cursor.fetchall()

    for template in templates:
        template["condition"] = None
        if template["condition_json"]:
            template["condition"] = json.loads(template["condition_json"])
        template["recipients"] = json.loads(template["recipients_json"])
        template["attachments"] = []
        if template.get("attachments_json"):
            template["attachments"] = json.loads(template["attachments_json"])
        del template["condition_json"]
        del template["recipients_json"]
        del template["attachments_json"]

    # One lookup for all EMPLOYEE recipients; adds "value_label" so the screen shows a name, not an id
    user_ids = []
    for template in templates:
        for entry in template["recipients"]:
            if entry["type"] == "EMPLOYEE":
                user_ids.append(entry["value"])

    user_names = {}
    if user_ids:
        placeholders = ", ".join(["%s"] * len(user_ids))
        cursor.execute(f"SELECT user_id, name, email FROM users WHERE user_id IN ({placeholders})", user_ids)
        for user in cursor.fetchall():
            email_text = user["email"]
            if email_text is None or email_text == "":
                email_text = "no email"
            user_names[user["user_id"]] = f"{user['name']} ({email_text})"

    for template in templates:
        for entry in template["recipients"]:
            if entry["type"] == "EMPLOYEE":
                entry["value_label"] = user_names.get(entry["value"], f"User #{entry['value']} (not found)")

    return templates


def check_condition_fields(conditions, valid_fields):
    """Rejects a condition on a field this module does not have (it would never match)."""
    if not conditions:
        return
    valid_ops = ["=", "!=", "in", "not in", ">", "<", "contains", "is empty"]
    for check in conditions:
        if check.field not in valid_fields:
            raise HTTPException(status_code=400, detail=f"Condition field '{check.field}' is not available for this module")
        if check.op not in valid_ops:
            raise HTTPException(status_code=400, detail=f"Condition operator '{check.op}' is not supported")
        if check.op in ("in", "not in") and not isinstance(check.value, list):
            raise HTTPException(status_code=400, detail="'in' and 'not in' need a list of values")
        if check.op in (">", "<"):
            try:
                float(check.value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="'>' and '<' need a number")


def save_template(cursor, user_id, template, template_id):
    """Adds a template (template_id = 0) or updates an existing one."""
    action_query = """
        SELECT nm.module_code
        FROM notif_actions na
        JOIN notif_modules nm ON nm.module_id = na.module_id
        WHERE na.action_id = %(action_id)s AND na.is_deleted = 0
    """
    cursor.execute(action_query, {"action_id": template.action_id})
    action_row = cursor.fetchone()
    if not action_row:
        raise HTTPException(status_code=400, detail="Action not found")

    if not template.template_name.strip():
        raise HTTPException(status_code=400, detail="Template name is required")
    if not template.recipients:
        raise HTTPException(status_code=400, detail="Add at least one recipient")

    # Reject unknown roles / groups: they would silently send to nobody
    module_help = require_module_help(action_row["module_code"])
    valid_roles = []
    for role in module_help["roles"]:
        valid_roles.append(role["value"])

    valid_fields = []
    for field in module_help["fields"]:
        valid_fields.append(field["value"])
    check_condition_fields(template.condition, valid_fields)

    cursor.execute("SELECT group_code FROM notif_groups WHERE is_deleted = 0")
    valid_group_codes = []
    for group_row in cursor.fetchall():
        valid_group_codes.append(group_row["group_code"])

    recipient_list = []
    for entry in template.recipients:
        if entry.type not in ("GROUP", "ROLE", "EMPLOYEE"):
            raise HTTPException(status_code=400, detail="Recipient type must be GROUP, ROLE or EMPLOYEE")
        if entry.send_as not in ("TO", "CC", "BCC"):
            raise HTTPException(status_code=400, detail="Recipient send_as must be TO, CC or BCC")
        if entry.type == "ROLE" and entry.value not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Role '{entry.value}' is not available for this module")
        if entry.type == "GROUP" and entry.value not in valid_group_codes:
            raise HTTPException(status_code=400, detail=f"Group '{entry.value}' does not exist")
        if entry.type == "EMPLOYEE" and not str(entry.value).isdigit():
            raise HTTPException(status_code=400, detail="Employee recipient must be a user id")
        check_condition_fields(entry.condition, valid_fields)

        recipient_list.append(entry.model_dump())

    attachment_list = []
    if template.attachments:
        for entry in template.attachments:
            if entry.type not in ("API", "URL", "STATIC"):
                raise HTTPException(status_code=400, detail="Attachment type must be API, URL or STATIC")
            if entry.method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                raise HTTPException(status_code=400, detail="Attachment method must be GET, POST, PUT, PATCH or DELETE")
            if entry.type in ("API", "URL") and not entry.api_endpoint and not entry.url:
                raise HTTPException(status_code=400, detail="Attachment: provide the API endpoint or URL")
            check_condition_fields(entry.condition, valid_fields)
            attachment_list.append(entry.model_dump())

    condition_text = None
    if template.condition:
        condition_list = []
        for check in template.condition:
            condition_list.append(check.model_dump())
        condition_text = json.dumps(condition_list)

    attachments_text = None
    if attachment_list:
        attachments_text = json.dumps(attachment_list)

    values = {
        "template_id": template_id,
        "action_id": template.action_id,
        "template_name": template.template_name.strip(),
        "subject": template.subject,
        "body": template.body,
        "condition_json": condition_text,
        "recipients_json": json.dumps(recipient_list),
        "attachments_json": attachments_text,
        "stop_on_match": template.stop_on_match,
        "is_fallback": template.is_fallback,
        "exclude_actor": template.exclude_actor,
        "user_id": user_id,
    }

    if template_id == 0:
        insert_query = """
            INSERT INTO notif_templates
                (action_id, template_name, subject, body, condition_json, recipients_json,
                 attachments_json, stop_on_match, is_fallback, exclude_actor,
                 created_by, updated_by)
            VALUES
                (%(action_id)s, %(template_name)s, %(subject)s, %(body)s, %(condition_json)s,
                 %(recipients_json)s, %(attachments_json)s, %(stop_on_match)s,
                 %(is_fallback)s, %(exclude_actor)s, %(user_id)s, %(user_id)s)
        """
        cursor.execute(insert_query, values)
        return cursor.lastrowid

    exists_query = "SELECT template_id FROM notif_templates WHERE template_id = %(template_id)s AND is_deleted = 0"
    cursor.execute(exists_query, values)
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Template not found")

    update_query = """
        UPDATE notif_templates
        SET action_id = %(action_id)s, template_name = %(template_name)s, subject = %(subject)s,
            body = %(body)s, condition_json = %(condition_json)s, recipients_json = %(recipients_json)s,
            attachments_json = %(attachments_json)s,
            stop_on_match = %(stop_on_match)s, is_fallback = %(is_fallback)s,
            exclude_actor = %(exclude_actor)s, updated_by = %(user_id)s
        WHERE template_id = %(template_id)s
    """
    cursor.execute(update_query, values)
    return template_id


def delete_template(cursor, user_id, template_id):
    delete_query = """
        UPDATE notif_templates
        SET is_deleted = 1, updated_by = %(user_id)s
        WHERE template_id = %(template_id)s AND is_deleted = 0
    """
    cursor.execute(delete_query, {"template_id": template_id, "user_id": user_id})
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Template not found")


def list_groups(cursor):
    """Groups with their members (name and email read live from the users table)."""
    cursor.execute("""
        SELECT group_id, group_code, group_name, user_ids
        FROM notif_groups
        WHERE is_deleted = 0
        ORDER BY group_name
    """)
    groups = cursor.fetchall()

    # Read the members of ALL groups with one query, then hand them out below
    all_user_ids = []
    for group in groups:
        member_ids = []
        if group.get("user_ids"):
            member_ids = json.loads(group["user_ids"])
        group["employee_ids"] = member_ids
        del group["user_ids"]
        all_user_ids.extend(member_ids)

    users_by_id = {}
    if all_user_ids:
        placeholders = ", ".join(["%s"] * len(all_user_ids))
        cursor.execute(
            f"SELECT user_id AS employee_id, name AS employee_name, email FROM users WHERE user_id IN ({placeholders})",
            all_user_ids,
        )
        for user in cursor.fetchall():
            users_by_id[user["employee_id"]] = user

    for group in groups:
        group["members"] = []
        for user_id in group["employee_ids"]:
            if user_id in users_by_id:
                group["members"].append(users_by_id[user_id])

    return groups


def save_group(cursor, group, group_id):
    """Adds a group (group_id = 0) or updates an existing one."""
    group_code = group.group_code.strip().upper()
    if not group_code or not group.group_name.strip():
        raise HTTPException(status_code=400, detail="Group code and name are required")

    code_query = """
        SELECT group_id, group_code FROM notif_groups
        WHERE (group_code = %(group_code)s OR group_id = %(group_id)s) AND is_deleted = 0
    """
    cursor.execute(code_query, {"group_code": group_code, "group_id": group_id})
    existing_rows = cursor.fetchall()

    for existing in existing_rows:
        if existing["group_code"] == group_code and existing["group_id"] != group_id:
            raise HTTPException(status_code=400, detail=f"A group with code '{group_code}' already exists")

    values = {
        "group_id": group_id,
        "group_code": group_code,
        "group_name": group.group_name.strip(),
        "user_ids": json.dumps(group.employee_ids),
    }

    if group_id == 0:
        # The code is unique even among deleted groups, so a deleted group's row is brought back
        cursor.execute("SELECT group_id FROM notif_groups WHERE group_code = %(group_code)s AND is_deleted = 1", values)
        deleted_group = cursor.fetchone()
        if deleted_group:
            values["deleted_group_id"] = deleted_group["group_id"]
            cursor.execute("""
                UPDATE notif_groups
                SET group_name = %(group_name)s, user_ids = %(user_ids)s, is_deleted = 0
                WHERE group_id = %(deleted_group_id)s
            """, values)
            return deleted_group["group_id"]

        cursor.execute("""
            INSERT INTO notif_groups (group_code, group_name, user_ids)
            VALUES (%(group_code)s, %(group_name)s, %(user_ids)s)
        """, values)
        return cursor.lastrowid

    # Templates refer to a group by its code, so the code cannot change
    old_group = None
    for existing in existing_rows:
        if existing["group_id"] == group_id:
            old_group = existing
    if old_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    if old_group["group_code"] != group_code:
        raise HTTPException(status_code=400, detail="A group's code cannot be changed, only its name and members")

    cursor.execute("""
        UPDATE notif_groups
        SET group_name = %(group_name)s, user_ids = %(user_ids)s
        WHERE group_id = %(group_id)s
    """, values)
    return group_id


def delete_group(cursor, group_id):
    """A group used by a live template cannot be deleted."""
    cursor.execute("SELECT group_code FROM notif_groups WHERE group_id = %(group_id)s AND is_deleted = 0", {"group_id": group_id})
    group_row = cursor.fetchone()
    if not group_row:
        raise HTTPException(status_code=404, detail="Group not found")

    template_query = """
        SELECT template_name
        FROM notif_templates
        WHERE is_deleted = 0
          AND JSON_CONTAINS(recipients_json, JSON_OBJECT('type', 'GROUP', 'value', %(group_code)s))
        LIMIT 1
    """
    cursor.execute(template_query, {"group_code": group_row["group_code"]})
    template_row = cursor.fetchone()
    if template_row:
        raise HTTPException(
            status_code=400,
            detail=f"Group is used by template '{template_row['template_name']}'. Remove it there first.",
        )

    cursor.execute("UPDATE notif_groups SET is_deleted = 1 WHERE group_id = %(group_id)s", {"group_id": group_id})


def list_employees(cursor, search_text, user_ids):
    """Users for the pickers: a name/email search (first 100), or exactly the
    given user_ids (search_text is then ignored)."""
    if user_ids:
        placeholders = ", ".join(["%s"] * len(user_ids))
        cursor.execute(
            f"SELECT user_id AS employee_id, name AS employee_name, email FROM users WHERE user_id IN ({placeholders})",
            user_ids,
        )
        return cursor.fetchall()

    query = """
        SELECT user_id AS employee_id, name AS employee_name, email
        FROM users
        WHERE is_deleted = 0 AND is_active = 1
          AND (name LIKE %(search)s OR email LIKE %(search)s)
        ORDER BY name
        LIMIT 100
    """
    cursor.execute(query, {"search": "%" + search_text.strip() + "%"})
    return cursor.fetchall()


def list_logs(cursor, module_code, module_key, status, page, page_size):
    """One page of the delivery log, newest first, plus the total. Empty text means no filter."""
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 200:
        page_size = 50

    filters = {}
    conditions = []
    if module_code != "":
        conditions.append("nl.module_code = %(module_code)s")
        filters["module_code"] = module_code
    if module_key != "":
        conditions.append("nl.module_key = %(module_key)s")
        filters["module_key"] = module_key
    if status != "":
        conditions.append("nl.status = %(status)s")
        filters["status"] = status

    where_text = ""
    if conditions:
        where_text = "WHERE " + " AND ".join(conditions)

    cursor.execute(f"SELECT COUNT(*) AS total FROM notif_logs nl {where_text}", filters)
    total = cursor.fetchone()["total"]

    filters["limit"] = page_size
    filters["offset"] = (page - 1) * page_size
    log_query = f"""
        SELECT nl.log_id, nl.template_id, nt.template_name, nl.module_code, nl.action_key,
               nl.module_key, nl.channel, nl.to_list, nl.cc_list, nl.bcc_list,
               nl.subject, nl.body, nl.attachments_list, nl.status, nl.error, nl.triggered_by, nl.created_time
        FROM notif_logs nl
        LEFT JOIN notif_templates nt ON nt.template_id = nl.template_id
        {where_text}
        ORDER BY nl.log_id DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """
    cursor.execute(log_query, filters)

    return {"total": total, "page": page, "page_size": page_size, "rows": cursor.fetchall()}


def send_test_notifications(conn, action_key, module_key, triggered_by):
    """Like a real send, but every mail goes only to the person who clicked, marked [TEST]. Nothing is logged."""
    results, problem = prepare_notifications(conn, action_key, module_key, triggered_by, None)
    if problem:
        raise HTTPException(status_code=404, detail=problem)

    me = get_user_contacts(conn, [triggered_by]).get(str(triggered_by))
    if me is None:
        raise HTTPException(status_code=400, detail="Your account has no email address, so a test cannot be sent")

    mails_sent = 0
    for result in results:
        if result["status"] != "READY":
            continue

        intro = (
            "This is a TEST. The real mail would go to:\n"
            f"To: {', '.join(result['to_emails'])}\n"
            f"Cc: {', '.join(result['cc_emails'])}\n"
            f"Bcc: {', '.join(result['bcc_emails'])}\n"
            "----------------------------------------\n\n"
        )
        if send_mail(to=[me["email"]], subject="[TEST] " + result["subject"], body=intro + result["body"]):
            mails_sent += 1

    return {"sent_to": me["email"], "mails_sent": mails_sent}
