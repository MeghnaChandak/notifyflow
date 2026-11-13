"""
Notification engine: sends mails for an action using the rules in the notif_* tables.

Flow: a route queues dispatch_notification as a background task, which calls prepare_notifications
(works out the mails, sends nothing), sends the READY ones and writes notif_logs. It opens its own
connection because the request's connection is closed by the time the task runs.

To add a module (tickets, orders...): add an entry to MODULES with its fields and roles (shown on the
admin screens), a load_context function, the page path used for {{record_link}}, and register the
module and its actions in notif_modules / notif_actions.
"""

import ipaddress
import json
import socket
from datetime import datetime
from urllib.parse import urlparse

import requests
from fastapi import HTTPException
from loguru import logger

from app import config
from app.db import open_connection
from app.services import realtime
from app.services.mailer import send_mail

# Page of a record in the web UI, used for {{record_link}}
RECORD_LINK_PATHS = {
    "TODO": "/todo/edit/{record_id}",
}

TODO_HELP = {
    "fields": [
        {"value": "todo_id", "label": "To-Do ID"},
        {"value": "todo_code", "label": "To-Do code"},
        {"value": "title", "label": "Title"},
        {"value": "description", "label": "Description"},
        {"value": "target_date", "label": "Target date"},
        {"value": "priority", "label": "Priority"},
        {"value": "status", "label": "Status"},
        {"value": "department", "label": "Department"},
        {"value": "owner_name", "label": "Owner name"},
        {"value": "assigned_to_name", "label": "Assigned to name"},
        {"value": "is_subtask", "label": "Is a subtask (Yes / No)"},
        {"value": "linked_module", "label": "Linked system (first link)"},
        {"value": "linked_ref", "label": "Linked record reference (first link)"},
        {"value": "linked_title", "label": "Linked record title (first link)"},
        {"value": "linked_summary", "label": "Linked record summary (ready-made text)"},
        {"value": "record_link", "label": "Link to this task"},
    ],
    "roles": [
        {"value": "OWNER", "label": "Task owner"},
        {"value": "ASSIGNEE", "label": "Assigned to"},
        {"value": "SUBSCRIBERS", "label": "All subscribers"},
        {"value": "CREATED_BY", "label": "Task creator"},
        {"value": "ACTOR", "label": "Person who did the action"},
    ],
}


def build_record_link(module_code, record_id):
    """Full URL to a record's page, or "" if this module has no known page."""
    path_template = RECORD_LINK_PATHS.get(module_code, "")
    if path_template == "" or not record_id:
        return ""
    base_url = config.FRONTEND_BASE_URL.rstrip("/")
    return base_url + path_template.format(record_id=record_id)


def get_user_contacts(conn, user_ids):
    """One query for many users. Returns {str(user_id): {"name", "email"}}; users without an email,
    or that are disabled, are left out."""
    clean_ids = []
    for user_id in user_ids:
        if user_id:
            clean_ids.append(user_id)
    if not clean_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(clean_ids))
    query = f"""
        SELECT user_id, name, email
        FROM users
        WHERE user_id IN ({placeholders}) AND is_active = 1 AND is_deleted = 0
          AND email IS NOT NULL AND email != ''
    """
    cursor = conn.cursor()
    cursor.execute(query, clean_ids)

    # Keys are text so 5 and "5" still match
    contacts = {}
    for row in cursor.fetchall():
        contacts[str(row["user_id"])] = {"name": row["name"], "email": row["email"]}
    return contacts


