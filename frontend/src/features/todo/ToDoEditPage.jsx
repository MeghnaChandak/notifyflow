import SaveWithNotification from "../../components/SaveWithNotification";
import React, { useState, useEffect, useRef } from "react";
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
    Spin,
    Tabs,
    DatePicker,
    Switch,
    InputNumber,
    Avatar,
    Timeline,
    Badge,
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
    UploadOutlined,
    TeamOutlined,
    CalendarOutlined,
    RightOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import moment from "moment";
import axios from "axios";
import { ModuleLinksSection, TransactionHistorySection } from './ToDoEnhancedComponents';
import SubscriberSection from './SubscriberSection';
import AttachmentManager from './AttachmentManager';
import AddSubtaskModal from './AddSubtaskModal';
import { deriveTitle } from "./SubtaskForm";
import todoApi from './todoApi';
import { dueInfo, openForInfo } from './TaskRow';

const { Text, Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

// Status mapping is now handled dynamically from API data
// No need for hardcoded mappings

// Transform backend todo to frontend format
const transformTodoFromBackend = (backendTodo) => {
    if (!backendTodo) return null;
    
    return {
        id: backendTodo.todo_id,
        todo_id: backendTodo.todo_id,
        parent_todo_id: backendTodo.parent_todo_id || null,
        parent_todo: backendTodo.parent_todo || null,
        ref_no: backendTodo.ref_no || `TD-${backendTodo.todo_id}`,
        title: backendTodo.title,
        description: backendTodo.description || "",
        status: backendTodo.todo_status_id || null, // Store status ID directly
        priority: backendTodo.todo_priority_id ?? null, // Store priority ID directly
        term_type: backendTodo.term_type || "", // Store as string
        target_date: backendTodo.target_date || null,
        expected_duration_days: backendTodo.expected_duration_days || 0,
        assigned_to_id: backendTodo.assigned_to_id || null,
        assigned_to_name: backendTodo.assigned_to_name || "",
        owner_id: backendTodo.owner_id || null,
        owner_name: backendTodo.owner_name || "",
        team_id: backendTodo.department_id || null,
        department_id: backendTodo.department_id || null,
        team_name: backendTodo.department_name || "",
        created_by: backendTodo.created_by || null,
        created_by_name: backendTodo.created_by_name || "",
        created_at: backendTodo.created_at || backendTodo.created_time || new Date().toISOString(),
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
            updated_by: comment.updated_by || null,
            updated_at: comment.updated_time || comment.updated_at || null,
            is_deleted: comment.is_deleted || 0,
            // Keep original fields for reference
            ...comment
        })),
        subscribers: backendTodo.subscribers || [],
        links: backendTodo.links || [],
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
        todo_status_id: frontendTodo.status || frontendTodo.todo_status_id || null, // Store status ID as is
        todo_priority_id: frontendTodo.priority ?? frontendTodo.todo_priority_id ?? null, // Store priority ID as is
        term_type: frontendTodo.term_type || null, // Store term_type as string
        target_date: frontendTodo.target_date || null,
        assigned_to_id: frontendTodo.assigned_to_id || null,
        owner_id: frontendTodo.owner_id || null,
        department_id: frontendTodo.department_id || frontendTodo.team_id || null,
        assigned_date: frontendTodo.assigned_date || null,
        is_private: frontendTodo.is_private || 0,
        expected_duration_days: frontendTodo.expected_duration_days || null,
        visibility_scope: frontendTodo.visibility_scope || null,
        attachments: frontendTodo.attachments || [],
        subscribers: frontendTodo.subscribers || [],
        comments: frontendTodo.comments || []
    };
};

