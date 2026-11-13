import React, { useState, useEffect } from "react";
import { Input } from "antd";

const { TextArea } = Input;

/**
 * Shared "@mention" text input. An @mention fills the parent's Assignee dropdown first, then its
 * Subscribers dropdown, so the dropdowns always show the truth. The parent owns the resolved
 * description, assignee and subscribers.
 */
export default function TaskTagInput({
    value,
    onChange,
    employees = [],
    onAssigneeResolved,
    onSubscribersResolved,
    assigneeId = null,
    subscriberIds = [],
    placeholder = "What needs to happen? Use @ to assign someone.",
    autoFocus = false,
}) {
    const [mentionQuery, setMentionQuery] = useState(null); // {tokenStart, query}
    const [highlightIndex, setHighlightIndex] = useState(0);

    const mentionOptions = mentionQuery
        ? employees
              .filter((emp) =>
                  (emp.employee_name || emp.name || "")
                      .toLowerCase()
                      .includes(mentionQuery.query.toLowerCase())
              )
              .slice(0, 6)
        : [];

    // Reset the keyboard-highlighted option whenever the candidate list changes underneath it.
    useEffect(() => {
        setHighlightIndex(0);
    }, [mentionQuery?.query]);

    const handleKeyDown = (e) => {
        if (!mentionQuery || mentionOptions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIndex((i) => (i + 1) % mentionOptions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            pickAssignee(mentionOptions[Math.min(highlightIndex, mentionOptions.length - 1)]);
        }
    };

    const handleTextChange = (e) => {
        const text = e.target.value;
        const cursor = e.target.selectionStart ?? text.length;
        onChange(text);

        // Look backward from the cursor for an in-progress "@".
        const upToCursor = text.slice(0, cursor);
        const atMatch = upToCursor.match(/@([A-Za-z0-9._ ]*)$/);
        if (atMatch) {
            setMentionQuery({ tokenStart: cursor - atMatch[0].length, query: atMatch[1] || "" });
        } else {
            setMentionQuery(null);
        }
    };

    // First @mention resolved becomes the assignee; any after that become subscribers.
    const pickAssignee = (emp) => {
        const id = emp.employee_id || emp.id;
        const name = emp.employee_name || emp.name;
        const tokenStart = mentionQuery.tokenStart;
        const tokenEnd = tokenStart + 1 + mentionQuery.query.length;
        onChange(value.slice(0, tokenStart) + `@${name} ` + value.slice(tokenEnd));
        setMentionQuery(null);

        if (!assigneeId) {
            onAssigneeResolved && onAssigneeResolved(id);
            return;
        }
        if (id === assigneeId || subscriberIds.includes(id)) return;
        onSubscribersResolved && onSubscribersResolved([...subscriberIds, id]);
    };

    return (
        <div style={{ position: "relative" }}>
            <TextArea
                maxLength={255}
                autoFocus={autoFocus}
                rows={3}
                placeholder={placeholder}
                value={value}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
            />

            {mentionQuery && (
                <div
                    style={{
                        marginTop: 8,
                        border: "1px solid #f0f0f0",
                        borderRadius: 6,
                        maxHeight: 200,
                        overflowY: "auto",
                    }}
                >
                    {mentionOptions.length === 0 ? (
                        <div style={{ padding: "8px 12px", color: "#999", fontSize: 12 }}>No matches.</div>
                    ) : (
                        mentionOptions.map((emp, idx) => (
                            <div
                                key={emp.employee_id || emp.id}
                                style={{
                                    padding: "6px 12px",
                                    cursor: "pointer",
                                    background: idx === highlightIndex ? "#e6f4ff" : undefined,
                                }}
                                onMouseEnter={() => setHighlightIndex(idx)}
                                onClick={() => pickAssignee(emp)}
                            >
                                {emp.employee_name || emp.name}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
