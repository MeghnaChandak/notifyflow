import { Button, Form, Input, message, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import axios from "axios";
import { useEffect, useState } from "react";

const EMPTY_GROUP = { group_id: 0, group_code: "", group_name: "", employee_ids: [] };

export default function NotificationGroups({ permissions }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState({ open: false, group: EMPTY_GROUP });
    const [employeeOptions, setEmployeeOptions] = useState([]);
    const [saving, setSaving] = useState(false);

    const loadGroups = () => {
        setLoading(true);
        axios
            .get("/notification_settings/groups")
            .then((res) => setGroups(res.data.data))
            .catch((err) => err?.handleGlobally?.("Notification Groups"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadGroups();
    }, []);

    const searchEmployees = (searchText) => {
        axios
            .get("/notification_settings/employees", { params: { search_text: searchText } })
            .then((res) => {
                const newOptions = res.data.data.map((employee) => ({
                    value: employee.employee_id,
                    label: `${employee.employee_name} (${employee.email || "no email"})`,
                }));
                // keep options already shown, so chosen employees keep their labels
                setEmployeeOptions((prev) => {
                    const merged = [...newOptions];
                    prev.forEach((option) => {
                        if (!merged.some((item) => item.value === option.value)) merged.push(option);
                    });
                    return merged;
                });
            })
            .catch((err) => err?.handleGlobally?.("Employees"));
    };

    const openModal = (group) => {
        // the group's current members are added as options so their names show
        const memberOptions = (group.members || []).map((member) => ({
            value: member.employee_id,
            label: `${member.employee_name} (${member.email || "no email"})`,
        }));
        setEmployeeOptions(memberOptions);
        searchEmployees("");
        setModal({ open: true, group: group });
    };

    const save = () => {
        const group = modal.group;
        if (!group.group_code.trim() || !group.group_name.trim()) {
            message.error("Group code and name are required");
            return;
        }

        setSaving(true);
        const payload = { group_code: group.group_code, group_name: group.group_name, employee_ids: group.employee_ids };
        let request = axios.post("/notification_settings/add_group", payload);
        if (group.group_id !== 0) {
            request = axios.post("/notification_settings/modify_group", { ...payload, group_id: group.group_id });
        }
        request
            .then(() => {
                message.success("Group saved");
                setModal({ open: false, group: EMPTY_GROUP });
                loadGroups();
            })
            .catch((err) => err?.handleGlobally?.("Save Group"))
            .finally(() => setSaving(false));
    };

    const deleteGroup = (groupId) => {
        axios
            .delete("/notification_settings/delete_group", { params: { group_id: groupId } })
            .then(() => {
                message.success("Group deleted");
                loadGroups();
            })
            .catch((err) => err?.handleGlobally?.("Delete Group"));
    };

    const columns = [
        { title: "Code", dataIndex: "group_code" },
        { title: "Name", dataIndex: "group_name" },
        {
            title: "Members",
            render: (row) =>
                row.members.map((member) => (
                    <Tag key={member.employee_id} color={member.email ? "default" : "red"}>
                        {member.employee_name} {member.email ? "" : "(no email, will be skipped)"}
                    </Tag>
                )),
        },
        {
            title: "Actions",
            render: (row) => (
                <Space>
                    <Button size="small" disabled={!permissions?.edit} onClick={() => openModal(row)}>
                        Edit
                    </Button>
                    <Popconfirm title="Delete this group?" disabled={!permissions?.delete} onConfirm={() => deleteGroup(row.group_id)}>
                        <Button size="small" danger disabled={!permissions?.delete}>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const isNew = modal.group.group_id === 0;

    return (
        <div>
            <Button type="primary" style={{ marginBottom: 12 }} disabled={!permissions?.add} onClick={() => openModal(EMPTY_GROUP)}>
                + New Group
            </Button>
            <Table rowKey="group_id" size="small" loading={loading} columns={columns} dataSource={groups} pagination={{ pageSize: 20 }} />

            <Modal
                title={isNew ? "New Group" : "Edit Group"}
                open={modal.open}
                onCancel={() => setModal({ open: false, group: EMPTY_GROUP })}
                onOk={save}
                confirmLoading={saving}
                okText="Save"
                width={640}
            >
                <Form layout="vertical">
                    <Form.Item label="Code (cannot be changed later)" required>
                        <Input
                            disabled={!isNew}
                            value={modal.group.group_code}
                            onChange={(e) => setModal({ ...modal, group: { ...modal.group, group_code: e.target.value.toUpperCase() } })}
                        />
                    </Form.Item>
                    <Form.Item label="Name" required>
                        <Input
                            value={modal.group.group_name}
                            onChange={(e) => setModal({ ...modal, group: { ...modal.group, group_name: e.target.value } })}
                        />
                    </Form.Item>
                    <Form.Item label="Employees (only employees can receive notifications)">
                        <Select
                            mode="multiple"
                            showSearch
                            filterOption={false}
                            placeholder="Search employees"
                            options={employeeOptions}
                            value={modal.group.employee_ids}
                            onSearch={searchEmployees}
                            onChange={(value) => setModal({ ...modal, group: { ...modal.group, employee_ids: value } })}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