def load_todo_context(conn, todo_id):
    """Values and roles for a to-do task (or subtask), including its first linked record.
    values feed {{placeholders}} and conditions; roles map a role name to a user id (or a list)."""
    cursor = conn.cursor()

    todo_query = """
        SELECT tt.todo_code, tt.title, tt.description, tt.target_date, tt.parent_todo_id,
               tt.owner_id, tt.assigned_to_id, tt.created_by,
               mts.todo_status_name, mtp.priority_name, d.department_name,
               assigned.name AS assigned_to_name,
               owner.name AS owner_name
        FROM todo_tasks tt
        LEFT JOIN todo_statuses mts ON mts.todo_status_id = tt.todo_status_id
        LEFT JOIN priorities mtp ON mtp.priority_id = tt.todo_priority_id
        LEFT JOIN departments d ON d.department_id = tt.department_id
        LEFT JOIN users assigned ON assigned.user_id = tt.assigned_to_id
        LEFT JOIN users owner ON owner.user_id = tt.owner_id
        WHERE tt.todo_id = %(todo_id)s AND tt.is_deleted = 0
    """
    cursor.execute(todo_query, {"todo_id": todo_id})
    todo_row = cursor.fetchone()
    if not todo_row:
        return None

    subscriber_query = """
        SELECT subscriber_id
        FROM todo_subscribers
        WHERE todo_id = %(todo_id)s AND is_deleted = 0
    """
    cursor.execute(subscriber_query, {"todo_id": todo_id})
    subscriber_ids = []
    for subscriber_row in cursor.fetchall():
        subscriber_ids.append(subscriber_row["subscriber_id"])

    link_query = """
        SELECT module_name, module_ref, module_record_id, title
        FROM todo_links
        WHERE todo_id = %(todo_id)s AND is_deleted = 0
        ORDER BY link_id
    """
    cursor.execute(link_query, {"todo_id": todo_id})
    links = cursor.fetchall()

    # The first link fills linked_module / linked_ref / linked_title; every link goes into linked_summary
    linked_module = ""
    linked_ref = ""
    linked_title = ""
    summary_parts = []
    for link in links:
        title = link["title"]
        if title is None:
            title = ""
        if linked_module == "":
            linked_module = link["module_name"]
            linked_ref = link["module_ref"]
            linked_title = title
        part = f"{link['module_name']} {link['module_ref']}"
        if title != "":
            part = part + f" - {title}"
        summary_parts.append(part)

    linked_summary = "; ".join(summary_parts)
    if linked_summary == "":
        linked_summary = "Not linked to any record"

    is_subtask = "No"
    if todo_row["parent_todo_id"]:
        is_subtask = "Yes"

    values = {
        "todo_id": todo_id,
        "todo_code": todo_row["todo_code"],
        "title": todo_row["title"],
        "description": todo_row["description"],
        "target_date": todo_row["target_date"],
        "priority": todo_row["priority_name"],
        "status": todo_row["todo_status_name"],
        "department": todo_row["department_name"],
        "owner_name": todo_row["owner_name"],
        "assigned_to_name": todo_row["assigned_to_name"],
        "is_subtask": is_subtask,
        "linked_module": linked_module,
        "linked_ref": linked_ref,
        "linked_title": linked_title,
        "linked_summary": linked_summary,
        "record_link": build_record_link("TODO", todo_id),
    }
    roles = {
        "OWNER": todo_row["owner_id"],
        "ASSIGNEE": todo_row["assigned_to_id"],
        "SUBSCRIBERS": subscriber_ids,
        "CREATED_BY": todo_row["created_by"],
    }
    return {"values": values, "roles": roles}


# One entry per module that can raise notifications
MODULES = {
    "TODO": {"help": TODO_HELP, "load_context": load_todo_context},
}


def condition_passes(condition, values):
    """Checks a condition list like [{"field": "priority", "op": "in", "value": ["High", "Critical"]}].
    Every check must be true; an empty condition passes. Values are compared as
    lower-case text, so 5 equals "5" and "High" equals "HIGH"."""
    if not condition:
        return True

    for check in condition:
        actual = values.get(check["field"])
        expected = check.get("value")
        op = check["op"]

        if op == "is empty":
            if actual is not None and str(actual) != "":
                return False
        elif op == "=":
            if str(actual).lower() != str(expected).lower():
                return False
        elif op == "!=":
            if str(actual).lower() == str(expected).lower():
                return False
        elif op == "in":
            expected_texts = []
            for item in expected:
                expected_texts.append(str(item).lower())
            if str(actual).lower() not in expected_texts:
                return False
        elif op == "not in":
            expected_texts = []
            for item in expected:
                expected_texts.append(str(item).lower())
            if str(actual).lower() in expected_texts:
                return False
        elif op == "contains":
            if str(expected).lower() not in str(actual).lower():
                return False
        elif op in (">", "<"):
            # A value that is not a number (e.g. a text field) never matches
            try:
                actual_number = float(actual)
                expected_number = float(expected)
            except (TypeError, ValueError):
                return False
            if op == ">" and actual_number <= expected_number:
                return False
            if op == "<" and actual_number >= expected_number:
                return False
        else:
            logger.warning(f"Unknown condition operator '{op}', treating the condition as false")
            return False

    return True


