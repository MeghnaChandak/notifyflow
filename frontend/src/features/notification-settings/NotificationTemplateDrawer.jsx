import { Button, Checkbox, Divider, Drawer, Form, Input, message, Select, Space, Tag } from "antd";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import ConditionEditor from "./ConditionEditor";

const EMPTY_TEMPLATE = {
    action_id: undefined,
    template_name: "",
    subject: "",
    body: "",
    attachments: [],
    stop_on_match: false,
    is_fallback: false,
    exclude_actor: false,
    condition: [],
    recipients: [],
};

// Add / edit one template. "template" is null when adding a new one.
export default function NotificationTemplateDrawer({ open, onClose, onSaved, template, modules, groups, defaultActionId }) {
    const [form, setForm] = useState(EMPTY_TEMPLATE);
    const [saving, setSaving] = useState(false);
    const [employeeOptions, setEmployeeOptions] = useState([]);
    const bodyRef = useRef(null);

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    // Inserts text at the cursor instead of always at the end, and leaves the
    // cursor right after what was inserted so another click/keystroke continues
    // naturally. Falls back to appending if the textarea ref isn't ready yet.
    const insertIntoBody = (text) => {
        const textarea = bodyRef.current?.resizableTextArea?.textArea;
        if (!textarea) {
            setField("body", form.body + text);
            return;
        }

        const start = textarea.selectionStart ?? form.body.length;
        const end = textarea.selectionEnd ?? form.body.length;
        const newBody = form.body.slice(0, start) + text + form.body.slice(end);
        setField("body", newBody);

        const cursorPos = start + text.length;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(cursorPos, cursorPos);
        });
    };

    useEffect(() => {
        if (!open) return;

        if (template) {
            const recipients = template.recipients.map((entry) => ({ ...entry, condition: entry.condition || [] }));
            setForm({
                action_id: template.action_id,
                template_name: template.template_name,
                subject: template.subject,
                body: template.body,
                attachments: template.attachments || [],
                stop_on_match: template.stop_on_match === 1,
                is_fallback: template.is_fallback === 1,
                exclude_actor: template.exclude_actor === 1,
                condition: template.condition || [],
                recipients: recipients,
            });

            // A saved EMPLOYEE recipient might not be one of the first 100 alphabetical
            // matches, so look its name up directly rather than relying on the search.
            const savedEmployeeIds = recipients.filter((entry) => entry.type === "EMPLOYEE").map((entry) => entry.value);
            if (savedEmployeeIds.length > 0) loadEmployeesByIds(savedEmployeeIds);
        } else {
            setForm({ ...EMPTY_TEMPLATE, action_id: defaultActionId });
        }
        searchEmployees("");
    }, [open, template]);

    // The module of the chosen action decides which fields and roles can be picked
    const selectedModule = modules.find((module) => module.actions.some((action) => action.action_id === form.action_id));
    const fieldOptions = (selectedModule?.fields || []).map((field) => ({
        value: field.value,
        label: field.label,
        has_options: field.has_options,
    }));
    const moduleCode = selectedModule?.module_code;
    const roleOptions = (selectedModule?.roles || []).map((role) => ({ value: role.value, label: role.label }));
    const actionOptions = [];
    modules.forEach((module) => {
        module.actions.forEach((action) => {
            actionOptions.push({ value: action.action_id, label: `${module.module_name} - ${action.name}` });
        });
    });

    // Adds newly-fetched employees to the options list, keeping ones already shown
    // (by id) so a previously chosen employee never loses its name/email label.
    const mergeEmployeeOptions = (employees) => {
        const newOptions = employees.map((employee) => ({
            value: employee.employee_id,
            label: `${employee.employee_name} (${employee.email || "no email"})`,
        }));
        setEmployeeOptions((prev) => {
            const merged = [...newOptions];
            prev.forEach((option) => {
                if (!merged.some((item) => item.value === option.value)) merged.push(option);
            });
            return merged;
        });
    };

    const searchEmployees = (searchText) => {
        axios
            .get("/notification_settings/employees", { params: { search_text: searchText } })
            .then((res) => mergeEmployeeOptions(res.data.data))
            .catch((err) => err?.handleGlobally?.("Employees"));
    };

    const loadEmployeesByIds = (employeeIds) => {
        axios
            .get("/notification_settings/employees", { params: { employee_ids: employeeIds.join(",") } })
            .then((res) => mergeEmployeeOptions(res.data.data))
            .catch((err) => err?.handleGlobally?.("Employees"));
    };

    const changeRecipient = (index, changes) => {
        setField(
            "recipients",
            form.recipients.map((entry, i) => (i === index ? { ...entry, ...changes } : entry))
        );
    };

    const addRecipient = () => {
        setField("recipients", [...form.recipients, { send_as: "TO", type: "ROLE", value: undefined, condition: [] }]);
    };

    const removeRecipient = (index) => {
        setField(
            "recipients",
            form.recipients.filter((entry, i) => i !== index)
        );
    };

    const changeAttachment = (index, changes) => {
        setField(
            "attachments",
            form.attachments.map((entry, i) => (i === index ? { ...entry, ...changes } : entry))
        );
    };

    const addAttachment = () => {
        setField("attachments", [
            ...form.attachments,
            {
                type: "API",
                api_endpoint: "",
                tag: "",
                condition: [],
            },
        ]);
    };

    const removeAttachment = (index) => {
        setField(
            "attachments",
            form.attachments.filter((entry, i) => i !== index)
        );
    };

    const save = () => {
        if (!form.action_id || !form.template_name.trim() || !form.subject.trim() || !form.body.trim()) {
            message.error("Action, name, subject and body are required");
            return;
        }
        if (form.recipients.length === 0 || form.recipients.some((entry) => entry.value === undefined || entry.value === "")) {
            message.error("Add at least one recipient and pick a value for each");
            return;
        }

        // An empty condition list is saved as null, which means "always"
        const payload = {
            action_id: form.action_id,
            template_name: form.template_name,
            subject: form.subject,
            body: form.body,
            attachments: (form.attachments || []).map((entry) => ({
                type: entry.type,
                api_endpoint: entry.api_endpoint,
                tag: entry.tag || null,
                condition: entry.condition && entry.condition.length > 0 ? entry.condition : null,
            })),
            stop_on_match: form.stop_on_match ? 1 : 0,
            is_fallback: form.is_fallback ? 1 : 0,
            exclude_actor: form.exclude_actor ? 1 : 0,
            condition: form.condition.length > 0 ? form.condition : null,
            recipients: form.recipients.map((entry) => ({
                send_as: entry.send_as,
                type: entry.type,
                value: entry.value,
                condition: entry.condition.length > 0 ? entry.condition : null,
            })),
        };

        setSaving(true);
        const payloadWithTemplate = template ? { ...payload, template_id: template.template_id } : payload;
        const request = template
            ? axios.post("/notification_settings/modify_template", payloadWithTemplate)
            : axios.post("/notification_settings/add_template", payload);

        request
            .then(() => {
                message.success(template ? "Template updated" : "Template saved");
                onSaved();
            })
            .catch((err) => err?.handleGlobally?.(template ? "Update Template" : "Save Template"))
            .finally(() => setSaving(false));
    };

    return (
        <Drawer
            title={template ? "Edit Template" : "Add Template"}
            open={open}
            onClose={onClose}
            width={820}
            extra={
                <Space>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" loading={saving} onClick={save}>
                        Save
                    </Button>
                </Space>
            }
        >
            <Form layout="vertical">
                <Form.Item label="Action (which button / event sends this mail)" required>
                    <Select
                        options={actionOptions}
                        value={form.action_id}
                        onChange={(value) => setField("action_id", value)}
                    />
                </Form.Item>
                <Form.Item label="Template name" required>
                    <Input value={form.template_name} onChange={(e) => setField("template_name", e.target.value)} />
                </Form.Item>
                <Form.Item label="Subject" required>
                    <Input value={form.subject} onChange={(e) => setField("subject", e.target.value)} />
                </Form.Item>
                <Form.Item label="Body" required>
                    <Input.TextArea ref={bodyRef} rows={6} value={form.body} onChange={(e) => setField("body", e.target.value)} />
                    <div style={{ marginTop: 6 }}>
                        Click to add to the body:{" "}
                        {fieldOptions.map((field) => (
                            <Tag
                                key={field.value}
                                style={{ cursor: "pointer", marginBottom: 4 }}
                                onClick={() => insertIntoBody(`{{${field.value}}}`)}
                            >
                                {field.label}
                            </Tag>
                        ))}
                    </div>
                </Form.Item>

                <Divider orientation="left">Attachments</Divider>
                {(form.attachments || []).map((entry, index) => (
                    <div key={index} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <Space align="start" wrap>
                            <Select
                                style={{ width: 120 }}
                                value={entry.type}
                                options={[
                                    { value: "API", label: "API" },
                                    { value: "URL", label: "URL" },
                                    { value: "STATIC", label: "Static" },
                                ]}
                                onChange={(value) => changeAttachment(index, { type: value })}
                            />
                            {(entry.type === "API" || entry.type === "URL") && (
                                <Input
                                    style={{ width: 280 }}
                                    placeholder={entry.type === "API" ? "API endpoint with {{todo_id}} placeholders" : "URL to fetch the file"}
                                    value={entry.api_endpoint || ""}
                                    onChange={(e) => changeAttachment(index, { api_endpoint: e.target.value })}
                                />
                            )}
                            {/* filename and content_type removed — module-level tag lookup provides these */}
                            <Input
                                style={{ width: 180 }}
                                placeholder="Tag (e.g. service_report)"
                                value={entry.tag || ""}
                                onChange={(e) => changeAttachment(index, { tag: e.target.value })}
                            />
                            <Button danger onClick={() => removeAttachment(index)}>
                                Remove
                            </Button>
                        </Space>
                        <div style={{ marginTop: 8 }}>
                            <div style={{ color: "#888", marginBottom: 4 }}>Only attach this file when:</div>
                            <ConditionEditor
                                value={entry.condition || []}
                                onChange={(value) => changeAttachment(index, { condition: value })}
                                fields={fieldOptions}
                                moduleCode={moduleCode}
                            />
                        </div>
                    </div>
                ))}
                <Button onClick={addAttachment}>+ Add attachment</Button>

                <Divider orientation="left">Only send when (empty = always)</Divider>
                <ConditionEditor
                    value={form.condition}
                    onChange={(value) => setField("condition", value)}
                    fields={fieldOptions}
                    moduleCode={moduleCode}
                />

                <Divider orientation="left">Who receives it</Divider>
                {form.recipients.map((entry, index) => (
                    <div key={index} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <Space align="start" wrap>
                            <Select
                                style={{ width: 80 }}
                                value={entry.send_as}
                                options={["TO", "CC", "BCC"].map((item) => ({ value: item, label: item }))}
                                onChange={(value) => changeRecipient(index, { send_as: value })}
                            />
                            <Select
                                style={{ width: 130 }}
                                value={entry.type}
                                options={[
                                    { value: "ROLE", label: "Role" },
                                    { value: "GROUP", label: "Group" },
                                    { value: "EMPLOYEE", label: "Employee" },
                                ]}
                                onChange={(value) => changeRecipient(index, { type: value, value: undefined })}
                            />
                            {entry.type === "ROLE" && (
                                <Select
                                    style={{ width: 300 }}
                                    placeholder="Pick a role of this record"
                                    options={roleOptions}
                                    value={entry.value}
                                    onChange={(value) => changeRecipient(index, { value })}
                                />
                            )}
                            {entry.type === "GROUP" && (
                                <Select
                                    style={{ width: 300 }}
                                    placeholder="Pick a group"
                                    options={groups.map((group) => ({ value: group.group_code, label: group.group_name }))}
                                    value={entry.value}
                                    onChange={(value) => changeRecipient(index, { value })}
                                />
                            )}
                            {entry.type === "EMPLOYEE" && (
                                <Select
                                    showSearch
                                    filterOption={false}
                                    style={{ width: 300 }}
                                    placeholder="Search an employee"
                                    options={employeeOptions}
                                    value={entry.value}
                                    onSearch={searchEmployees}
                                    onChange={(value) => changeRecipient(index, { value })}
                                />
                            )}
                            <Button danger onClick={() => removeRecipient(index)}>
                                Remove
                            </Button>
                        </Space>
                        <div style={{ marginTop: 8 }}>
                            <div style={{ color: "#888", marginBottom: 4 }}>Only add this recipient when:</div>
                            <ConditionEditor
                                value={entry.condition}
                                onChange={(value) => changeRecipient(index, { condition: value })}
                                fields={fieldOptions}
                                moduleCode={moduleCode}
                            />
                            {entry.condition.length === 0 && entry.type === "GROUP" && (
                                <div style={{ color: "#d46b08", marginTop: 4 }}>
                                    This group will receive mail for ALL records.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <Button onClick={addRecipient}>+ Add recipient</Button>

                <Divider orientation="left">Options</Divider>
                <Space wrap size="large">
                    <Checkbox checked={form.stop_on_match} onChange={(e) => setField("stop_on_match", e.target.checked)}>
                        Stop: do not run later templates if this one sends
                    </Checkbox>
                    <Checkbox checked={form.is_fallback} onChange={(e) => setField("is_fallback", e.target.checked)}>
                        Default rule: only if no other template sends
                    </Checkbox>
                    <Checkbox checked={form.exclude_actor} onChange={(e) => setField("exclude_actor", e.target.checked)}>
                        Do not mail the person who did the action
                    </Checkbox>
                </Space>
            </Form>
        </Drawer>
    );
}
