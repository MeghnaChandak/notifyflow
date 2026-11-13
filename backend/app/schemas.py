from datetime import datetime
import re
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str = Field(max_length=190)
    password: str = Field(max_length=200)


# ---------------------------------------------------------------------------
# To-Do
# ---------------------------------------------------------------------------

class TodoTask(BaseModel):
    todo_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    todo_status_id: Optional[int] = None
    todo_priority_id: Optional[int] = None
    term_type: Optional[str] = None
    target_date: Optional[datetime] = None
    owner_id: Optional[int] = None
    department_id: Optional[int] = None
    assigned_date: Optional[datetime] = None
    is_private: Optional[int] = 0
    assigned_to_id: Optional[int] = None
    parent_todo_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Title cannot be empty")
        if len(v) > 100:
            raise ValueError("Title cannot be longer than 100 characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        if v is not None and len(v) > 255:
            raise ValueError("Description cannot be longer than 255 characters")
        return v

    @field_validator("term_type")
    @classmethod
    def validate_term_type(cls, v):
        if v is not None and len(v) > 50:
            raise ValueError("Term type cannot be longer than 50 characters")
        return v


class TodoTags(BaseModel):
    todo_id: int
    tags: List[str] = []

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v):
        for tag in v:
            if len(tag) > 50:
                raise ValueError("A tag cannot be longer than 50 characters")
        return v


class TodoMailer(BaseModel):
    todo_id: int


class UpdateTodoComment(BaseModel):
    todo_id: int
    comment: str

    @field_validator("comment")
    @classmethod
    def validate_comment(cls, v):
        if len(v) > 255:
            raise ValueError("Comment cannot be longer than 255 characters")
        if len(v.strip()) == 0:
            raise ValueError("Comment cannot be empty")
        return v


class Subscribers(BaseModel):
    todo_id: int
    subscriber_id: int


class Attachments(BaseModel):
    todo_id: int
    attachments: Optional[List[dict]] = []


class Links(BaseModel):
    link_id: Optional[int] = None
    todo_id: int
    module_name: str = Field(max_length=50)
    module_ref: str = Field(max_length=100)
    module_record_id: Optional[str] = Field(default=None, max_length=255)
    title: Optional[str] = Field(default=None, max_length=100)
    url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v):
        # Only web addresses: a javascript: or data: link must never be stored and rendered as a link
        if v is None or v.strip() == "":
            return None
        value = v.strip()
        if not (value.lower().startswith("http://") or value.lower().startswith("https://")):
            raise ValueError("Link URL must start with http:// or https://")
        return value


# ---------------------------------------------------------------------------
# Notification settings
# ---------------------------------------------------------------------------

class ConditionCheck(BaseModel):
    field: str
    op: str  # = != in "not in" > < contains "is empty"
    value: Optional[Any] = None


class AttachmentRule(BaseModel):
    type: str = "API"  # API, URL or STATIC
    method: str = "GET"
    api_endpoint: Optional[str] = None
    url: Optional[str] = None
    tag: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    headers: Optional[dict] = None
    params: Optional[dict] = None
    payload: Optional[dict] = None
    condition: Optional[List[ConditionCheck]] = None


class RecipientEntry(BaseModel):
    send_as: str = "TO"  # TO, CC or BCC
    type: str  # GROUP, ROLE or EMPLOYEE
    value: Any  # group code, role name or user id, depending on type
    condition: Optional[List[ConditionCheck]] = None


class AddNotificationTemplate(BaseModel):
    action_id: int
    template_name: str = Field(max_length=150)
    subject: str = Field(max_length=255)
    body: str = Field(max_length=20000)
    recipients: List[RecipientEntry]
    attachments: Optional[List[AttachmentRule]] = None
    condition: Optional[List[ConditionCheck]] = None
    stop_on_match: Optional[int] = 0
    is_fallback: Optional[int] = 0
    exclude_actor: Optional[int] = 0


class EditNotificationTemplate(AddNotificationTemplate):
    template_id: int


class AddNotificationGroup(BaseModel):
    group_code: str = Field(max_length=50)
    group_name: str = Field(max_length=100)
    employee_ids: List[int]


class EditNotificationGroup(AddNotificationGroup):
    group_id: int


class NotificationPreviewRequest(BaseModel):
    action_key: str
    module_key: int


class InboxMarkRead(BaseModel):
    inbox_ids: List[int]


# ---------------------------------------------------------------------------
# Users (administrators only)
# ---------------------------------------------------------------------------

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def check_email(value):
    cleaned = value.strip().lower()
    if not EMAIL_PATTERN.match(cleaned) or len(cleaned) > 190:
        raise ValueError("Enter a valid email address")
    return cleaned


def check_password(value):
    if len(value) < 10:
        raise ValueError("Password must be at least 10 characters")
    if len(value) > 200:
        raise ValueError("Password is too long")
    return value


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: str
    password: str
    role: Literal["ADMIN", "USER"] = "USER"
    department_id: Optional[int] = None
    manager_id: Optional[int] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return check_email(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return check_password(v)


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    role: Optional[Literal["ADMIN", "USER"]] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    is_active: Optional[int] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if v is None:
            return v
        return check_password(v)