def fill_placeholders(text, values):
    """Replaces {{name}} with values["name"]. Empty or unknown names become '-'.
    Plain text replacement only: nothing in a template is ever evaluated."""
    for name, value in values.items():
        replacement = "-"
        if value is not None and str(value) != "":
            replacement = str(value)
        text = text.replace("{{" + name + "}}", replacement)

    # Any {{name}} still left has no value, so it becomes '-'
    while "{{" in text:
        start = text.find("{{")
        end = text.find("}}", start)
        if end == -1:
            break
        text = text[:start] + "-" + text[end + 2:]

    return text


def replace_placeholders_in_value(value, values):
    """Recursively fills placeholders in strings, dicts and lists."""
    if isinstance(value, str):
        return fill_placeholders(value, values)
    if isinstance(value, dict):
        new_dict = {}
        for key, item in value.items():
            new_dict[key] = replace_placeholders_in_value(item, values)
        return new_dict
    if isinstance(value, list):
        new_list = []
        for item in value:
            new_list.append(replace_placeholders_in_value(item, values))
        return new_list
    return value


def first_value(candidates, default):
    """Returns the first candidate that is not None / empty, otherwise default."""
    for candidate in candidates:
        if candidate:
            return candidate
    return default


# ---------------------------------------------------------------------------
# Attachments (fetched from a URL an admin typed into a template)
# ---------------------------------------------------------------------------

def check_url_is_safe(url):
    """Only http / https, an optional host allow-list (ATTACHMENT_ALLOWED_HOSTS), and the host must
    resolve to public addresses only, so a template cannot make the server call localhost, the internal
    network or cloud metadata addresses. Raises ValueError when the URL is not allowed."""
    parsed_url = urlparse(url)
    if parsed_url.scheme not in ("http", "https"):
        raise ValueError(f"Attachment URL must start with http or https: {url}")
    if not parsed_url.hostname:
        raise ValueError(f"Attachment URL has no host name: {url}")

    if config.ATTACHMENT_ALLOWED_HOSTS and parsed_url.hostname.lower() not in config.ATTACHMENT_ALLOWED_HOSTS:
        raise ValueError(f"Attachment host is not in ATTACHMENT_ALLOWED_HOSTS: {parsed_url.hostname}")

    for address_info in socket.getaddrinfo(parsed_url.hostname, None):
        ip_address = ipaddress.ip_address(address_info[4][0])
        if not ip_address.is_global:
            raise ValueError(f"Attachment URL points to a non-public address ({ip_address}): {url}")


def download_file(method, url, headers=None, params=None, payload=None):
    """Downloads one URL after the safety check. Redirects are refused (the target would skip the
    check) and the size is capped. Returns the response and its bytes."""
    check_url_is_safe(url)
    response = requests.request(
        method, url, headers=headers, params=params, json=payload,
        timeout=30, allow_redirects=False, stream=True,
    )
    try:
        if response.is_redirect:
            raise ValueError(f"Attachment URL redirects, which is not allowed: {url}")
        response.raise_for_status()

        content = b""
        for chunk in response.iter_content(chunk_size=65536):
            content = content + chunk
            if len(content) > config.ATTACHMENT_MAX_BYTES:
                raise ValueError(f"Attachment is larger than {config.ATTACHMENT_MAX_BYTES} bytes: {url}")
        return response, content
    finally:
        response.close()


