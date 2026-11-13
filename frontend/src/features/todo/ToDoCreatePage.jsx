import SaveWithNotification from "../../components/SaveWithNotification";
import React, { useState, useEffect } from "react";
import {
    Button,
    Card,
    Input,
    Form,
    Upload,
    message,
    Space,
    Typography,
    List,
    Tag,
    Select,
    Row,
    Col,
    Spin,
    Tabs,
    DatePicker,
    Switch,
    InputNumber,
    Avatar,
    Badge,
} from "antd";
import {
    PlusOutlined,
    LinkOutlined,
    PaperClipOutlined,
    KeyOutlined,
    HistoryOutlined,
    UserOutlined,
    CommentOutlined,
    UploadOutlined,
    TeamOutlined,
    CalendarOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import moment from "moment";
import axios from "axios";

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

// Status mapping is now handled dynamically from API data
// No need for hardcoded mappings

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
        is_private: frontendTodo.is_private ? 1 : 0, // Convert boolean to integer
        expected_duration_days: frontendTodo.expected_duration_days || null,
        visibility_scope: frontendTodo.visibility_scope || "Organization",
        attachments: frontendTodo.attachments || [],
        subscribers: frontendTodo.subscribers || [],
        comments: frontendTodo.comments || []
    };
};

// ToDo Create Page Component
export const ToDoCreatePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [todo, setTodo] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [keyValuePairs, setKeyValuePairs] = useState([]);
    const [links, setLinks] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [users, setUsers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Get status from navigation state (if coming from Kanban board)
    const prefillStatus = location.state?.status || null;

    useEffect(() => {
        loadUsersAndTeams();
    }, []);

    const loadUsersAndTeams = async () => {
        try {
            
            // Load data from actual APIs
            const [employeesResponse, departmentsResponse, statusesResponse, prioritiesResponse] = await Promise.all([
                axios.get('/get_employees'),
                axios.get('/get_all_departments'),
                axios.get('/get_todo_statuses'),
                axios.get('/get_all_priorities')
            ]);
            
            
            // Transform employees data
            const employees = (employeesResponse.data?.data || employeesResponse.data || []).map(emp => ({
                id: emp.employee_id,
                name: emp.employee_name,
            }));
            
            // Transform departments data
            const departments = (departmentsResponse.data?.data || departmentsResponse.data || []).map(dept => ({
                id: dept.department_id || dept.id,
                name: dept.department_name || dept.name,
                description: dept.description || dept.department_name || dept.name,
                department_id: dept.department_id || dept.id
            }));
            
            // Store statuses and priorities data
            const statusesData = statusesResponse.data?.data || statusesResponse.data || [];
            const prioritiesData = prioritiesResponse.data?.data || prioritiesResponse.data || [];
            
            
            setUsers(employees);
            setTeams(departments);
            setStatuses(statusesData);
            setPriorities(prioritiesData);
            
            // If status was prefilled from navigation, set it in the form
            if (prefillStatus && statusesData.length > 0) {
                // prefillStatus is the status ID, set it directly
                form.setFieldsValue({ status: prefillStatus });
            }
            
            setLoading(false);
        } catch (error) {
            console.error("Failed to load data from APIs:", error);
            setError(error.message || "Failed to load data");
            setLoading(false);
        }
    };

    // Creates the task and resolves to its id (or null when it could not be saved).
    // It does not navigate: SaveWithNotification does that through onFinished, after the notify preview.
    const saveTask = async () => {
        try {
            setSaving(true);
            
            // Validate form fields
            let values;
            try {
                values = await form.validateFields();
            } catch (validationError) {
                message.error("Please fill in all required fields");
                setSaving(false);
                return null;
            }
            
            const formData = {
                ...values,
                target_date: values.target_date?.format("YYYY-MM-DD HH:mm:ss"),
                // No default values - form validation ensures these are filled
                status: values.status,
                priority: values.priority,
                term_type: values.term_type,
                is_private: values.is_private || false,
                visibility_scope: values.visibility_scope || "Organization",
            };

            const backendData = transformTodoToBackend(formData);
            delete backendData.todo_id; // Remove for create operation
            
            
            try {
                const response = await axios.post("/create_todo_task", backendData);
                
                if (response && response.data?.data?.todo_id) {
                    message.success("Task created successfully!");
                    return response.data.data.todo_id;
                }
                message.error("Failed to create task: Invalid response from server");
                return null;
            } catch (apiError) {
                if (apiError.response) {
                    message.error(`Failed to create task: ${apiError.response.data?.detail || apiError.response.data?.message || apiError.response.statusText}`);
                } else if (apiError.request) {
                    message.error("Failed to create task: No response from server. Please check your connection.");
                } else {
                    message.error(`Failed to create task: ${apiError.message}`);
                }
                return null;
            }
        } catch (error) {
            message.error(`Failed to create task: ${error.message || "Unknown error"}`);
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        
        if (!todo) {
            message.warning("Please create the task first before adding comments");
            return;
        }

        // Mock comment addition - replace with actual API call
        const mockComment = {
            id: Date.now(),
            text: newComment,
            user: "Current User",
            created_at: new Date().toISOString()
        };
        
        setComments([...comments, mockComment]);
        setNewComment("");
        message.success("Comment added successfully");
    };

    const handleFileUpload = async (file) => {
        if (!todo) {
            message.warning("Please create the task first before uploading files");
            return false;
        }

        // Mock file upload - replace with actual API call
        const mockAttachment = {
            id: Date.now(),
            name: file.name,
            type: file.type,
            size: `${(file.size / 1024).toFixed(2)} KB`,
            created_at: new Date().toISOString()
        };
        
        setAttachments([...attachments, mockAttachment]);
        message.success("File uploaded successfully");
        
        return false; // Prevent default upload
    };

    // Show loading state while initializing
    if (loading) {
        return (
            <div className="p-6">
                <div className="flex justify-center items-center h-96">
                    <Spin size="large" tip="Loading..." />
                </div>
            </div>
        );
    }

    // Show error state if there's an error
    if (error) {
        return (
            <div className="p-6">
                <Card>
                    <div className="text-center py-8">
                        <Text type="danger">Error: {error}</Text>
                        <br />
                        <Button onClick={() => window.location.reload()} className="mt-4">
                            Reload Page
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }


    return (
        <div className="my-form-outer">
            {/* Header: title on the left, Cancel / Add on the right, like the other forms */}
            <div className="my-form-header">
                <span className="my-form-title">
                    {todo && todo.ref_no ? `Todo: ${todo.ref_no}` : "Add Todo"}
                </span>
                <Space>
                    <Button onClick={() => navigate('/todo?view=list')}>
                        Cancel
                    </Button>
                    {todo && (
                        <Button onClick={() => navigate(`/todo/edit/${todo.id}`)}>
                            Go to Edit Page
                        </Button>
                    )}
                    {!todo && (
                        <SaveWithNotification
                            actionKey="TODO_CREATE"
                            onSave={saveTask}
                            onFinished={() => navigate('/todo?view=list')}
                            saveLabel="Add"
                            notifyLabel="Add & Notify"
                            disabled={saving}
                        />
                    )}
                </Space>
            </div>
            {todo && (
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">Todo added. You can now add comments, attachments, and other details.</Text>
                </div>
            )}

            {/* Main Content */}
            <Row gutter={[24, 24]}>
                {/* Left Column - Basic Information */}
                <Col xs={24} lg={16}>
                    <Card title="Basic Information" className="mb-6">
                        <Form
                            form={form}
                            layout="vertical"
                            initialValues={{
                                // Only set status if provided from navigation (e.g., from Kanban board)
                                status: prefillStatus || undefined,
                                // No default priority
                                priority: undefined,
                                // No default term_type
                                term_type: undefined,
                                is_private: false,
                                visibility_scope: "Organization"
                            }}
                        >
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="title"
                                        label="Title"
                                        rules={[{ required: true, message: "Please enter task title" }]}
                                    >
                                        <Input placeholder="Enter task title" maxLength={100} showCount disabled={!!todo} />
                                    </Form.Item>
                                </Col>
                                {/* <Col span={12}>
                                    <Form.Item
                                        name="ref_no"
                                        label="Reference Number"
                                        tooltip="Leave empty to auto-generate"
                                    >
                                        <Input placeholder="e.g., TD-001 (auto-generated if empty)" disabled={!!todo} />
                                    </Form.Item>
                                </Col> */}
                            </Row>

                            <Form.Item
                                name="description"
                                label="Description"
                            >
                                <TextArea rows={4} placeholder="Enter task description" maxLength={255} showCount disabled={!!todo} />
                            </Form.Item>

                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        name="status"
                                        label="Status"
                                        rules={[{ required: true }]}
                                    >
                                        <Select placeholder="Select status" disabled={!!todo}>
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
                                        <Select placeholder="Select priority" disabled={!!todo}>
                                            {priorities.map(priority => (
                                                <Option key={priority.priority_id} value={priority.priority_id}>
                                                    {priority.priority_name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="term_type"
                                        label="Term Type"
                                    >
                                        <Select disabled={!!todo}>
                                            <Option value="Short Term">Short Term</Option>
                                            <Option value="Medium Term">Medium Term</Option>
                                            <Option value="Long Term">Long Term</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="target_date"
                                        label="Target Date"
                                    >
                                        <DatePicker style={{ width: "100%" }} disabled={!!todo} />
                                    </Form.Item>
                                </Col>
                                {/* <Col span={12}>
                                    <Form.Item
                                        name="expected_duration_days"
                                        label="Expected Duration (Days)"
                                    >
                                        <InputNumber min={1} style={{ width: "100%" }} disabled={!!todo} />
                                    </Form.Item>
                                </Col> */}
                            </Row>

                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        name="assigned_to_id"
                                        label="Assign To"
                                    >
                                        <Select placeholder="Select assignee" showSearch optionFilterProp="children" disabled={!!todo}>
                                            {users.map(user => (
                                                <Option key={user.id} value={user.id}>
                                                    {user.name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="owner_id"
                                        label="Owner"
                                    >
                                        <Select placeholder="Select owner" showSearch optionFilterProp="children" disabled={!!todo}>
                                            {users.map(user => (
                                                <Option key={user.id} value={user.id}>
                                                    {user.name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="team_id"
                                        label="Team"
                                    >
                                        <Select placeholder="Select team" showSearch optionFilterProp="children" disabled={!!todo}>
                                            {teams.map(team => (
                                                <Option key={team.id} value={team.id}>
                                                    {team.name} {team.description && team.description !== team.name && `- ${team.description}`}
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
                                        extra="Private tasks aren't visible to your Team, even if one is selected."
                                    >
                                        <Switch disabled={!!todo} />
                                    </Form.Item>
                                </Col>
                                {/* <Col span={12}>
                                    <Form.Item
                                        name="visibility_scope"
                                        label="Visibility Scope"
                                    >
                                        <Select disabled={!!todo}>
                                            <Option value="Organization">Organization</Option>
                                            <Option value="Team">Team</Option>
                                            <Option value="Private">Private</Option>
                                        </Select>
                                    </Form.Item>
                                </Col> */}
                            </Row>
                        </Form>
                    </Card>

                    {/* Enhanced Features - Only show if task is created */}
                    {todo ? (
                        <Card>
                            <Tabs defaultActiveKey="comments">
                                <TabPane tab={<span><CommentOutlined /> Comments</span>} key="comments">
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
                                            locale={{ emptyText: "No comments yet" }}
                                            renderItem={comment => (
                                                <List.Item>
                                                    <div className="w-full">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center space-x-2">
                                                                <Avatar size="small" icon={<UserOutlined />} />
                                                                <span className="font-medium">{comment.user}</span>
                                                            </div>
                                                            <span className="text-sm text-gray-500">
                                                                {moment(comment.created_at).format("MMM DD, HH:mm")}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm">{comment.text}</div>
                                                    </div>
                                                </List.Item>
                                            )}
                                        />
                                    </div>
                                </TabPane>

                                <TabPane tab={<span><PaperClipOutlined /> Attachments</span>} key="attachments">
                                    <div className="space-y-4">
                                        <Upload
                                            beforeUpload={handleFileUpload}
                                            showUploadList={false}
                                        >
                                            <Button icon={<UploadOutlined />}>Upload File</Button>
                                        </Upload>
                                        
                                        <List
                                            dataSource={attachments}
                                            locale={{ emptyText: "No attachments yet" }}
                                            renderItem={attachment => (
                                                <List.Item>
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-center space-x-2">
                                                            <PaperClipOutlined />
                                                            <span>{attachment.name}</span>
                                                            <Tag size="small">{attachment.type}</Tag>
                                                            <Text type="secondary" className="text-xs">
                                                                {attachment.size}
                                                            </Text>
                                                        </div>
                                                        <Button type="text" size="small">Download</Button>
                                                    </div>
                                                </List.Item>
                                            )}
                                        />
                                    </div>
                                </TabPane>
                            </Tabs>
                        </Card>
                    ) : (
                        <Card>
                            <div className="text-center py-8">
                                <Text type="secondary">
                                    Create the task first to add comments, attachments, and other details
                                </Text>
                            </div>
                        </Card>
                    )}
                </Col>

                {/* Right Column - Quick Info */}
                <Col xs={24} lg={8}>
                    {todo ? (
                        <>
                            <Card title="Quick Info" className="mb-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between">
                                        <span className="font-medium">Status:</span>
                                        <Tag color={
                                            statuses.find(s => s.todo_status_id === todo.todo_status_id)?.todo_status_name === 'New' ? 'default' : 
                                            statuses.find(s => s.todo_status_id === todo.todo_status_id)?.todo_status_name === 'In Progress' ? 'processing' : 'success'
                                        }>
                                            {statuses.find(s => s.todo_status_id === todo.todo_status_id)?.todo_status_name || 'Unknown'}
                                        </Tag>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="font-medium">Priority:</span>
                                        <Tag color={
                                            priorities.find(p => p.priority_id === todo.todo_priority_id)?.priority_id === 1 ? 'red' : 
                                            priorities.find(p => p.priority_id === todo.todo_priority_id)?.priority_id === 2 ? 'orange' : 'blue'
                                        }>
                                            {priorities.find(p => p.priority_id === todo.todo_priority_id)?.priority_name || 'Unknown'}
                                        </Tag>
                                    </div>
                                    {todo.owner_name && (
                                        <div className="flex justify-between">
                                            <span className="font-medium">Owner:</span>
                                            <div className="flex items-center space-x-1">
                                                <Avatar size="small" icon={<UserOutlined />} />
                                                <span>{todo.owner_name}</span>
                                            </div>
                                        </div>
                                    )}
                                    {todo.target_date && (
                                        <div className="flex justify-between">
                                            <span className="font-medium">Target Date:</span>
                                            <span>{moment(todo.target_date).format("MMM DD, YYYY")}</span>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <Card title="Activity Summary">
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span>Comments:</span>
                                        <Badge count={comments.length} showZero />
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Attachments:</span>
                                        <Badge count={attachments.length} showZero />
                                    </div>
                                </div>
                            </Card>
                        </>
                    ) : (
                        <Card title="Quick Info">
                            <div className="space-y-4">
                                <Text type="secondary">
                                    Task information will appear here after creation
                                </Text>
                            </div>
                        </Card>
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default ToDoCreatePage;