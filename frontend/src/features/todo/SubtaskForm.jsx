import React, { useState, useEffect, useRef } from "react";
import { Button, Select, DatePicker, Input, Row, Col, Tag, Tabs, Spin, message } from "antd";
import { LockOutlined, LinkOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import TaskTagInput from "./TaskTagInput";
import todoApi from "./todoApi";
import { useFunctionDebounce } from "../../components/useFunctionDebounce";
import SaveWithNotification from "../../components/SaveWithNotification";

const { Option } = Select;

// No separate Title field — the stored title is derived from the description's
// first line/sentence rather than a blind character slice, so short descriptions
// don't just duplicate themselves and long ones don't get cut mid-word.
export function deriveTitle(description) {
    const firstLine = description.split("\n")[0].trim();
    const sentenceMatch = firstLine.match(/^.*?[.!?](?=\s|$)/);
    const candidate = sentenceMatch ? sentenceMatch[0] : firstLine;
    return candidate.length > 80 ? `${candidate.slice(0, 77)}...` : candidate;
}

function FieldLabel({ children, required }) {
    return (
        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            {children}
            {required && <span style={{ color: "#d4380d", fontWeight: 700, marginLeft: 3 }}>*</span>}
        </div>
    );
}

/**
 * Every task created from anywhere other than the full ToDoCreatePage is a subtask
 * of some existing todo — there's no path to a standalone task from here. When
 * lockedParent is passed (opened from inside a parent task's page) the parent is
 * fixed; otherwise the user searches for one or clicks "New todo" to go make one.
 *
 * Shared by QuickAddTaskModal (navbar, anywhere) and AddSubtaskModal (from a parent's
 * detail page) so the required-field/tab layout only lives in one place.
 */
export default function SubtaskForm({ open, lockedParent = null, onCreateNewTodo, onSaved, onCancel }) {
    const [description, setDescription] = useState("");
    const [assigneeId, setAssigneeId] = useState(null);
    const [subscriberIds, setSubscriberIds] = useState([]);
    const [statusId, setStatusId] = useState(null);
    const [priorityId, setPriorityId] = useState(null);
    const [targetDate, setTargetDate] = useState(null);
    const [tags, setTags] = useState([]);

    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);

    // Parent picker — only relevant when nothing is locked in.
    const [parentQuery, setParentQuery] = useState("");
    const [parentOptions, setParentOptions] = useState([]);
    const [parentLoading, setParentLoading] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const parent = lockedParent || selectedParent;

    // Team and privacy come from the todo and cannot be changed on an action
    let parentTeamName = "Same as the todo";
    if (parent && parent.department_id) {
        const parentTeam = departments.find((d) => (d.department_id || d.id) === parent.department_id);
        if (parentTeam) {
            parentTeamName = parentTeam.department_name || parentTeam.name;
        }
    }

    useFunctionDebounce(
        async (cancelToken) => {
            if (lockedParent || !open) {
                setParentOptions([]);
                return;
            }
            setParentLoading(true);
            try {
                const res = await axios.get("/search_todo_tasks", {
                    params: { search_text: parentQuery },
                    cancelToken,
                });
                setParentOptions(res.data?.data || []);
            } catch (err) {
                setParentOptions([]);
            } finally {
                setParentLoading(false);
            }
        },
        350,
        [open, parentQuery]
    );

    useEffect(() => {
        if (!open) return;
        Promise.all([
            axios.get("/get_todo_statuses"),
            axios.get("/get_all_priorities"),
            axios.get("/get_all_departments"),
            axios.get("/get_employees"),
        ])
            .then(([statusesRes, prioritiesRes, departmentsRes, employeesRes]) => {
                const statusList = statusesRes.data?.data || statusesRes.data || [];
                setStatuses(statusList);
                setPriorities(prioritiesRes.data?.data || prioritiesRes.data || []);
                setDepartments(departmentsRes.data?.data || departmentsRes.data || []);
                setEmployees(employeesRes.data?.data || employeesRes.data || []);

                const newStatus = statusList.find((s) => s.todo_status_name === "New");
                setStatusId(newStatus ? newStatus.todo_status_id : statusList[0]?.todo_status_id || null);

                const priorityList = prioritiesRes.data?.data || prioritiesRes.data || [];
                const naPriority = priorityList.find((p) => /^n\/?a$/i.test((p.priority_name || "").trim()));
                setPriorityId(naPriority ? naPriority.priority_id : null);
            })
            .catch(() => message.error("Failed to load the form options"));

        setDescription("");
        setAssigneeId(null);
        setSubscriberIds([]);
        setPriorityId(null);
        setTargetDate(null);
        setTags([]);
        setSelectedParent(null);
        setParentQuery("");
        setParentOptions([]);
    }, [open, lockedParent?.todo_id]);

    const canSave = !!parent && !!description.trim() && !!assigneeId && !!statusId;

    // Holds the last created task's full payload so onFinished (below) can still
    // pass it to onSaved, even though saveTask itself only returns the bare id.
    const lastCreatedRef = useRef(null);

    // Saves the task and everything attached to it (subscribers, tags), and
    // reports success/failure itself. Returns the new todo_id, or null on failure.
    // Must NOT call onSaved/navigate — SaveWithNotification needs this component to
    // stay mounted long enough to show its notification preview, see onFinished.
    const saveTask = async () => {
        // The Save button stays disabled until a parent, description, assignee and status are set
        try {
            const created = await todoApi.addSubtask(parent.todo_id, {
                title: deriveTitle(description.trim()),
                description: description.trim(),
                assigned_to_id: assigneeId,
                todo_status_id: statusId,
                todo_priority_id: priorityId,
                target_date: targetDate ? targetDate.format("YYYY-MM-DD HH:mm:ss") : null,
                department_id: parent.department_id,
                is_private: parent.is_private ? 1 : 0,
            });
            const todoId = created?.data?.todo_id;

            if (todoId) {
                // Each call returns true when it worked, so a failed one can be reported below
                const followUps = [];
                subscriberIds.forEach((subscriberId) => {
                    followUps.push(
                        axios
                            .post("/add_subscribers", { todo_id: todoId, subscriber_id: subscriberId })
                            .then(() => true)
                            .catch(() => false)
                    );
                });
                if (tags.length) followUps.push(todoApi.setTags(todoId, tags).then((result) => result.success));
                // The preview (if any) is built from these subscribers, so let them finish first
                const followUpResults = await Promise.all(followUps);
                if (followUpResults.includes(false)) {
                    message.warning("Action created, but some subscribers or tags could not be saved. Please check it.");
                }
            }

            message.success("Action created");
            lastCreatedRef.current = created?.data;
            return todoId || null;
        } catch (err) {
            message.error(err?.response?.data?.detail || "Failed to create action");
            return null;
        }
    };

    return (
        <div>
            {lockedParent ? (
                <Tag icon={<LockOutlined />} style={{ marginBottom: 12 }}>
                    Action under &mdash; {lockedParent.title || lockedParent.ref_no}
                </Tag>
            ) : parent ? (
                <Tag icon={<LinkOutlined />} color="blue" closable onClose={() => setSelectedParent(null)} style={{ marginBottom: 12 }}>
                    Todo &mdash; {parent.title}
                </Tag>
            ) : (
                <div style={{ marginBottom: 14 }}>
                    <FieldLabel required>LINK TO A TODO</FieldLabel>
                    <Select
                        showSearch
                        style={{ width: "100%" }}
                        placeholder="Select a todo, or type to search..."
                        suffixIcon={<SearchOutlined />}
                        filterOption={false}
                        notFoundContent={parentLoading ? <Spin size="small" /> : null}
                        searchValue={parentQuery}
                        onSearch={setParentQuery}
                        onChange={(val) => {
                            const found = parentOptions.find((o) => o.todo_id === val);
                            setSelectedParent(found || null);
                        }}
                    >
                        {parentOptions.map((o) => (
                            <Option key={o.todo_id} value={o.todo_id}>
                                {o.title} <span style={{ color: "#999" }}>({o.todo_code})</span>
                            </Option>
                        ))}
                    </Select>
                    <div style={{ marginTop: 8 }}>
                        <Button size="small" onClick={onCreateNewTodo}>
                            + New todo instead
                        </Button>
                    </div>
                </div>
            )}

            <Tabs
                defaultActiveKey="details"
                items={[
                    {
                        key: "details",
                        label: "Details",
                        children: (
                            <>
                                <FieldLabel required>DESCRIPTION</FieldLabel>
                                <TaskTagInput
                                    value={description}
                                    onChange={setDescription}
                                    employees={employees}
                                    onAssigneeResolved={setAssigneeId}
                                    onSubscribersResolved={setSubscriberIds}
                                    assigneeId={assigneeId}
                                    subscriberIds={subscriberIds}
                                    placeholder="Description — required. Use @ to assign someone (further @mentions become subscribers)."
                                    autoFocus
                                />

                                <Row gutter={12} style={{ marginTop: 14 }}>
                                    <Col span={12}>
                                        <FieldLabel required>ASSIGNED TO</FieldLabel>
                                        <Select
                                            style={{ width: "100%" }}
                                            showSearch
                                            optionFilterProp="children"
                                            placeholder="Select assignee"
                                            value={assigneeId}
                                            onChange={setAssigneeId}
                                        >
                                            {employees.map((e) => (
                                                <Option key={e.employee_id || e.id} value={e.employee_id || e.id}>
                                                    {e.employee_name || e.name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Col>
                                    <Col span={12}>
                                        <FieldLabel required>STATUS</FieldLabel>
                                        <Select style={{ width: "100%" }} value={statusId} onChange={setStatusId}>
                                            {statuses.map((s) => (
                                                <Option key={s.todo_status_id} value={s.todo_status_id}>
                                                    {s.todo_status_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Col>
                                </Row>

                                <div style={{ marginTop: 12 }}>
                                    <FieldLabel>SUBSCRIBERS (optional)</FieldLabel>
                                    <Select
                                        mode="multiple"
                                        style={{ width: "100%" }}
                                        showSearch
                                        optionFilterProp="children"
                                        placeholder="Anyone else who should be kept in the loop"
                                        value={subscriberIds}
                                        onChange={setSubscriberIds}
                                    >
                                        {employees
                                            .filter((e) => (e.employee_id || e.id) !== assigneeId)
                                            .map((e) => (
                                                <Option key={e.employee_id || e.id} value={e.employee_id || e.id}>
                                                    {e.employee_name || e.name}
                                                </Option>
                                            ))}
                                    </Select>
                                </div>

                                <div style={{ marginTop: 12 }}>
                                    <FieldLabel>TAGS</FieldLabel>
                                    <Select mode="tags" style={{ width: "100%" }} placeholder="Add tags" value={tags} onChange={setTags} tokenSeparators={[","]} />
                                </div>
                            </>
                        ),
                    },
                    {
                        key: "additional",
                        label: "Additional Details",
                        children: (
                            <>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <FieldLabel>TARGET DATE</FieldLabel>
                                        <DatePicker style={{ width: "100%" }} value={targetDate} onChange={setTargetDate} />
                                    </Col>
                                    <Col span={12}>
                                        <FieldLabel>PRIORITY</FieldLabel>
                                        <Select style={{ width: "100%" }} placeholder="Medium" value={priorityId} onChange={setPriorityId} allowClear>
                                            {priorities.map((p) => (
                                                <Option key={p.priority_id} value={p.priority_id}>
                                                    {p.priority_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Col>
                                </Row>
                                <Row gutter={12} style={{ marginTop: 12 }}>
                                    <Col span={12}>
                                        <FieldLabel>TEAM</FieldLabel>
                                        <Input disabled value={parentTeamName} />
                                    </Col>
                                    <Col span={12}>
                                        <FieldLabel>PRIVATE</FieldLabel>
                                        <Input disabled value={parent ? (parent.is_private ? "Private" : "Not private") : "Same as the todo"} />
                                    </Col>
                                </Row>
                            </>
                        ),
                    },
                ]}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <Button onClick={onCancel}>Cancel</Button>
                <SaveWithNotification
                    actionKey="TODO_CREATE"
                    onSave={saveTask}
                    onFinished={() => onSaved && onSaved(lastCreatedRef.current)}
                    saveLabel="Save"
                    notifyLabel="Save & Notify"
                    disabled={!canSave}
                />
            </div>
        </div>
    );
}