def add_api_attachments(resolved_rule, endpoint, attachments):
    """API mode: call the endpoint, then pick the file link(s) out of the answer."""
    method = first_value([resolved_rule.get("method")], "GET").upper()
    payload_to_send = resolved_rule.get("payload")
    if not payload_to_send:
        payload_to_send = None

    response, content = download_file(
        method, endpoint, resolved_rule.get("headers"), resolved_rule.get("params"), payload_to_send
    )

    payload = None
    is_json = response.headers.get("content-type", "").lower().startswith("application/json")
    if is_json:
        payload = json.loads(content)

    # The answer is either a list of files, {"data": [...]}, {"attachments": [...]} or one file
    candidates = []
    if isinstance(payload, list):
        candidates = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            candidates = payload["data"]
        elif isinstance(payload.get("attachments"), list):
            candidates = payload["attachments"]
        else:
            candidates = [payload]

    found_files = []
    for item in candidates:
        if not isinstance(item, dict):
            continue

        file_url = first_value([item.get("url"), item.get("download_url"), item.get("file_url")], None)
        if not file_url:
            continue

        filename = first_value(
            [item.get("filename"), item.get("name"), resolved_rule.get("filename")],
            f"attachment_{len(attachments) + len(found_files) + 1}",
        )
        content_type = first_value(
            [item.get("content_type"), resolved_rule.get("content_type")], "application/octet-stream"
        )
        _, file_content = download_file("GET", file_url)
        found_files.append({"filename": filename, "content": file_content, "content_type": content_type})

    # No file links found: treat the whole answer as the file, unless it was a JSON object
    if not found_files:
        if is_json and isinstance(payload, dict):
            return
        found_files.append({
            "filename": first_value([resolved_rule.get("filename")], f"attachment_{len(attachments) + 1}"),
            "content": content,
            "content_type": first_value(
                [resolved_rule.get("content_type")], response.headers.get("content-type", "application/octet-stream")
            ),
        })

    attachments.extend(found_files)


def add_url_attachment(resolved_rule, endpoint, attachments):
    """URL mode: download one file from a fixed URL."""
    response, content = download_file("GET", endpoint)
    filename = first_value([resolved_rule.get("filename"), endpoint.split("/")[-1]], "attachment")
    content_type = first_value(
        [resolved_rule.get("content_type")], response.headers.get("content-type", "application/octet-stream")
    )
    attachments.append({"filename": filename, "content": content, "content_type": content_type})


def resolve_template_attachments(template, values):
    """Builds the attachment list of a template from its attachment rules (type API, URL or STATIC).
    A rule that fails is logged and skipped, so one bad attachment never blocks the mail."""
    attachments = []
    rules = template.get("attachments")
    if rules is None:
        rules = []

    for rule in rules:
        if not rule:
            continue
        if not condition_passes(rule.get("condition"), values):
            continue

        resolved_rule = replace_placeholders_in_value(rule, values)
        attachment_type = first_value([resolved_rule.get("type")], "API").upper()
        endpoint = first_value([resolved_rule.get("api_endpoint"), resolved_rule.get("url")], None)

        try:
            if attachment_type == "API":
                if endpoint:
                    add_api_attachments(resolved_rule, endpoint, attachments)
            elif attachment_type == "URL":
                if endpoint:
                    add_url_attachment(resolved_rule, endpoint, attachments)
            else:
                attachments.append({
                    "filename": first_value([resolved_rule.get("filename")], "attachment"),
                    "content": first_value([resolved_rule.get("content")], b""),
                    "content_type": first_value([resolved_rule.get("content_type")], "application/octet-stream"),
                })
        except Exception as e:
            # Deliberate: skip this attachment, the mail itself must still go out
            logger.warning(f"Notification attachment rule failed: {e}")

    return attachments


# ---------------------------------------------------------------------------
# Preparing and sending
# ---------------------------------------------------------------------------

