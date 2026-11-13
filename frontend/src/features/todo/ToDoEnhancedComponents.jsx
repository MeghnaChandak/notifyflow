import React, { useState, useEffect, useCallback } from "react";
import {
    Button,
    Card,
    Input,
    Modal,
    Form,
    Upload,
    message,
    Space,
    Typography,
    List,
    Tag,
    Popconfirm,
    Select,
    Row,
    Col,
    Divider,
    Tooltip,
    Empty,
    Table,
} from "antd";
import {
    PlusOutlined,
    DeleteOutlined,
    EditOutlined,
    LinkOutlined,
    PaperClipOutlined,
    KeyOutlined,
    HistoryOutlined,
    UserOutlined,
    CommentOutlined,
    CheckCircleOutlined,
} from "@ant-design/icons";
import moment from "moment";
import axios from "axios";
import { openExternalLink, safeExternalUrl } from "./moduleRoutes";

const { Text, Title } = Typography;
const { Option } = Select;

// Only http(s) addresses are ever opened from a link
// Transform backend todo to frontend format (reused from ToDoModule)
const transformTodoFromBackend = (backendTodo) => {
    if (!backendTodo) return null;
    
    return {
        id: backendTodo.todo_id,
        todo_id: backendTodo.todo_id,
        ref_no: backendTodo.ref_no || `TD-${backendTodo.todo_id}`,
        title: backendTodo.title,
        description: backendTodo.description || "",
        status: backendTodo.todo_status_id || null,
        todo_status_id: backendTodo.todo_status_id || null,
        priority: backendTodo.todo_priority_id ?? 3,
        todo_priority_id: backendTodo.todo_priority_id ?? 3,
        term_type: backendTodo.term_type || "",
        target_date: backendTodo.target_date || null,
        expected_duration_days: backendTodo.expected_duration_days || 0,
        owner_id: backendTodo.owner_id || null,
        owner_name: backendTodo.owner_name || "",
        team_id: backendTodo.department_id || null,
        department_id: backendTodo.department_id || null,
        team_name: backendTodo.department_name || "",
        created_by: backendTodo.created_by || null,
        created_by_name: backendTodo.created_by_name || "",
        created_at: backendTodo.created_at || new Date().toISOString(),
        assigned_date: backendTodo.assigned_date || null,
        updated_at: backendTodo.updated_at || new Date().toISOString(),
        is_private: backendTodo.is_private || 0,
        visibility_scope: backendTodo.visibility_scope || "Organization",
        attachments: backendTodo.attachments || [],
        comments: (backendTodo.comments || []).map(comment => ({
            id: comment.comment_id || comment.temp_id || comment.id,
            comment_id: comment.comment_id || comment.temp_id || comment.id,
            text: comment.comment || comment.text || '',
            user: comment.created_by_name || comment.user_name || comment.user || `User ${comment.created_by || 'Unknown'}`,
            created_by: comment.created_by || null,
            created_at: comment.created_time || comment.created_at || new Date().toISOString(),
            ...comment
        })),
        subscribers: backendTodo.subscribers || [],
        links: (backendTodo.links || []).map(link => ({
            id: link.link_id || link.id,
            link_id: link.link_id || link.id,
            module_name: link.module_name,
            module_ref: link.module_ref || null,
            title: link.title || link.module_ref || null,
            url: safeExternalUrl(link.url),
            created_at: link.created_at || new Date().toISOString(),
            ...link
        })),
        key_value_pairs: backendTodo.key_value_pairs || [],
        transactions: backendTodo.transactions || [],
        metadata: backendTodo.metadata || {}
    };
};

// Transform frontend todo to backend format
const transformTodoToBackend = (frontendTodo) => {
    return {
        todo_id: frontendTodo.todo_id || frontendTodo.id || null,
        title: frontendTodo.title,
        description: frontendTodo.description || null,
        todo_status_id: frontendTodo.todo_status_id || frontendTodo.status || null,
        todo_priority_id: frontendTodo.todo_priority_id ?? frontendTodo.priority ?? 3,
        term_type: frontendTodo.term_type || null,
        target_date: frontendTodo.target_date || null,
        owner_id: frontendTodo.owner_id || null,
        department_id: frontendTodo.department_id || frontendTodo.team_id || null,
        assigned_date: frontendTodo.assigned_date || null,
        is_private: frontendTodo.is_private || 0,
        attachments: frontendTodo.attachments || [],
        subscribers: frontendTodo.subscribers || [],
        comments: frontendTodo.comments || [],
        links: frontendTodo.links || []
    };
};

