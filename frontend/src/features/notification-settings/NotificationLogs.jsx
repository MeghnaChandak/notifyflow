import { Button, Input, Modal, Select, Space, Table, Tag } from "antd";
import axios from "axios";
import moment from "moment";
import { useEffect, useState } from "react";

const STATUS_COLORS = { SENT: "green", FAILED: "red", SKIPPED: "default" };

// Record shown as module code plus id, e.g. "TODO204"
function recordLabel(row) {
    return `${row.module_code}${row.module_key}`;
}

export default function NotificationLogs() {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [modules, setModules] = useState([]);
    const [filters, setFilters] = useState({ module_code: "", module_key: "", status: "" });
    const [viewing, setViewing] = useState(null);

    // pass the page explicitly so "Search" can jump back to page 1
    const loadLogs = (pageToLoad, sizeToLoad) => {
        setLoading(true);
        axios
            .get("/notification_settings/logs", { params: { ...filters, page: pageToLoad, page_size: sizeToLoad } })
            .then((res) => {
                setRows(res.data.data.rows);
                setTotal(res.data.data.total);
            })
            .catch((err) => err?.handleGlobally?.("Notification Log"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadLogs(1, pageSize);
        axios
            .get("/notification_settings/modules")
            .then((res) => setModules(res.data.data))
            .catch((err) => err?.handleGlobally?.("Notification Modules"));
    }, []);

    const moduleOptions = [{ value: "", label: "All modules" }];
    modules.forEach((module) => {
        moduleOptions.push({ value: module.module_code, label: module.module_name });
    });

    const columns = [
        { title: "Time", render: (row) => moment(row.created_time).format("DD MMM YYYY HH:mm") },
        { title: "Module / Action", render: (row) => `${row.module_code} / ${row.action_key}` },
        { title: "Record", render: (row) => recordLabel(row) },
        { title: "Template", dataIndex: "template_name" },
        { title: "To", dataIndex: "to_list", ellipsis: true },
        { title: "Status", render: (row) => <Tag color={STATUS_COLORS[row.status]}>{row.status}</Tag> },
        { title: "Detail", dataIndex: "error" },
        {
            title: "",
            render: (row) => (
                <Button size="small" onClick={() => setViewing(row)}>
                    View
                </Button>
            ),
        },
    ];

    return (
        <div>
            <Space wrap style={{ marginBottom: 12 }}>
                <Select
                    style={{ width: 180 }}
                    value={filters.module_code}
                    onChange={(value) => setFilters({ ...filters, module_code: value })}
                    options={moduleOptions}
                />
                <Input
                    style={{ width: 150 }}
                    placeholder="Record id"
                    value={filters.module_key}
                    onChange={(e) => setFilters({ ...filters, module_key: e.target.value })}
                />
                <Select
                    style={{ width: 160 }}
                    value={filters.status}
                    onChange={(value) => setFilters({ ...filters, status: value })}
                    options={[
                        { value: "", label: "All statuses" },
                        { value: "SENT", label: "Sent" },
                        { value: "FAILED", label: "Failed" },
                        { value: "SKIPPED", label: "Skipped" },
                    ]}
                />
                <Button
                    type="primary"
                    onClick={() => {
                        setPage(1);
                        loadLogs(1, pageSize);
                    }}
                >
                    Search
                </Button>
            </Space>
            <Table
                rowKey="log_id"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={rows}
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: total,
                    showSizeChanger: true,
                    pageSizeOptions: [20, 50, 100, 200],
                    showTotal: (count) => `${count} messages`,
                    onChange: (newPage, newSize) => {
                        setPage(newPage);
                        setPageSize(newSize);
                        loadLogs(newPage, newSize);
                    },
                }}
            />

            <Modal
                title={viewing ? `Notification detail — ${recordLabel(viewing)}` : "Notification detail"}
                open={!!viewing}
                onCancel={() => setViewing(null)}
                footer={null}
                width={700}
            >
                {viewing && (
                    <div>
                        <Tag color={STATUS_COLORS[viewing.status]}>{viewing.status}</Tag>
                        {viewing.error && <div style={{ color: "#888", marginTop: 6 }}>{viewing.error}</div>}
                        <div style={{ marginTop: 12 }}>To: {viewing.to_list || "-"}</div>
                        <div>Cc: {viewing.cc_list || "-"}</div>
                        <div>Bcc: {viewing.bcc_list || "-"}</div>
                        {viewing.attachments_list && <div>Attachments: {viewing.attachments_list}</div>}
                        <div style={{ marginTop: 12 }}>
                            <b>{viewing.subject}</b>
                        </div>
                        <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{viewing.body}</pre>
                    </div>
                )}
            </Modal>
        </div>
    );
}