def prepare_notifications(conn, action_key, module_key, triggered_by=None, extra=None):
    """Works out which mails an action should send. Sends nothing.
    Returns (results, problem): problem is a text like "record not found" (else "");
    results has one dict per template with status READY or SKIPPED (error says why),
    plus template_id, template_name, channel, module_code, to_emails, cc_emails,
    bcc_emails, to_user_ids, subject, body and attachments."""
    if extra is None:
        extra = {}

    cursor = conn.cursor()

    action_query = """
        SELECT na.action_id, nm.module_code
        FROM notif_actions na
        JOIN notif_modules nm ON nm.module_id = na.module_id
        WHERE na.action_key = %(action_key)s AND na.is_deleted = 0 AND nm.is_deleted = 0
    """
    cursor.execute(action_query, {"action_key": action_key})
    action_row = cursor.fetchone()
    if not action_row:
        return [], f"no active action found for key {action_key}"
    module_code = action_row["module_code"]

    module = MODULES.get(module_code)
    if module is None:
        return [], f"module {module_code} has no context loader"
    context = module["load_context"](conn, module_key)
    if context is None:
        return [], f"record {module_key} not found for {action_key}"

    values = context["values"]
    values.update(extra)
    roles = context["roles"]
    roles["ACTOR"] = triggered_by

    # Normal templates first (oldest first), fallback templates last
    template_query = """
        SELECT template_id, template_name, channel, subject, body, condition_json,
               recipients_json, attachments_json, stop_on_match, is_fallback, exclude_actor
        FROM notif_templates
        WHERE action_id = %(action_id)s AND is_deleted = 0
        ORDER BY is_fallback ASC, template_id ASC
    """
    cursor.execute(template_query, {"action_id": action_row["action_id"]})
    templates = cursor.fetchall()

    group_query = "SELECT group_code, user_ids FROM notif_groups WHERE is_deleted = 0"
    cursor.execute(group_query)
    group_members = {}
    for group_row in cursor.fetchall():
        group_members[group_row["group_code"]] = json.loads(group_row["user_ids"])

    results = []
    already_emailed = set()  # a person gets at most one mail per action
    ready_any = False
    stopped = False

    for template in templates:
        status = "READY"
        error = ""
        subject = ""
        body = ""
        to_emails = []
        cc_emails = []
        bcc_emails = []
        to_user_ids = []
        attachments = []

        condition = None
        if template.get("condition_json"):
            condition = json.loads(template["condition_json"])

        if stopped:
            status = "SKIPPED"
            error = "an earlier template stopped the rest"
        elif template["is_fallback"] == 1 and ready_any:
            status = "SKIPPED"
            error = "fallback not needed, another template already applies"
        elif not condition_passes(condition, values):
            status = "SKIPPED"
            error = "template condition is false"
        else:
            recipients = json.loads(template["recipients_json"])
            template_attachments = []
            if template.get("attachments_json"):
                template_attachments = json.loads(template["attachments_json"])
            template["attachments"] = template_attachments

            # Step 1: list every person this template wants, as (send_as, user_id)
            wanted_people = []
            for entry in recipients:
                if not condition_passes(entry.get("condition"), values):
                    continue

                user_ids = []
                if entry["type"] == "GROUP":
                    user_ids = group_members.get(entry["value"], [])
                elif entry["type"] == "ROLE":
                    role_holder = roles.get(entry["value"])
                    if isinstance(role_holder, list):
                        user_ids = role_holder
                    else:
                        user_ids = [role_holder]
                elif entry["type"] == "EMPLOYEE":
                    user_ids = [entry["value"]]

                for user_id in user_ids:
                    wanted_people.append({"send_as": entry.get("send_as", "TO"), "user_id": user_id})

            # Step 2: one query for everybody's email
            wanted_ids = []
            for person in wanted_people:
                wanted_ids.append(person["user_id"])
            contacts = get_user_contacts(conn, wanted_ids)

            # Step 3: build the To / Cc / Bcc lists. TO first, then CC, then BCC,
            # so a person who is listed twice keeps the strongest slot.
            for send_as in ["TO", "CC", "BCC"]:
                for person in wanted_people:
                    if person["send_as"] != send_as:
                        continue
                    if template["exclude_actor"] == 1 and person["user_id"] == triggered_by:
                        continue

                    contact = contacts.get(str(person["user_id"]))
                    if contact is None:
                        continue

                    email = contact["email"]
                    if email in already_emailed:
                        continue
                    already_emailed.add(email)

                    if send_as == "TO":
                        to_emails.append(email)
                    elif send_as == "CC":
                        cc_emails.append(email)
                    else:
                        bcc_emails.append(email)
                    to_user_ids.append(int(person["user_id"]))

            subject = fill_placeholders(template["subject"], values)
            body = fill_placeholders(template["body"], values)
            attachments = resolve_template_attachments(template, values)

            if not to_emails:
                status = "SKIPPED"
                error = "no recipients found"
            else:
                ready_any = True
                if template["stop_on_match"] == 1:
                    stopped = True

        results.append({
            "template_id": template["template_id"],
            "template_name": template["template_name"],
            "channel": template["channel"],
            "module_code": module_code,
            "status": status,
            "error": error,
            "to_emails": to_emails,
            "cc_emails": cc_emails,
            "bcc_emails": bcc_emails,
            "to_user_ids": to_user_ids,
            "subject": subject,
            "body": body,
            "attachments": attachments,
        })

    return results, ""