// Module Links Component
export const ModuleLinksSection = ({ todo, onUpdate }) => {
    const [links, setLinks] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (todo) {
            setLinks(todo.links || []);
        }
    }, [todo]);

    const handleAddLink = async (values) => {
        try {
            setLoading(true);
            
            // Prepare link data
            const newLink = {
                todo_id: parseInt(todo.id),
                module_name: values.module_name,
                module_ref: values.module_ref || null,
                title: values.title || null,
                url: safeExternalUrl(values.url)
            };
            
            // Call dedicated API to add link
            const response = await axios.post("/add_todo_link", newLink);
            
            // Update local state with the new link
            // The backend returns only link_id and action, so build the row from what was sent
            setLinks([...links, { ...newLink, link_id: response.data?.data?.link_id, created_at: new Date().toISOString() }]);
            
            onUpdate?.();
            message.success("Reference added successfully");
            setModalVisible(false);
            form.resetFields();
        } catch (error) {
            console.error("Failed to add reference:", error);
            message.error(error.response?.data?.detail || error.response?.data?.message || "Failed to add reference");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveLink = async (linkIndex) => {
        try {
            setLoading(true);
            
            const linkToRemove = links[linkIndex];
            
            // Prepare delete payload
            const deletePayload = {
                todo_id: parseInt(todo.id),
                link_id: linkToRemove.link_id || linkToRemove.id || null,
                module_name: linkToRemove.module_name,
                module_ref: linkToRemove.module_ref || null
            };
            
            // Call dedicated API to remove link
            await axios.post("/remove_todo_link", deletePayload);
            
            // Update local state by removing the link at the index
            const updatedLinks = links.filter((_, index) => index !== linkIndex);
            setLinks(updatedLinks);
            
            onUpdate?.();
            message.success("Reference removed successfully");
        } catch (error) {
            console.error("Failed to remove reference:", error);
            message.error(error.response?.data?.detail || error.response?.data?.message || "Failed to remove reference");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenLink = (link) => {
        if (!openExternalLink(link.url)) {
            message.warning("This reference has no web address");
        }
    };

    return (
        <Card size="small" title="References">
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">
                        Reference related records in other systems (label, reference text and an optional web address)
                    </span>
                    <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => setModalVisible(true)}
                        loading={loading}
                    >
                        Add Link
                    </Button>
                </div>

                {links.length === 0 ? (
                    <Empty description="No module links" size="small" />
                ) : (
                    <List
                        size="small"
                        dataSource={links}
                        renderItem={(link, index) => (
                            <List.Item
                                actions={[
                                    <Tooltip title="Remove Link">
                                        <Popconfirm
                                            title="Remove this link?"
                                            onConfirm={() => handleRemoveLink(index)}
                                        >
                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} loading={loading} />
                                        </Popconfirm>
                                    </Tooltip>
                                ]}
                            >
                                <div className="flex items-center space-x-2 w-full">
                                    <span className="text-lg">🔗</span>
                                    <div className="flex-1">
                                        <div className="font-medium">{link.module_name}</div>
                                        <div className="text-sm text-gray-500">
                                            {link.module_ref ? `${link.module_ref}${link.title ? ` - ${link.title}` : ''}` : (link.title || 'No reference')}
                                        </div>
                                    </div>
                                    {link.url && (
                                        <Button 
                                            type="link" 
                                            size="small" 
                                            icon={<LinkOutlined />}
                                            onClick={() => handleOpenLink(link)}
                                        >
                                            Open
                                        </Button>
                                    )}
                                </div>
                            </List.Item>
                        )}
                    />
                )}
            </div>

            <Modal
                title="Add Reference"
                visible={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={500}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAddLink}
                >
                    <Form.Item
                        name="module_name"
                        label="Label"
                        rules={[{ required: true, message: "Please enter a label" }, { max: 20, message: "At most 20 characters" }]}
                    >
                        <Input placeholder="e.g., JIRA, INVOICE, CRM" />
                    </Form.Item>

                    <Form.Item
                        name="module_ref"
                        label="Reference (Optional)"
                    >
                        <Input placeholder="e.g., ABC-123" />
                    </Form.Item>

                    <Form.Item
                        name="url"
                        label="Web address (Optional)"
                        rules={[
                            {
                                validator: (rule, value) => {
                                    if (!value || safeExternalUrl(value)) return Promise.resolve();
                                    return Promise.reject(new Error("Must start with http:// or https://"));
                                },
                            },
                        ]}
                    >
                        <Input placeholder="https://..." />
                    </Form.Item>

                    <Form.Item
                        name="title"
                        label="Description (Optional)"
                    >
                        <Input placeholder="Brief description of the link" />
                    </Form.Item>

                    <div className="flex justify-end space-x-2">
                        <Button onClick={() => {
                            setModalVisible(false);
                            form.resetFields();
                        }}>
                            Cancel
                        </Button>
                        <Button type="primary" htmlType="submit" loading={loading}>
                            Add Link
                        </Button>
                    </div>
                </Form>
            </Modal>
        </Card>
    );
};

// Key-Value Pairs Component
// export const KeyValuePairsSection = ({ todo, onUpdate }) => {
//     const [kvPairs, setKvPairs] = useState([]);
//     const [modalVisible, setModalVisible] = useState(false);
//     const [editingKV, setEditingKV] = useState(null);
//     const [form] = Form.useForm();

//     useEffect(() => {
//         if (todo) {
//             setKvPairs(todo.key_value_pairs || []);
//         }
//     }, [todo]);

//     const handleAddKV = async (values) => {
//         try {
//             const response = await mockTodoApi.addKeyValuePair(todo.id, values.key, values.value);
//             if (response.success) {
//                 setKvPairs([...kvPairs, response.data]);
//                 onUpdate?.();
//                 message.success("Key-value pair added successfully");
//                 setModalVisible(false);
//                 form.resetFields();
//             }
//         } catch (error) {
//             message.error("Failed to add key-value pair");
//         }
//     };

//     const handleUpdateKV = async (values) => {
//         try {
//             const response = await mockTodoApi.updateKeyValuePair(todo.id, editingKV.id, values.key, values.value);
//             if (response.success) {
//                 setKvPairs(kvPairs.map(kv => kv.id === editingKV.id ? response.data : kv));
//                 onUpdate?.();
//                 message.success("Key-value pair updated successfully");
//                 setModalVisible(false);
//                 setEditingKV(null);
//                 form.resetFields();
//             }
//         } catch (error) {
//             message.error("Failed to update key-value pair");
//         }
//     };

//     const handleDeleteKV = async (kvId) => {
//         try {
//             const response = await mockTodoApi.deleteKeyValuePair(todo.id, kvId);
//             if (response.success) {
//                 setKvPairs(kvPairs.filter(kv => kv.id !== kvId));
//                 onUpdate?.();
//                 message.success("Key-value pair deleted successfully");
//             }
//         } catch (error) {
//             message.error("Failed to delete key-value pair");
//         }
//     };

//     const handleEdit = (kv) => {
//         setEditingKV(kv);
//         form.setFieldsValue({
//             key: kv.key,
//             value: kv.value
//         });
//         setModalVisible(true);
//     };

//     const handleModalClose = () => {
//         setModalVisible(false);
//         setEditingKV(null);
//         form.resetFields();
//     };

//     return (
//         <Card size="small" title="Key-Value Pairs">
//             <div className="space-y-3">
//                 <div className="flex justify-between items-center">
//                     <span className="text-sm text-gray-500">
//                         Add structured data with custom key-value pairs
//                     </span>
//                     <Button
//                         type="primary"
//                         size="small"
//                         icon={<PlusOutlined />}
//                         onClick={() => setModalVisible(true)}
//                     >
//                         Add Pair
//                     </Button>
//                 </div>

//                 {kvPairs.length === 0 ? (
//                     <Empty description="No key-value pairs" size="small" />
//                 ) : (
//                     <div className="space-y-2">
//                         {kvPairs.map(kv => (
//                             <div key={kv.id} className="flex items-center justify-between p-2 border rounded">
//                                 <div className="flex-1">
//                                     <div className="font-medium text-sm">{kv.key}</div>
//                                     <div className="text-sm text-gray-600">{kv.value}</div>
//                                 </div>
//                                 <Space>
//                                     <Tooltip title="Edit">
//                                         <Button
//                                             type="text"
//                                             size="small"
//                                             icon={<EditOutlined />}
//                                             onClick={() => handleEdit(kv)}
//                                         />
//                                     </Tooltip>
//                                     <Tooltip title="Delete">
//                                         <Popconfirm
//                                             title="Delete this key-value pair?"
//                                             onConfirm={() => handleDeleteKV(kv.id)}
//                                         >
//                                             <Button
//                                                 type="text"
//                                                 danger
//                                                 size="small"
//                                                 icon={<DeleteOutlined />}
//                                             />
//                                         </Popconfirm>
//                                     </Tooltip>
//                                 </Space>
//                             </div>
//                         ))}
//                     </div>
//                 )}
//             </div>

//             <Modal
//                 title={editingKV ? "Edit Key-Value Pair" : "Add Key-Value Pair"}
//                 visible={modalVisible}
//                 onCancel={handleModalClose}
//                 footer={null}
//                 width={500}
//             >
//                 <Form
//                     form={form}
//                     layout="vertical"
//                     onFinish={editingKV ? handleUpdateKV : handleAddKV}
//                 >
//                     <Form.Item
//                         name="key"
//                         label="Key"
//                         rules={[{ required: true, message: "Please enter key" }]}
//                     >
//                         <Input placeholder="e.g., Technology Stack" />
//                     </Form.Item>

//                     <Form.Item
//                         name="value"
//                         label="Value"
//                         rules={[{ required: true, message: "Please enter value" }]}
//                     >
//                         <Input placeholder="e.g., React, Node.js" />
//                     </Form.Item>

//                     <div className="flex justify-end space-x-2">
//                         <Button onClick={handleModalClose}>Cancel</Button>
//                         <Button type="primary" htmlType="submit">
//                             {editingKV ? "Update" : "Add"}
//                         </Button>
//                     </div>
//                 </Form>
//             </Modal>
//         </Card>
//     );
// };

// Transaction History Component
export const TransactionHistorySection = ({ todo }) => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadTransactions = useCallback(async () => {
        if (!todo || !todo.id) return;
        
        try {
            setLoading(true);
            
            // Get full todo details including transactions
            const response = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(todo.id) }
            });
            
            const todoData = response.data?.data || response.data;
            const fullTodo = transformTodoFromBackend(todoData);
            
            setTransactions(fullTodo?.transactions || []);
        } catch (error) {
            console.error("Failed to load transactions:", error);
            message.error("Failed to load transactions");
        } finally {
            setLoading(false);
        }
    }, [todo]);

    useEffect(() => {
        loadTransactions();
    }, [loadTransactions]);

    const columns = [
        {
            title: "Date",
            dataIndex: "created_at",
            render: (text, record) => {
                const dateValue = text || record.created_time || record.updated_at;
                return dateValue ? moment(dateValue).format("DD/MM/YY HH:mm") : "-";
            },
            width: 100,
            fixed: "left",
        },
        {
            title: "Updated By",
            dataIndex: "user_name",
            width: 150,
            render: (text, record) => {
                const userName = text || record.created_by_name || record.updated_by_name;
                return userName || "-";
            },
        },
        {
            title: "Comment",
            dataIndex: "description",
            render: (text, record) => {
                const comment = text || record.comment || record.metadata?.description;
                return comment || "-";
            },
            width: 250,
            ellipsis: { showTitle: true },
        },
        {
            title: "Changes",
            dataIndex: "change_json",
            width: 700,
            render: (changeJson, record) => {
                // Handle different formats of changes data
                const changesData = changeJson || record.changes || record.metadata?.changes;
                
                if (!changesData || (Array.isArray(changesData) && changesData.length === 0)) {
                    // If no change_json but we have old_value and new_value, display them
                    if (record.old_value && record.new_value) {
                        const field = record.field || record.action || "value";
                        return (
                            <div style={{ fontSize: "11px" }}>
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                    }}
                                >
                                    <span style={{ color: "#666", fontSize: "10px" }}>
                                        {field}:
                                    </span>
                                    <span style={{ color: "#ff4d4f", fontSize: "10px" }}>
                                        {JSON.stringify(record.old_value)}
                                    </span>
                                    <span>→</span>
                                    <span style={{ color: "#52c41a", fontSize: "10px" }}>
                                        {JSON.stringify(record.new_value)}
                                    </span>
                                </span>
                            </div>
                        );
                    }
                    return "-";
                }

                try {
                    const changes = typeof changesData === "string" ? JSON.parse(changesData) : changesData;

                    if (!Array.isArray(changes) || changes.length === 0) {
                        return "-";
                    }

                    return (
                        <div style={{ fontSize: "11px" }}>
                            {changes.map((change, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        marginBottom: "4px",
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "12px",
                                    }}
                                >
                                    {change.service && (
                                        <strong style={{ minWidth: "100px" }}>{change.service}:</strong>
                                    )}
                                    {change.changes &&
                                        Object.keys(change.changes).map((field) => (
                                            <span
                                                key={field}
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "4px",
                                                }}
                                            >
                                                <span style={{ color: "#666", fontSize: "10px" }}>
                                                    {field}:
                                                </span>
                                                <span style={{ color: "#ff4d4f", fontSize: "10px" }}>
                                                    {JSON.stringify(change.changes[field].old)}
                                                </span>
                                                <span>→</span>
                                                <span style={{ color: "#52c41a", fontSize: "10px" }}>
                                                    {JSON.stringify(change.changes[field].new)}
                                                </span>
                                            </span>
                                        ))}
                                </div>
                            ))}
                        </div>
                    );
                } catch (error) {
                    console.error("Error parsing change_json:", error);
                    return <span style={{ color: "#999" }}>Invalid format</span>;
                }
            },
        },
    ];

    return (
        <Card size="small" title="Transaction History">
            <Table
                dataSource={transactions}
                columns={columns}
                loading={loading}
                pagination={{ pageSize: 5, showSizeChanger: false }}
                size="small"
                scroll={{ x: 1200 }}
                rowKey={(record, index) => record.id || record.transaction_id || index}
                locale={{
                    emptyText: <Empty description="No transaction history available" />
                }}
            />
        </Card>
    );
};

export default {
    ModuleLinksSection,
    // KeyValuePairsSection,
    TransactionHistorySection
};