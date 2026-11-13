import { Alert, Button, Card, InputNumber, message, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import axios from "axios";
import { useEffect, useState } from "react";
import NotificationTemplateDrawer from "./NotificationTemplateDrawer";

function describeRecipients(recipients, roles) {
    return recipients.map((entry, index) => {
        let name = entry.value;
        if (entry.type === "ROLE") {
            name = roles.find((role) => role.value === entry.value)?.label || entry.value;
        }
        if (entry.type === "GROUP") name = `Group ${entry.value}`;
        if (entry.type === "EMPLOYEE") name = entry.value_label || `Employee #${entry.value}`;
        const suffix = entry.condition && entry.condition.length > 0 ? " *" : "";
        return (
            <Tag key={index}>
                {entry.send_as}: {name}
                {suffix}
            </Tag>
        );
    });
}

function describeCondition(condition) {
    if (!condition || condition.length === 0) return "ALL";
    return condition.map((check) => `${check.field} ${check.op} ${Array.isArray(check.value) ? check.value.join(", ") : check.value ?? ""}`).join(" and ");
}

export default function NotificationRules({ permissions }) {
    const [modules, setModules] = useState([]);
    const [groups, setGroups] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionFilter, setActionFilter] = useState(0);
    const [drawer, setDrawer] = useState({ open: false, template: null });
    const [preview, setPreview] = useState({ open: false, actionKey: undefined, moduleKey: null, results: null, loading: false });

    const loadTemplates = () => {
        setLoading(true);
        axios
            .get("/notification_settings/templates", { params: { action_id: actionFilter } })
            .then((res) => setTemplates(res.data.data))
            .catch((err) => err?.handleGlobally?.("Notification Templates"))
            .finally(() => setLoading(false));
    };

    const loadGroups = () => {
        axios
            .get("/notification_settings/groups")
            .then((res) => {
                setGroups(res.data.data || []);
            })
            .catch((err) => {
                err?.handleGlobally?.("Notification Groups");
            });
    };

    useEffect(() => {
        axios
            .get("/notification_settings/modules")
            .then((res) => {
                setModules(res.data.data);
            })
            .catch((err) => err?.handleGlobally?.("Notification Modules"));

        loadGroups();
    }, []);

    useEffect(() => {
        loadTemplates();
    }, [actionFilter]);

    const actionOptions = [{ value: 0, label: "All actions" }];
    modules.forEach((module) => {
        module.actions.forEach((action) => {
            actionOptions.push({ value: action.action_id, label: `${module.module_name} - ${action.name}` });
        });
    });

    const deleteTemplate = (templateId) => {
        axios
            .delete("/notification_settings/delete_template", { params: { template_id: templateId } })
            .then(() => {
                message.success("Template deleted");
                loadTemplates();
            })
            .catch((err) => err?.handleGlobally?.("Delete Template"));
    };

    const runPreview = (sendTest) => {
        if (!preview.moduleKey) {
            message.error("Enter a record id (for example a to-do id)");
            return;
        }
        setPreview((prev) => ({ ...prev, loading: true }));
        const url = sendTest ? "/notification_settings/test_send" : "/notification_settings/preview";
        axios
            .post(url, { action_key: preview.actionKey, module_key: preview.moduleKey })
            .then((res) => {
                if (sendTest) {
                    message.success(`Test sent to ${res.data.data.sent_to} (${res.data.data.mails_sent} mail)`);
                    setPreview((prev) => ({ ...prev, loading: false }));
                } else {
                    setPreview((prev) => ({ ...prev, results: res.data.data, loading: false }));
                }
            })
            .catch((err) => {
                err?.handleGlobally?.("Preview");
                setPreview((prev) => ({ ...prev, loading: false }));
            });
    };

    const columns = [
        { title: "Module", dataIndex: "module_name" },
        { title: "Action", dataIndex: "action_name" },
        { title: "Template", dataIndex: "template_name" },
        {
            title: "Who",
            render: (row) => {
                const module = modules.find((item) => item.module_code === row.module_code);
                return describeRecipients(row.recipients, module?.roles || []);
            },
        },
        { title: "Only when", render: (row) => describeCondition(row.condition) },
        {
            title: "Options",
            render: (row) => (
                <Space wrap size={4}>
                    {row.stop_on_match === 1 && <Tag color="orange">stop</Tag>}
                    {row.is_fallback === 1 && <Tag color="blue">default</Tag>}
                </Space>
            ),
        },
        {
            title: "Actions",
            render: (row) => (
                <Space>
                    <Button
                        size="small"
                        onClick={() => setPreview({ open: true, actionKey: row.action_key, moduleKey: null, results: null, loading: false })}
                    >
                        Preview
                    </Button>
                    <Button
                        size="small"
                        disabled={!permissions?.edit}
                        onClick={() => {
                            loadGroups();
                            setDrawer({ open: true, template: row });
                        }}
                    >
                        Edit
                    </Button>
                    <Popconfirm title="Delete this template?" disabled={!permissions?.delete} onConfirm={() => deleteTemplate(row.template_id)}>
                        <Button size="small" danger disabled={!permissions?.delete}>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Space style={{ marginBottom: 12 }}>
                <Select style={{ width: 340 }} options={actionOptions} value={actionFilter} onChange={setActionFilter} />
                <Button type="primary" disabled={!permissions?.add} onClick={() => setDrawer({ open: true, template: null })}>
                    + Add Template
                </Button>
            </Space>
            <Table rowKey="template_id" size="small" loading={loading} columns={columns} dataSource={templates} pagination={{ pageSize: 20 }} />

            <NotificationTemplateDrawer
                open={drawer.open}
                template={drawer.template}
                modules={modules}
                groups={groups}
                defaultActionId={actionFilter === 0 ? undefined : actionFilter}
                onClose={() => setDrawer({ open: false, template: null })}
                onSaved={() => {
                    setDrawer({ open: false, template: null });
                    loadTemplates();
                }}
            />

            <Modal
                title="Preview: who would get what"
                open={preview.open}
                onCancel={() => setPreview({ ...preview, open: false, results: null })}
                footer={null}
                width={760}
            >
                <Space style={{ marginBottom: 12 }}>
                    <span>Record id:</span>
                    <InputNumber
                        placeholder="e.g. to-do id"
                        value={preview.moduleKey}
                        onChange={(value) => setPreview({ ...preview, moduleKey: value })}
                    />
                    <Button type="primary" loading={preview.loading} onClick={() => runPreview(false)}>
                        Preview
                    </Button>
                    <Button loading={preview.loading} onClick={() => runPreview(true)}>
                        Send test to me
                    </Button>
                </Space>
                {preview.results && preview.results.length === 0 && <Alert type="info" message="This action has no templates" />}
                {preview.results &&
                    preview.results.map((result) => (
                        <Card
                            key={result.template_id}
                            size="small"
                            style={{ marginBottom: 8 }}
                            title={result.template_name}
                            extra={<Tag color={result.status === "READY" ? "green" : "default"}>{result.status}</Tag>}
                        >
                            {result.status === "SKIPPED" && <div>Not sent: {result.error}</div>}
                            {result.status === "READY" && (
                                <div>
                                    <div>To: {result.to_emails.join(", ") || "-"}</div>
                                    <div>Cc: {result.cc_emails.join(", ") || "-"}</div>
                                    <div>Bcc: {result.bcc_emails.join(", ") || "-"}</div>
                                    <div style={{ marginTop: 6 }}>
                                        <b>{result.subject}</b>
                                    </div>
                                    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result.body}</pre>
                                </div>
                            )}
                        </Card>
                    ))}
            </Modal>
        </div>
    );
}