def send_notifications(conn, action_key, module_key, triggered_by=None, extra=None):
    """Sends every notification set up for this action, writes one log row for each, and drops the
    message in each recipient's in-app inbox. Nothing is committed here; dispatch_notification commits once."""
    results, problem = prepare_notifications(conn, action_key, module_key, triggered_by, extra)
    if problem:
        logger.warning(f"Notification {action_key}: {problem}")
        return

    cursor = conn.cursor()
    log_query = """
        INSERT INTO notif_logs
            (template_id, module_code, action_key, module_key, channel,
             to_list, cc_list, bcc_list, subject, body, attachments_list,
             status, error, triggered_by, created_time)
        VALUES
            (%(template_id)s, %(module_code)s, %(action_key)s, %(module_key)s, %(channel)s,
             %(to_list)s, %(cc_list)s, %(bcc_list)s, %(subject)s, %(body)s, %(attachments_list)s,
             %(status)s, %(error)s, %(triggered_by)s, %(created_time)s)
    """

    for result in results:
        status = result["status"]
        error = result["error"]

        if status == "READY":
            sent = send_mail(
                to=result["to_emails"],
                subject=result["subject"],
                body=result["body"],
                cc=result["cc_emails"],
                bcc=result["bcc_emails"],
                attachments=result["attachments"],
            )
            if sent:
                status = "SENT"
            else:
                status = "FAILED"
                error = "mail could not be sent, see server log"

            if sent:
                realtime.add_inbox_messages(
                    conn, result["to_user_ids"], result["subject"], result["body"],
                    result["module_code"], str(module_key),
                )

        attachment_names = []
        for attachment in result["attachments"]:
            attachment_names.append(attachment.get("filename", "attachment"))

        cursor.execute(log_query, {
            "template_id": result["template_id"],
            "module_code": result["module_code"],
            "action_key": action_key,
            "module_key": str(module_key),
            "channel": result["channel"],
            "to_list": ", ".join(result["to_emails"]),
            "cc_list": ", ".join(result["cc_emails"]),
            "bcc_list": ", ".join(result["bcc_emails"]),
            "subject": result["subject"],
            "body": result["body"],
            "attachments_list": ", ".join(attachment_names),
            "status": status,
            "error": error,
            "triggered_by": triggered_by,
            "created_time": datetime.now(),
        })


def dispatch_notification(action_key, module_key, triggered_by=None, extra=None):
    """Background task used by the routes, so the user does not wait for the mails. Opens its own
    connection, sends the notifications and commits the log rows once. A failure is only logged
    because the response is already sent."""
    conn = open_connection()
    try:
        send_notifications(conn, action_key, module_key, triggered_by, extra)
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Notification {action_key} for record {module_key} failed: {e}")
    finally:
        conn.close()


def require_module_help(module_code):
    module = MODULES.get(module_code)
    if module is None:
        return {"fields": [], "roles": []}
    return module["help"]


def check_known_module(module_code):
    if module_code not in MODULES:
        raise HTTPException(status_code=400, detail=f"Unknown module {module_code}")
