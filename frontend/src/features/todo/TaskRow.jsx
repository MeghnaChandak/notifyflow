import React, { useState } from "react";
import { Checkbox, Input, Button, Tag } from "antd";
import { UserOutlined, CheckCircleFilled } from "@ant-design/icons";
import moment from "moment";
import { useNavigate } from "react-router-dom";

// "3 days overdue" / "Due today" / "Due Fri" — the wording does the work so a
// glance is enough, without having to compare dates in your head.
export function dueInfo(date) {
    if (!date) return { text: "No due date", color: undefined };
    const d = moment(date).startOf("day");
    const diff = d.diff(moment().startOf("day"), "days");
    if (diff < 0) return { text: `${-diff} day${-diff > 1 ? "s" : ""} overdue`, color: "red" };
    if (diff === 0) return { text: "Due today", color: "orange" };
    if (diff === 1) return { text: "Due tomorrow", color: "gold" };
    if (diff <= 7) return { text: `Due ${d.format("ddd")}`, color: "blue" };
    return { text: `Due ${d.format("MMM D")}`, color: undefined };
}

// How long this has been open, from its creation date — older items get warmer
// colours so stale work stands out without reading dates.
export function openForInfo(createdAt) {
    if (!createdAt) return null;
    const days = moment().startOf("day").diff(moment(createdAt).startOf("day"), "days");
    const text = days <= 0 ? "Opened today" : days === 1 ? "Open 1 day" : `Open ${days} days`;
    const color = days >= 30 ? "#cf1322" : days >= 14 ? "#d48806" : "#8c8c8c";
    return { text, color, title: `Created ${moment(createdAt).format("MMM D, YYYY")}` };
}

/**
 * Checkbox -> inline remark -> mark complete, used by MyTasksLanding. The title
 * itself is clickable through to that action's own edit page.
 */
export default function TaskRow({ todo, onComplete, completed, extra, showMeta }) {
    const navigate = useNavigate();
    const [completing, setCompleting] = useState(false);
    const [remark, setRemark] = useState("");
    const [hover, setHover] = useState(false);
    const goToTask = () => navigate(`/todo/edit/${todo.todo_id}`);
    const due = dueInfo(todo.target_date);
    const openFor = openForInfo(todo.created_at);

    const rowStyle = {
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "10px 12px",
        borderTop: "1px solid #f5f5f5",
        background: hover ? "#fafcff" : "#fff",
        transition: "background .15s",
    };

    if (completed) {
        return (
            <div style={rowStyle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
                <CheckCircleFilled style={{ color: "#52c41a", fontSize: 16, marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                        style={{ textDecoration: "line-through", color: "#8c8c8c", cursor: "pointer" }}
                        onClick={goToTask}
                    >
                        {todo.title}
                    </span>
                    {extra}
                </div>
            </div>
        );
    }

    if (completing) {
        return (
            <div style={{ ...rowStyle, background: "#f6ffed", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{todo.title}</div>
                <Input.TextArea
                    rows={2}
                    autoFocus
                    placeholder="What was done? A short remark is required to mark this complete."
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <Button size="small" onClick={() => setCompleting(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        disabled={!remark.trim()}
                        onClick={() => onComplete(todo, remark)}
                    >
                        Mark complete
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div style={rowStyle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <Checkbox onChange={() => setCompleting(true)} style={{ marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>
                    <span style={{ cursor: "pointer" }} onClick={goToTask}>
                        {todo.title}
                    </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <Tag color={due.color} style={{ marginRight: 0 }}>
                        {due.text}
                    </Tag>
                    {showMeta ? (
                        <span style={{ fontSize: 12, color: "#595959" }}>
                            <UserOutlined style={{ marginRight: 4, color: "#8c8c8c" }} />
                            To: {todo.assigned_to_name || "Unassigned"}
                        </span>
                    ) : (
                        todo.assigned_to_name && (
                            <span style={{ fontSize: 12, color: "#595959" }}>
                                <UserOutlined style={{ marginRight: 4, color: "#8c8c8c" }} />
                                {todo.assigned_to_name}
                            </span>
                        )
                    )}
                    {showMeta && todo.owner_name && (
                        <span style={{ fontSize: 12, color: "#8c8c8c" }}>· Owner: {todo.owner_name}</span>
                    )}
                    {showMeta && todo.created_by_name && (
                        <span style={{ fontSize: 12, color: "#8c8c8c" }}>· By: {todo.created_by_name}</span>
                    )}
                    {todo.team_name && <span style={{ fontSize: 12, color: "#8c8c8c" }}>· {todo.team_name}</span>}
                    {extra}
                </div>
            </div>
            {openFor && (
                <div
                    style={{ fontSize: 12, color: openFor.color, whiteSpace: "nowrap", marginTop: 2 }}
                    title={openFor.title}
                >
                    {openFor.text}
                </div>
            )}
        </div>
    );
}