// Enhanced ToDo Edit Page Component
// One row in the right-hand Activity Summary — click to jump to that tab.
const ActivityRow = ({ icon, label, count, onClick }) => {
    const [hover, setHover] = useState(false);
    return (
        <div
            role="button"
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                margin: "0 -10px",
                borderRadius: 8,
                cursor: "pointer",
                background: hover ? "#f0f5ff" : "transparent",
                transition: "background .15s",
            }}
        >
            <span style={{ color: "#8c8c8c", fontSize: 15 }}>{icon}</span>
            <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
            <Badge count={count} showZero color={count > 0 ? "#1677ff" : "#d9d9d9"} />
            <RightOutlined style={{ fontSize: 10, color: hover ? "#1677ff" : "#bfbfbf" }} />
        </div>
    );
};

const InfoRow = ({ label, children }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: "1px solid #f5f5f5" }}>
        <span style={{ color: "#8c8c8c", fontSize: 13 }}>{label}</span>
        <span style={{ textAlign: "right", fontWeight: 500 }}>{children}</span>
    </div>
);

export const ToDoEditPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [todo, setTodo] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [attachments, setAttachments] = useState([]);
    // const [keyValuePairs, setKeyValuePairs] = useState([]);
    const [links, setLinks] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [subtasks, setSubtasks] = useState([]);
    const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("comments");
    const tabsRef = useRef(null);

    useEffect(() => {
        if (id) {
            loadInitialData();
        }
    }, [id]);

    const loadInitialData = async () => {
        try {
            // Load reference data and todo in parallel
            const [statusesResponse, prioritiesResponse, departmentsResponse, employeesResponse] = await Promise.all([
                axios.get('/get_todo_statuses'),
                axios.get('/get_all_priorities'),
                axios.get('/get_all_departments'),
                axios.get('/get_employees')
            ]);
            
            setStatuses(statusesResponse.data?.data || statusesResponse.data || []);
            setPriorities(prioritiesResponse.data?.data || prioritiesResponse.data || []);
            setDepartments(departmentsResponse.data?.data || departmentsResponse.data || []);
            setEmployees(employeesResponse.data?.data || employeesResponse.data || []);
            
            // Load todo after getting reference data
            await loadTodo();
        } catch (error) {
            console.error("Failed to load initial data:", error);
            message.error("Failed to load reference data");
        }
    };

    const loadTodo = async () => {
        try {
            setLoading(true);
            const response = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(id) }
            });
            
            const responseData = response.data?.data || response.data;
            const todoData = transformTodoFromBackend(responseData);
            setTodo(todoData);
            
            // Set form values
            form.setFieldsValue({
                ...todoData,
                target_date: todoData.target_date ? moment(todoData.target_date) : null
            });
            
            // Enrich comments with user names from employees list
            const enrichedComments = (todoData.comments || []).map(comment => {
                if (!comment.user || comment.user.startsWith('User ')) {
                    // Try to find user name from employees list
                    const employee = employees.find(emp => 
                        (emp.employee_id || emp.id) === comment.created_by
                    );
                    if (employee) {
                        return {
                            ...comment,
                            user: employee.employee_name || employee.name || comment.user
                        };
                    }
                }
                return comment;
            });
            
            // Load related data
            setComments(enrichedComments);
            
            const transformedAttachments = (todoData.attachments || []).map(att => ({
                url: att.url || att.attachment_url || att.file_url || '',
                name: att.name || att.file_name || att.object_name || 'attachment',
                uid: att.uid || att.attachment_id || att.id || Date.now(),
                status: att.status || 'done',
                attachment_id: att.attachment_id || att.id,
                ...att
            }));
            setAttachments(transformedAttachments);
            
            // setKeyValuePairs(todoData.key_value_pairs || []);
            setLinks(todoData.links || []);
            setTransactions(todoData.transactions || []);

            if (!todoData.parent_todo_id) {
                loadSubtasks();
            }
        } catch (error) {
            message.error("Failed to load todo");
            navigate('/todo?view=list');
        } finally {
            setLoading(false);
        }
    };

    // Subtasks are full todo rows with parent_todo_id = this todo — one level deep only.
    const loadSubtasks = async () => {
        const res = await todoApi.getSubtasks(parseInt(id));
        setSubtasks(res.data || []);
    };

    // Saves the task and resolves to its id (or null when it could not be saved).
    // It does not navigate: SaveWithNotification does that through onFinished, after the notify preview.
    const saveTask = async () => {
        try {
            setSaving(true);
            const values = await form.validateFields();
            const formData = {
                ...values,
                todo_id: parseInt(id), // Include todo_id from URL params
                target_date: values.target_date?.format("YYYY-MM-DD HH:mm:ss"),
            };

            // An action has no title field: its title comes from the description,
            // and the fields hidden for actions keep their saved values
            if (isSubtask) {
                formData.title = deriveTitle(values.description.trim());
                formData.owner_id = todo.owner_id;
                formData.term_type = todo.term_type;
            }

            // Transform to backend format
            const backendData = transformTodoToBackend(formData);
            
            // Call the actual API endpoint
            const response = await axios.put(`/update_todo_task/${parseInt(id)}`, backendData);
            
            if (response.data?.success || response.status === 200) {
                message.success("Task updated successfully");
                return parseInt(id);
            }
            throw new Error(response.data?.message || "Update failed");
        } catch (error) {
            message.error(error.response?.data?.detail || error.response?.data?.message || "Failed to save task");
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        try {
            const response = await axios.post('/add_todo_comment', {
                todo_id: parseInt(id),
                comment: newComment // Use comment to match API response format
            });
            if (response.data?.success || response.status === 200) {
                // Reload todo to get the updated comment with all fields from API
                await loadTodo();
                setNewComment("");
                message.success("Comment added successfully");
            }
        } catch (error) {
            console.error("Failed to add comment:", error);
            message.error("Failed to add comment");
        }
    };

    // const handleAddKeyValuePair = async (key, value) => {
    //     try {
    //         const response = await axios.post('/add_todo_key_value', {
    //             todo_id: parseInt(id),
    //             key: key,
    //             value: value
    //         });
    //         if (response.data?.success || response.status === 200) {
    //             setKeyValuePairs([...keyValuePairs, response.data?.data || { key, value, id: Date.now() }]);
    //             message.success("Key-value pair added successfully");
    //             loadTodo(); // Refresh to get updated transactions
    //         }
    //     } catch (error) {
    //         console.error("Failed to add key-value pair:", error);
    //         message.error("Failed to add key-value pair");
    //     }
    // };

    // const handleUpdateKeyValuePair = async (kvId, key, value) => {
    //     try {
    //         const response = await axios.post('/update_todo_key_value', {
    //             todo_id: parseInt(id),
    //             kv_id: kvId,
    //             key: key,
    //             value: value
    //         });
    //         if (response.data?.success || response.status === 200) {
    //             setKeyValuePairs(keyValuePairs.map(kv => kv.id === kvId ? (response.data?.data || { ...kv, key, value }) : kv));
    //             message.success("Key-value pair updated successfully");
    //             loadTodo(); // Refresh to get updated transactions
    //         }
    //     } catch (error) {
    //         console.error("Failed to update key-value pair:", error);
    //         message.error("Failed to update key-value pair");
    //     }
    // };

    // const handleDeleteKeyValuePair = async (kvId) => {
    //     try {
    //         const response = await axios.post('/delete_todo_key_value', {
    //             todo_id: parseInt(id),
    //             kv_id: kvId
    //         });
    //         if (response.data?.success || response.status === 200) {
    //             setKeyValuePairs(keyValuePairs.filter(kv => kv.id !== kvId));
    //             message.success("Key-value pair deleted successfully");
    //             loadTodo(); // Refresh to get updated transactions
    //         }
    //     } catch (error) {
    //         console.error("Failed to delete key-value pair:", error);
    //         message.error("Failed to delete key-value pair");
    //     }
    // };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Spin size="large" />
            </div>
        );
    }

    if (!todo) {
        return (
            <div className="p-6">
                <Empty description="Task not found" />
            </div>
        );
    }

    const currentStatusName = statuses.find(s => s.todo_status_id === todo.status)?.todo_status_name;
    const subtaskCreationLocked = ["Resolved", "Blocked", "Closed"].includes(currentStatusName);
    const isSubtask = !!todo.parent_todo_id;
    const statusName = currentStatusName || "Unknown";
    const statusColor = { New: "default", Assigned: "cyan", "In Progress": "processing", Blocked: "error", Resolved: "success", Closed: "success" }[statusName] || "default";
    const priorityName = priorities.find(p => p.priority_id === todo.priority)?.priority_name;
    const due = dueInfo(todo.target_date);
    const openFor = openForInfo(todo.created_at);

    const goTab = (key) => {
        setActiveTab(key);
        tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const activityItems = [
        { key: "comments", label: "Comments", icon: <CommentOutlined />, count: comments.length },
        { key: "attachments", label: "Attachments", icon: <PaperClipOutlined />, count: attachments.length },
        ...(!isSubtask ? [{ key: "subtasks", label: "Actions", icon: <CheckCircleOutlined />, count: subtasks.length }] : []),
        { key: "links", label: "Module Links", icon: <LinkOutlined />, count: links.length },
        { key: "subscribers", label: "Subscribers", icon: <TeamOutlined />, count: (todo.subscribers || []).length },
        { key: "transactions", label: "History", icon: <HistoryOutlined />, count: transactions.length },
    ];

    return (
        <div className="my-form-outer">
            {/* Header: title on the left, Cancel / Save on the right, like the other forms */}
            <div className="my-form-header">
                <span className="my-form-title">{isSubtask ? "Edit Action" : "Edit Todo"}</span>
                <Space>
                    <Button onClick={() => navigate('/todo?view=list')}>
                        Cancel
                    </Button>
                    <SaveWithNotification
                        actionKey="TODO_UPDATE"
                        onSave={saveTask}
                        onFinished={() => navigate('/todo?view=list')}
                        saveLabel="Save"
                        notifyLabel="Save & Notify"
                        disabled={saving}
                    />
                </Space>
            </div>

            <div style={{ marginBottom: 16 }}>
                <Title level={4} className="mb-2">
                    {todo.title}
                    <Text type="secondary" style={{ fontSize: 15, fontWeight: 400, marginLeft: 10 }}>
                        {todo.ref_no}
                    </Text>
                </Title>
                <div style={{ marginBottom: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {isSubtask ? (
                        <Tag color="purple" style={{ marginRight: 0 }}>Action</Tag>
                    ) : (
                        <Tag color="blue" style={{ marginRight: 0 }}>
                            Todo{subtasks.length > 0 ? ` · ${subtasks.length} action${subtasks.length > 1 ? "s" : ""}` : ""}
                        </Tag>
                    )}
                    <Tag color={statusColor} style={{ marginRight: 0 }}>{statusName}</Tag>
                    {todo.target_date && <Tag color={due.color} style={{ marginRight: 0 }}>{due.text}</Tag>}
                    {openFor && <span style={{ fontSize: 12, color: openFor.color }}>{openFor.text}</span>}
                </div>
                <Text type="secondary">
                    Last updated: {moment(todo.updated_at).format("MMM DD, YYYY HH:mm")}
                </Text>
                {isSubtask && todo.parent_todo && (
                    <div style={{ marginTop: 4 }}>
                        <Text type="secondary">Todo: </Text>
                        <Button
                            type="link"
                            style={{ padding: 0, height: "auto" }}
                            onClick={() => navigate(`/todo/edit/${todo.parent_todo.todo_id}`)}
                        >
                            {todo.parent_todo.todo_code || `TD-${todo.parent_todo.todo_id}`} — {todo.parent_todo.title}
                        </Button>
                        {todo.parent_todo.todo_status_name && (
                            <Tag style={{ marginLeft: 8 }}>{todo.parent_todo.todo_status_name}</Tag>
                        )}
                    </div>
                )}
            </div>

            {/* Main Content */}
            <Row gutter={[24, 24]}>
                {/* Left Column - Basic Information */}
                <Col xs={24} lg={16}>
                    <Card title="Basic Information" className="mb-6">
                        <Form
                            form={form}
                            layout="vertical"
                        >
                            <Row gutter={16}>
                                {!isSubtask && (
                                    <Col span={12}>
                                        <Form.Item
                                            name="title"
                                            label="Title"
                                            rules={[{ required: true, message: "Please enter task title" }]}
                                        >
                                            <Input placeholder="Enter task title" maxLength={100} showCount />
                                        </Form.Item>
                                    </Col>
                                )}
                                <Col span={12}>
                                    <Form.Item
                                        name="ref_no"
                                        label="Reference Number"
                                        rules={[{ required: true, message: "Please enter reference number" }]}
                                    >
                                        <Input placeholder="e.g., TD-001" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                name="description"
                                label="Description"
                                rules={isSubtask ? [{ required: true, message: "Please describe the action" }] : []}
                            >
                                <TextArea rows={4} placeholder="Enter task description" maxLength={255} showCount />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        name="status"
                                        label="Status"
                                        rules={[{ required: true }]}
                                    >
                                        <Select placeholder="Select status">
                                            {statuses.map(status => (
                                                <Option key={status.todo_status_id} value={status.todo_status_id}>
                                                    {status.todo_status_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="priority"
                                        label="Priority"
                                        rules={[{ required: true }]}
                                    >
                                        <Select placeholder="Select priority">
                                            {priorities.map(priority => (
                                                <Option key={priority.priority_id} value={priority.priority_id}>
                                                    {priority.priority_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                {!isSubtask && (
                                    <Col span={8}>
                                        <Form.Item
                                            name="term_type"
                                            label="Term Type"
                                        >
                                            <Select>
                                                <Option value="Short Term">Short Term</Option>
                                                <Option value="Medium Term">Medium Term</Option>
                                                <Option value="Long Term">Long Term</Option>
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                )}
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="target_date"
                                        label="Target Date"
                                    >
                                        <DatePicker style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                                {/* <Col span={12}>
                                    <Form.Item
                                        name="expected_duration_days"
                                        label="Expected Duration (Days)"
                                    >
                                        <InputNumber min={1} style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col> */}
                            </Row>

                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        name="assigned_to_id"
                                        label="Assign To"
                                        rules={isSubtask ? [{ required: true, message: "An action must be assigned to someone" }] : []}
                                    >
                                        <Select placeholder="Select assignee" showSearch optionFilterProp="children">
                                            {employees.map(employee => (
                                                <Option key={employee.employee_id} value={employee.employee_id}>
                                                    {employee.employee_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                {!isSubtask && (
                                    <Col span={8}>
                                        <Form.Item
                                            name="owner_id"
                                            label="Owner"
                                        >
                                            <Select placeholder="Select owner" showSearch optionFilterProp="children">
                                                {employees.map(employee => (
                                                    <Option key={employee.employee_id} value={employee.employee_id}>
                                                        {employee.employee_name}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                )}
                                <Col span={8}>
                                    <Form.Item
                                        name="team_id"
                                        label="Team"
                                        extra={isSubtask ? "Same as the todo" : undefined}
                                    >
                                        <Select placeholder="Select team" showSearch optionFilterProp="children" disabled={isSubtask}>
                                            {departments.map(department => (
                                                <Option key={department.department_id} value={department.department_id}>
                                                    {department.department_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="is_private"
                                        label="Private Task"
                                        valuePropName="checked"
                                        extra={isSubtask ? "Same as the todo" : "Private tasks aren't visible to your Team, even if one is selected."}
                                    >
                                        <Switch disabled={isSubtask} />
                                    </Form.Item>
                                </Col>
                                {/* <Col span={12}>
                                    <Form.Item
                                        name="visibility_scope"
                                        label="Visibility Scope"
                                    >
                                        <Select>
                                            <Option value="Organization">Organization</Option>
                                            <Option value="Team">Team</Option>
                                            <Option value="Private">Private</Option>
                                        </Select>
                                    </Form.Item>
                                </Col> */}
                            </Row>

                            {/* Read-only fields for Created By, Created Date, and Assigned Date */}
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        label="Created By"
                                    >
                                        <Input 
                                            value={todo.created_by_name} 
                                            disabled 
                                            prefix={<UserOutlined />}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        label="Created Date"
                                    >
                                        <Input 
                                            value={moment(todo.created_at).format("MMM DD, YYYY")} 
                                            disabled 
                                            prefix={<CalendarOutlined />}
                                        />
                                    </Form.Item>
                                </Col>
                                {/* <Col span={8}>
                                    <Form.Item
                                        label="Assigned Date"
                                    >
                                        <Input 
                                            value={moment(todo.assigned_date).format("MMM DD, YYYY")} 
                                            disabled 
                                            prefix={<CalendarOutlined />}
                                        />
                                    </Form.Item>
                                </Col> */}
                            </Row>
                        </Form>
                    </Card>

                    {/* Enhanced Features Tabs */}
                    <div ref={tabsRef} style={{ scrollMarginTop: 16 }}>
                    <Card>
                        <Tabs activeKey={activeTab} onChange={setActiveTab}>
                            <TabPane tab={<span><CommentOutlined />Comments</span>} key="comments">
                                <div className="space-y-4">
                                    <div className="flex space-x-2">
                                        <Input
                                            placeholder="Add a comment..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            onPressEnter={handleAddComment}
                                        />
                                        <Button type="primary" onClick={handleAddComment}>
                                            Add Comment
                                        </Button>
                                    </div>
                                    
                                    <List
                                        dataSource={comments}
                                        renderItem={comment => (
                                            <List.Item>
                                                <div className="w-full">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="text-sm">{comment.text}</div>
                                                        <div className="flex items-center space-x-2">
                                                            <Avatar size="small" icon={<UserOutlined />} />
                                                            <span className="font-medium">{comment.user}</span>
                                                        </div>
                                                        <span className="text-sm text-gray-500">
                                                            {moment(comment.created_at).format("MMM DD, HH:mm")}
                                                        </span>
                                                    </div>
                                                </div>
                                            </List.Item>
                                        )}
                                    />
                                </div>
                            </TabPane>

                            <TabPane tab={<span><PaperClipOutlined />Attachments</span>} key="attachments">
                                <div className="space-y-4">
                                    <AttachmentManager
                                        todoId={id}
                                        attachments={attachments || []}
                                        canEdit
                                        onChanged={loadTodo}
                                    />
                                </div>
                            </TabPane>
{/* 
                            <TabPane tab={<span><KeyOutlined />Key-Value Pairs</span>} key="kvpairs">
                                <KeyValuePairsSection 
                                    todo={todo} 
                                    onUpdate={loadTodo}
                                    onAdd={handleAddKeyValuePair}
                                    onUpdateKv={handleUpdateKeyValuePair}
                                    onDelete={handleDeleteKeyValuePair}
                                />
                            </TabPane> */}

                            {!isSubtask && (
                                <TabPane tab={<span><CheckCircleOutlined />Actions ({subtasks.length})</span>} key="subtasks">
                                    <div style={{ marginBottom: 12 }}>
                                        <Tooltip
                                            title={
                                                subtaskCreationLocked
                                                    ? `Can't add an action — this todo is ${currentStatusName}`
                                                    : ""
                                            }
                                        >
                                            <Button
                                                icon={<PlusOutlined />}
                                                disabled={subtaskCreationLocked}
                                                onClick={() => setAddSubtaskOpen(true)}
                                            >
                                                Add action
                                            </Button>
                                        </Tooltip>
                                    </div>
                                    {subtasks.length === 0 ? (
                                        <Empty description="No actions yet" />
                                    ) : (
                                        <List
                                            dataSource={subtasks}
                                            renderItem={(sub) => {
                                                const subDue = dueInfo(sub.target_date);
                                                return (
                                                    <List.Item
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => navigate(`/todo/edit/${sub.todo_id}`)}
                                                    >
                                                        <div style={{ width: "100%" }}>
                                                            <div style={{ fontWeight: 600 }}>{sub.title}</div>
                                                            <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                                                                <Tag style={{ marginRight: 0 }}>{sub.status || "New"}</Tag>
                                                                <Tag color={subDue.color} style={{ marginRight: 0 }}>{subDue.text}</Tag>
                                                                {sub.assigned_to_name && (
                                                                    <span style={{ color: "#595959" }}>
                                                                        <UserOutlined style={{ marginRight: 4 }} />
                                                                        {sub.assigned_to_name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </List.Item>
                                                );
                                            }}
                                        />
                                    )}
                                </TabPane>
                            )}

                            <TabPane tab={<span><LinkOutlined />References</span>} key="links">
                                <ModuleLinksSection 
                                    todo={todo} 
                                    onUpdate={loadTodo}
                                />
                            </TabPane>

                            <TabPane tab={<span><HistoryOutlined />Transactions</span>} key="transactions">
                                <TransactionHistorySection todo={todo} />
                            </TabPane>

                            <TabPane tab={<span><TeamOutlined />Subscribers</span>} key="subscribers">
                                <SubscriberSection 
                                    todo={todo} 
                                    onUpdate={loadTodo}
                                />
                            </TabPane>
                        </Tabs>
                    </Card>
                    </div>
                </Col>

                {/* Right Column - Quick Info */}
                <Col xs={24} lg={8}>
                    <div style={{ position: "sticky", top: 16 }}>
                        <Card title="Quick Info" className="mb-6">
                            <InfoRow label="Status"><Tag color={statusColor} style={{ marginRight: 0 }}>{statusName}</Tag></InfoRow>
                            <InfoRow label="Priority">{priorityName ? <Tag style={{ marginRight: 0 }}>{priorityName}</Tag> : "—"}</InfoRow>
                            <InfoRow label="Assigned to">
                                <UserOutlined style={{ marginRight: 6, color: "#8c8c8c" }} />
                                {todo.assigned_to_name || "Unassigned"}
                            </InfoRow>
                            <InfoRow label="Owner">{todo.owner_name || "—"}</InfoRow>
                            {todo.team_name && <InfoRow label="Team">{todo.team_name}</InfoRow>}
                            <InfoRow label="Due">
                                {todo.target_date ? (
                                    <>
                                        <Tag color={due.color} style={{ marginRight: 6 }}>{due.text}</Tag>
                                        <span style={{ color: "#8c8c8c", fontWeight: 400 }}>{moment(todo.target_date).format("MMM D, YYYY")}</span>
                                    </>
                                ) : "Not set"}
                            </InfoRow>
                            {openFor && <InfoRow label="Open for"><span style={{ color: openFor.color }}>{openFor.text.replace("Open ", "")}</span></InfoRow>}
                            <InfoRow label="Created by">{todo.created_by_name || "—"}</InfoRow>
                            {isSubtask && todo.parent_todo && (
                                <InfoRow label="Todo">
                                    <Button type="link" style={{ padding: 0, height: "auto" }} onClick={() => navigate(`/todo/edit/${todo.parent_todo.todo_id}`)}>
                                        {todo.parent_todo.title}
                                    </Button>
                                </InfoRow>
                            )}
                        </Card>

                        <Card title="Activity" extra={<Text type="secondary" style={{ fontSize: 12 }}>Click to open</Text>}>
                            {activityItems.map((item) => (
                                <ActivityRow
                                    key={item.key}
                                    icon={item.icon}
                                    label={item.label}
                                    count={item.count}
                                    onClick={() => goTab(item.key)}
                                />
                            ))}
                        </Card>
                    </div>
                </Col>
            </Row>

            {!isSubtask && (
                <AddSubtaskModal
                    open={addSubtaskOpen}
                    onClose={() => setAddSubtaskOpen(false)}
                    parentTodo={todo}
                    onCreated={loadSubtasks}
                />
            )}
        </div>
    );
};

export default ToDoEditPage;