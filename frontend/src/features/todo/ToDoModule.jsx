import React, { useState, useEffect, useCallback } from "react";
import {
    Button,
    Card,
    Col,
    Row,
    Statistic,
    Table,
    Tag,
    Select,
    Input,
    DatePicker,
    Modal,
    Form,
    Upload,
    message,
    Badge,
    Tooltip,
    Space,
    Divider,
    Typography,
    Progress,
    Avatar,
    List,
    Drawer,
    Switch,
    InputNumber,
    Empty,
    Spin,
    Segmented,
    Popconfirm,
} from "antd";
import {
    SearchOutlined,
    PlusOutlined,
    EyeOutlined,
    EditOutlined,
    DeleteOutlined,
    PaperClipOutlined,
    CommentOutlined,
    UserOutlined,
    CalendarOutlined,
    FlagOutlined,
    TeamOutlined,
    LinkOutlined,
    BellOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    StopOutlined,
    UserAddOutlined,
    DownloadOutlined,
} from "@ant-design/icons";
import { FaTasks, FaCalendarAlt, FaUsers, FaFlag } from "react-icons/fa";
import { MdDashboard, MdViewKanban, MdList } from "react-icons/md";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import moment from "moment";
import SearchComponent from "../../components/SearchComponent";
import { useAuth } from "../../auth/AuthContext";
import axios from "axios";
import MyTasksLanding from "./MyTasksLanding";
import { exportToExcel } from "../../components/ExportToExcel";
import { dueInfo } from "./TaskRow";
import { useFunctionDebounce } from "../../components/useFunctionDebounce";
import { ModuleLinksSection, TransactionHistorySection } from './ToDoEnhancedComponents';
import './ToDoModule.css';
import AddSubtaskModal from './AddSubtaskModal';

// Dynamic status and priority mappings - will be populated from API
let statusMapping = {};
let statusReverseMapping = {};
let priorityMapping = {};
let statusColorsMapping = {};
let priorityColorsMapping = {};

// Helper function to build mappings from API data
const buildMappingsFromAPI = (statuses, priorities) => {
    try {
        // Build status mappings
        statusMapping = {};
        statusReverseMapping = {};
        statusColorsMapping = {};
        
        if (Array.isArray(statuses) && statuses.length > 0) {
            statuses.forEach(status => {
                if (!status) return; // Skip null/undefined entries
                const statusName = status.todo_status_name || status.name;
                const statusId = status.todo_status_id || status.id;
                
                if (statusName && statusId) {
                    statusMapping[statusName] = statusId;
                    statusReverseMapping[statusId] = statusName;
                    
                    // Set colors based on status name
                    let color = 'default';
                    switch (statusName.toLowerCase()) {
                        case 'new': color = 'default'; break;
                        case 'assigned': color = 'blue'; break;
                        case 'in progress': color = 'processing'; break;
                        case 'blocked': color = 'warning'; break;
                        case 'resolved': color = 'success'; break;
                        case 'closed': color = 'default'; break;
                        default: color = 'default';
                    }
                    statusColorsMapping[statusName] = { color, text: statusName };
                }
            });
        }
        
        // Build priority mappings
        priorityMapping = {};
        priorityColorsMapping = {};
        
        if (Array.isArray(priorities) && priorities.length > 0) {
            priorities.forEach(priority => {
                if (!priority) return; // Skip null/undefined entries
                const priorityName = priority.priority_name || priority.name;
                const priorityId = priority.priority_id ?? priority.id;
                
                if (priorityName && priorityId !== undefined && priorityId !== null) {
                    priorityMapping[priorityName] = priorityId;
                    
                    // Set colors based on priority level
                    // 0: NA, 1: Low, 2: Medium, 3: High
                    let color = 'blue';
                    switch (priorityId) {
                        case 0: color = 'gray'; break;   // NA
                        case 1: color = 'green'; break;  // Low
                        case 2: color = 'blue'; break;   // Medium
                        case 3: color = 'orange'; break; // High
                        default: color = 'blue';
                    }
                    priorityColorsMapping[priorityId] = { color, text: priorityName };
                }
            });
        }
    } catch (error) {
        console.error("Error building mappings from API:", error);
        // Don't throw, just log the error to prevent breaking the app
    }
};

// Transform backend todo to frontend format
const transformTodoFromBackend = (backendTodo) => {
    if (!backendTodo) return null;
    
    return {
        id: backendTodo.todo_id,
        todo_id: backendTodo.todo_id,
        parent_todo_id: backendTodo.parent_todo_id || null,
        parent_title: backendTodo.parent_title || "",
        parent_code: backendTodo.parent_code || "",
        ref_no: backendTodo.ref_no || `TD-${backendTodo.todo_id}`,
        title: backendTodo.title,
        description: backendTodo.description || "",
        status: backendTodo.todo_status_id || null, // Store status as ID, not name
        todo_status_id: backendTodo.todo_status_id || null, // Also store as todo_status_id for consistency
        priority: backendTodo.todo_priority_id ?? 3,
        todo_priority_id: backendTodo.todo_priority_id ?? 3,
        term_type: backendTodo.term_type || "",
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
    // Status should be ID - if it's a string (name), try to map it, otherwise use the ID directly
    let todo_status_id = null;
    if (typeof frontendTodo.status === 'string') {
        // If status is a string (name), try to map it to ID
        todo_status_id = statusMapping[frontendTodo.status] || null;
    } else {
        // If status is already an ID, use it directly
        todo_status_id = frontendTodo.todo_status_id || frontendTodo.status || null;
    }
    
    return {
        todo_id: frontendTodo.todo_id || frontendTodo.id || null,
        title: frontendTodo.title,
        description: frontendTodo.description || null,
        todo_status_id: todo_status_id, // Use the ID directly
        todo_priority_id: frontendTodo.todo_priority_id ?? frontendTodo.priority ?? 3,
        term_type: frontendTodo.term_type || null,
        target_date: frontendTodo.target_date || null,
        assigned_to_id: frontendTodo.assigned_to_id || null,
        owner_id: frontendTodo.owner_id || null,
        department_id: frontendTodo.department_id || frontendTodo.team_id || null,
        assigned_date: frontendTodo.assigned_date || null,
        is_private: frontendTodo.is_private || 0,
        attachments: frontendTodo.attachments || [],
        subscribers: frontendTodo.subscribers || [],
        comments: frontendTodo.comments || []
    };
};

// Transform array of todos
const transformTodosFromBackend = (backendTodos) => {
    if (!Array.isArray(backendTodos)) return [];
    return backendTodos.map(transformTodoFromBackend);
};

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Text, Title } = Typography;

// Simple debounce utility
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// These will be populated dynamically from API data
// Keeping fallback objects for safety
const priorityColors = priorityColorsMapping || {
    0: { color: "gray", text: "NA" },
    1: { color: "green", text: "Low" },
    2: { color: "blue", text: "Medium" },
    3: { color: "orange", text: "High" }
};

const statusColors = statusColorsMapping || {
    "New": { color: "default", text: "New" },
    "Assigned": { color: "blue", text: "Assigned" },
    "In Progress": { color: "processing", text: "In Progress" },
    "Blocked": { color: "warning", text: "Blocked" },
    "Resolved": { color: "success", text: "Resolved" },
    "Closed": { color: "default", text: "Closed" }
};

// Dashboard Component
export const TodoDashboard = () => {
    const [stats, setStats] = useState({
        total: 0,
        open: 0,
        overdue: 0,
        critical: 0,
        avgResolution: 0
    });
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            // Load statuses, priorities, and todos for dashboard
            const [statusesResponse, prioritiesResponse, todosResponse] = await Promise.all([
                axios.get('/get_todo_statuses'),
                axios.get('/get_all_priorities'),
                axios.post("/todo_tasks", {}, { 
                    params: {
                        page: 1,
                        apply_limit: false // Get all todos for accurate stats
                    }
                })
            ]);
            
            const statusesData = statusesResponse.data?.data || statusesResponse.data || [];
            const prioritiesData = prioritiesResponse.data?.data || prioritiesResponse.data || [];
            const todosData = todosResponse.data?.data || todosResponse.data;
            
            setStatuses(statusesData);
            setPriorities(prioritiesData);
            
            // Build dynamic mappings from API data
            buildMappingsFromAPI(statusesData, prioritiesData);
            
            // Calculate stats from actual todos data
            const todos = Array.isArray(todosData) 
                ? transformTodosFromBackend(todosData)
                : transformTodosFromBackend(todosData?.todos || []);
            
            // Find status IDs for different states
            const resolvedStatus = statusesData.find(s => 
                (s.todo_status_name || s.name)?.toLowerCase() === 'resolved'
            );
            const closedStatus = statusesData.find(s => 
                (s.todo_status_name || s.name)?.toLowerCase() === 'closed'
            );
            const closedStatusIds = [resolvedStatus?.todo_status_id, closedStatus?.todo_status_id].filter(Boolean);
            
            // Find high/critical priority IDs (priority 3 is High based on user info)
            const highPriority = prioritiesData.find(p => 
                (p.priority_name || p.name)?.toLowerCase() === 'high' || p.priority_id === 3
            );
            const criticalPriorityIds = highPriority ? [highPriority.priority_id] : [3];
            
            const now = moment();
            const calculatedStats = {
                total: todos.length,
                open: todos.filter(t => !closedStatusIds.includes(t.status)).length,
                overdue: todos.filter(t => 
                    t.target_date && 
                    moment(t.target_date).isBefore(now) && 
                    !closedStatusIds.includes(t.status)
                ).length,
                critical: todos.filter(t => 
                    criticalPriorityIds.includes(t.priority)
                ).length,
                avgResolution: 0, // This would require resolution time tracking
                todos: todos, // Store todos for distribution calculations
                statusesData: statusesData,
                prioritiesData: prioritiesData
            };
            
            setStats(calculatedStats);
        } catch (error) {
            console.error("Failed to load dashboard data:", error);
        }
    };

    return (
        <div className="p-6">
            <Row gutter={[16, 16]} className="mb-6">
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Total Tasks"
                            value={stats.total}
                            prefix={<FaTasks />}
                            valueStyle={{ color: '#1890ff' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Open Tasks"
                            value={stats.open}
                            prefix={<ClockCircleOutlined />}
                            valueStyle={{ color: '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="Overdue Tasks"
                            value={stats.overdue}
                            prefix={<ExclamationCircleOutlined />}
                            valueStyle={{ color: '#f5222d' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card>
                        <Statistic
                            title="High Priority Tasks"
                            value={stats.critical}
                            prefix={<FlagOutlined />}
                            valueStyle={{ color: '#fa8c16' }}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card title="Tasks by Priority" className="h-80">
                        <div className="space-y-4">
                            {priorities.map(priority => {
                                const priorityId = priority.priority_id ?? priority.id;
                                const priorityName = priority.priority_name || priority.name;
                                const config = priorityColorsMapping[priorityId] || { color: 'blue', text: priorityName };
                                
                                // Calculate actual count for this priority
                                const count = (stats.todos || []).filter(t => t.priority === priorityId).length;
                                const percent = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                                
                                return (
                                    <div key={priorityId} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <Tag color={config.color}>{config.text}</Tag>
                                            <span>{count} tasks</span>
                                        </div>
                                        <Progress 
                                            percent={percent} 
                                            size="small" 
                                            showInfo={false}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card title="Status Distribution" className="h-80">
                        <div className="space-y-4">
                            {statuses.map(status => {
                                const statusId = status.todo_status_id || status.id;
                                const statusName = status.todo_status_name || status.name;
                                const config = statusColorsMapping[statusName] || { color: 'default', text: statusName };
                                
                                // Calculate actual count for this status
                                const count = (stats.todos || []).filter(t => t.status === statusId).length;
                                const percent = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                                
                                return (
                                    <div key={statusId} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <Tag color={config.color}>{config.text}</Tag>
                                            <span>{count} tasks</span>
                                        </div>
                                        <Progress 
                                            percent={percent} 
                                            size="small" 
                                            showInfo={false}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

// Subtasks of one row, fetched lazily on expand rather than upfront for every row.
// Renders with the exact same `columns` as the parent list — a subtask has every
// column a top-level todo has, so it shouldn't get a stripped-down view here.
// Also offers an "Add subtask" action inline, so an empty subtask list isn't a dead end.
const SubtaskExpandRow = ({ parentTodo, columns, statuses }) => {
    const [subtasks, setSubtasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);

    const parentTodoId = parentTodo.todo_id || parentTodo.id;

    const loadSubtasks = useCallback(() => {
        setLoading(true);
        axios.get("/get_todo_subtasks", { params: { parent_todo_id: parentTodoId } })
            .then(res => setSubtasks((res.data?.data || []).map(transformTodoFromBackend)))
            .catch(() => setSubtasks([]))
            .finally(() => setLoading(false));
    }, [parentTodoId]);

    useEffect(() => {
        loadSubtasks();
    }, [loadSubtasks]);

    // Same lock rule as the edit page: a Resolved/Blocked/Closed parent can't take new subtasks.
    const parentStatusId = parentTodo.status ?? parentTodo.todo_status_id;
    const currentStatusName = statuses.find(s => (s.todo_status_id || s.id) === parentStatusId)?.todo_status_name
        || statuses.find(s => (s.todo_status_id || s.id) === parentStatusId)?.name;
    const subtaskCreationLocked = ["Resolved", "Blocked", "Closed"].includes(currentStatusName);

    if (loading) return <Spin size="small" style={{ margin: "8px 24px" }} />;

    return (
        <div style={{ margin: "0 12px" }}>
            <div style={{ marginBottom: 12 }}>
                <Tooltip
                    title={
                        subtaskCreationLocked
                            ? `Can't add an action — this todo is ${currentStatusName}`
                            : ""
                    }
                >
                    <Button
                        size="small"
                        icon={<PlusOutlined />}
                        disabled={subtaskCreationLocked}
                        onClick={() => setAddSubtaskOpen(true)}
                    >
                        Add action
                    </Button>
                </Tooltip>
            </div>

            {subtasks.length === 0 ? (
                <Empty description="No actions yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: "8px 0" }} />
            ) : (
                <Table
                    columns={columns}
                    dataSource={subtasks}
                    rowKey="id"
                    size="small"
                    pagination={false}
                />
            )}

            <AddSubtaskModal
                open={addSubtaskOpen}
                onClose={() => setAddSubtaskOpen(false)}
                parentTodo={parentTodo}
                onCreated={loadSubtasks}
            />
        </div>
    );
};

// Results filter, same idea as Material Requests: Default shows what is related to you, All shows everything.
// The All option stays disabled unless the role has the all_todos permission.
const getStartingFilterCode = (permissions) => {
    if (permissions.all_todos && sessionStorage.getItem("todo_filter_code") === "ALL") {
        return "ALL";
    }
    return "DEFAULT";
};

const getResultsFilterOptions = (permissions) => [
    { label: "Default", value: "DEFAULT" },
    { label: "All", value: "ALL", disabled: !permissions.all_todos },
];

// Task List View Component
export const TaskListView = ({ permissions = {} }) => {
    const navigate = useNavigate();
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [referenceDataLoaded, setReferenceDataLoaded] = useState(false);
    const [listView, setListView] = useState("todos"); // "todos" or "actions"
    const [filterCode, setFilterCode] = useState(getStartingFilterCode(permissions));
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [titleFilter, setTitleFilter] = useState("");
    const [refFilter, setRefFilter] = useState("");
    const [parentFilter, setParentFilter] = useState(null); // {todo_id, title}, Actions view only
    const [parentQuery, setParentQuery] = useState("");
    const [parentOptions, setParentOptions] = useState([]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [ownerFilter, setOwnerFilter] = useState([]);
    const [assignedFilter, setAssignedFilter] = useState([]);
    const [createdByFilter, setCreatedByFilter] = useState([]);
    const [dueRange, setDueRange] = useState(null);
    const [teamFilter, setTeamFilter] = useState(null);
    const [termFilter, setTermFilter] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [exporting, setExporting] = useState(false);
    const [selectedTodo, setSelectedTodo] = useState(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);


    useEffect(() => {
        loadInitialData();
        loadEmployees();
        loadDepartments();
    }, []);

    const loadDepartments = async () => {
        try {
            const response = await axios.get("/get_all_departments");
            setDepartments(response.data?.data || response.data || []);
        } catch (error) {
            setDepartments([]);
        }
    };

    const loadEmployees = async () => {
        try {
            const response = await axios.get("/get_employees");
            setEmployees(response.data?.data || response.data || []);
        } catch (error) {
            setEmployees([]);
        }
    };

    // Every filter is applied by the server, so it covers all todos, not only the loaded ones
    const buildTodoQuery = () => {
        const todoQuery = {};
        if (titleFilter.trim() !== "") {
            todoQuery.TITLE = titleFilter.trim();
        }
        if (refFilter.trim() !== "") {
            // The list shows refs like TD-25, but the stored code is TD25
            todoQuery.TODO_CODE = refFilter.replace(/[^a-zA-Z0-9]/g, "");
        }
        if (listView === "actions" && parentFilter) {
            todoQuery.PARENT_TODO = [parentFilter.todo_id];
        }
        if (listView === "todos" && ownerFilter.length > 0) {
            todoQuery.OWNER = ownerFilter;
        }
        if (assignedFilter.length > 0) {
            todoQuery.ASSIGNED_TO = assignedFilter;
        }
        if (createdByFilter.length > 0) {
            todoQuery.CREATED_BY = createdByFilter;
        }
        if (dueRange) {
            todoQuery.TARGET_DATE = [dueRange[0].format("YYYY-MM-DD"), dueRange[1].format("YYYY-MM-DD")];
        }
        if (teamFilter) {
            todoQuery.DEPARTMENT = teamFilter;
        }
        if (termFilter) {
            todoQuery.TERM_TYPE = termFilter;
        }
        if (statusFilter !== "all") {
            todoQuery.STATUS = statusFilter;
        }
        if (priorityFilter !== "all") {
            todoQuery.PRIORITY = priorityFilter;
        }
        return todoQuery;
    };

    const loadInitialData = async () => {
        try {
            setLoading(true);
            // Load statuses, priorities, and todos in parallel
            const [statusesResponse, prioritiesResponse] = await Promise.all([
                axios.get('/get_todo_statuses'),
                axios.get('/get_all_priorities')
            ]);
            
            const statusesData = Array.isArray(statusesResponse.data?.data) 
                ? statusesResponse.data.data 
                : Array.isArray(statusesResponse.data) 
                    ? statusesResponse.data 
                    : [];
            const prioritiesData = Array.isArray(prioritiesResponse.data?.data) 
                ? prioritiesResponse.data.data 
                : Array.isArray(prioritiesResponse.data) 
                    ? prioritiesResponse.data 
                    : [];
            
            if (statusesData.length === 0) {
                console.warn("No statuses returned from API");
            }
            if (prioritiesData.length === 0) {
                console.warn("No priorities returned from API");
            }
            
            setStatuses(statusesData);
            setPriorities(prioritiesData);
            
            // Build dynamic mappings from API data
            buildMappingsFromAPI(statusesData, prioritiesData);
            
            // Todos load once the status and priority mappings are ready
            setReferenceDataLoaded(true);
        } catch (error) {
            console.error("Failed to load initial data:", error);
            const errorMessage = error.response?.data?.message || error.message || "Failed to load reference data";
            message.error(errorMessage);
            // Set empty arrays to prevent undefined errors
            setStatuses([]);
            setPriorities([]);
            setTodos([]);
            setLoading(false); // Ensure loading is set to false on error
        }
    };

    // A new filter starts again from the first page
    useEffect(() => {
        setPage(1);
    }, [filterCode, listView, titleFilter, refFilter, parentFilter, statusFilter, priorityFilter, ownerFilter, assignedFilter, createdByFilter, dueRange, teamFilter, termFilter]);

    // Search the todos offered in the Todo filter (closed ones included)
    useFunctionDebounce(
        async (cancelToken) => {
            if (listView !== "actions") {
                return;
            }
            try {
                const response = await axios.post("/todo_tasks", { TITLE: parentQuery }, {
                    params: { page: 1, apply_limit: true, page_multiplier: 20, top_level_only: true, filter_code: filterCode },
                    cancelToken
                });
                setParentOptions(response.data?.data || []);
            } catch (error) {
                setParentOptions([]);
            }
        },
        350,
        [listView, parentQuery, filterCode]
    );

    // Reload when the page or a filter changes; the short delay keeps typing in the search box from firing a request per letter
    useEffect(() => {
        if (!referenceDataLoaded) {
            return;
        }
        const timer = setTimeout(() => loadTodos(), 350);
        return () => clearTimeout(timer);
    }, [referenceDataLoaded, filterCode, listView, page, pageSize, titleFilter, refFilter, parentFilter, statusFilter, priorityFilter, ownerFilter, assignedFilter, createdByFilter, dueRange, teamFilter, termFilter]);

    const loadTodos = async () => {
        try {
            setLoading(true);
            const response = await axios.post("/todo_tasks", buildTodoQuery(), { 
                params: {
                    page: page,
                    apply_limit: true,
                    page_multiplier: pageSize,
                    top_level_only: listView === "todos",
                    actions_only: listView === "actions",
                    filter_code: filterCode
                }
            });
            
            const responseData = response.data?.data || response.data;
            const todos = Array.isArray(responseData) 
                ? transformTodosFromBackend(responseData)
                : transformTodosFromBackend(responseData?.todos || []);
            
            setTodos(todos);
            setTotalCount(response.data?.total_count || 0);
        } catch (error) {
            console.error("Failed to load todos:", error);
            const errorMessage = error.response?.data?.message || error.message || "Failed to load todos";
            message.error(errorMessage);
            setTodos([]); // Set empty array on error to prevent undefined issues
        } finally {
            setLoading(false);
        }
    };

    // Todos view: every matching todo followed by its actions. Actions view: every matching action.
    const handleExport = async () => {
        try {
            setExporting(true);
            const response = await axios.post("/todo_tasks", buildTodoQuery(), {
                params: {
                    apply_limit: false,
                    for_export: true,
                    actions_only: listView === "actions",
                    filter_code: filterCode
                }
            });
            const responseData = response.data?.data || response.data;
            const exportTodos = transformTodosFromBackend(Array.isArray(responseData) ? responseData : []);

            const parentRefs = {};
            exportTodos.forEach(todo => {
                if (!todo.parent_todo_id) {
                    parentRefs[todo.todo_id] = todo.ref_no;
                }
            });

            const rows = [];
            exportTodos.forEach(todo => {
                const statusObj = statuses.find(s => (s.todo_status_id || s.id) === todo.status);
                const priorityObj = priorities.find(p => (p.priority_id ?? p.id) === todo.priority);
                rows.push({
                    type: todo.parent_todo_id ? "Action" : "Todo",
                    parent_ref_no: todo.parent_todo_id ? (parentRefs[todo.parent_todo_id] || todo.parent_code) : "",
                    parent_title: todo.parent_title,
                    ref_no: todo.ref_no,
                    title: todo.title,
                    description: todo.description,
                    assigned_to_name: todo.assigned_to_name,
                    owner_name: todo.owner_name,
                    team_name: todo.team_name,
                    status: statusObj ? (statusObj.todo_status_name || statusObj.name) : "",
                    priority: priorityObj ? (priorityObj.priority_name || priorityObj.name) : "",
                    term_type: todo.term_type,
                    target_date: todo.target_date ? moment(todo.target_date).format("DD/MM/YYYY") : "",
                    created_by_name: todo.created_by_name,
                    created_at: todo.created_at ? moment(todo.created_at).format("DD/MM/YYYY HH:mm") : "",
                });
            });

            await exportToExcel({
                fileName: `${listView}_${moment().format("YYYY-MM-DD")}`,
                sheets: [{
                    sheetName: listView === "actions" ? "Actions" : "Todos",
                    data: rows,
                    columns: [
                        { title: "Type", dataIndex: "type" },
                        { title: "Parent Ref No", dataIndex: "parent_ref_no" },
                        { title: "Parent Todo", dataIndex: "parent_title" },
                        { title: "Ref No", dataIndex: "ref_no" },
                        { title: "Title", dataIndex: "title" },
                        { title: "Description", dataIndex: "description" },
                        { title: "Assigned To", dataIndex: "assigned_to_name" },
                        { title: "Owner", dataIndex: "owner_name" },
                        { title: "Team", dataIndex: "team_name" },
                        { title: "Status", dataIndex: "status" },
                        { title: "Priority", dataIndex: "priority" },
                        { title: "Term Type", dataIndex: "term_type" },
                        { title: "Target Date", dataIndex: "target_date" },
                        { title: "Created By", dataIndex: "created_by_name" },
                        { title: "Created At", dataIndex: "created_at" },
                    ],
                }],
            });
        } catch (error) {
            message.error("Failed to export todos");
        } finally {
            setExporting(false);
        }
    };

    const handleStatusChange = async (todoId, newStatusId) => {
        try {
            // Get current todo first
            const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(todoId) }
            });
            
            const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
            const currentTodo = transformTodoFromBackend(currentTodoData);
            
            if (!currentTodo) {
                throw new Error("Todo not found");
            }

            // Update with new status ID (newStatusId is already the ID from the dropdown)
            const backendData = transformTodoToBackend({
                ...currentTodo,
                status: newStatusId, // This is now the status ID
                todo_status_id: newStatusId // Also set explicitly
            });

            await axios.put(`/update_todo_task/${todoId}`, backendData);
            message.success("Status updated successfully");
            loadTodos();
        } catch (error) {
            console.error("Failed to update status:", error);
            message.error(error?.response?.data?.detail || "Failed to update status");
        }
    };

    const handleDelete = async (todoId) => {
        try {
            // Add a small delay to prevent ResizeObserver issues
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                await axios.delete(`/delete_todo_task/${todoId}`);
            } catch (deleteError) {
                // If DELETE doesn't exist, try updating with a closed status
                const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                    params: { todo_id: parseInt(todoId) }
                });
                
                const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
                const currentTodo = transformTodoFromBackend(currentTodoData);
                
                if (currentTodo) {
                    const backendData = transformTodoToBackend({
                        ...currentTodo,
                        status: "Closed"
                    });
                    await axios.put(`/update_todo_task/${todoId}`, backendData);
                }
            }
            
            message.success("Task deleted successfully");
            // Use setTimeout to defer the state update
            setTimeout(() => {
                loadTodos();
            }, 50);
        } catch (error) {
            message.error("Failed to delete task");
        }
    };

    const columns = [
        {
            title: "Ref",
            dataIndex: "ref_no",
            key: "ref_no",
            width: 90,
            render: (text) => <span className="tdl-ref">{text}</span>
        },
        {
            title: "Title",
            dataIndex: "title",
            key: "title",
            width: 280,
            render: (text, record) => (
                <div>
                    <a className="tdl-row-title" onClick={() => navigate(`/todo/edit/${record.id}`)}>{text}</a>
                    {record.description && <div className="tdl-row-desc">{record.description}</div>}
                </div>
            )
        },
        {
            title: "Assigned to",
            dataIndex: "assigned_to_name",
            key: "assigned_to_name",
            width: 170,
            render: (text) => text || <span className="tdl-muted">—</span>
        },
        {
            title: "Owner",
            dataIndex: "owner_name",
            key: "owner_name",
            width: 170,
            render: (text) => text || <span className="tdl-muted">—</span>
        },
        {
            title: "Priority",
            dataIndex: "priority",
            key: "priority",
            width: 100,
            render: (priority) => {
                const config = priorityColorsMapping[priority] || { color: 'blue', text: 'Unknown' };
                return (
                    <Tag color={config.color} style={{ marginRight: 0 }}>
                        {config.text}
                    </Tag>
                );
            }
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            width: 140,
            render: (status, record) => (
                <Select
                    size="small"
                    value={status}
                    onChange={(value) => handleStatusChange(record.id, value)}
                    style={{ width: 120 }}
                >
                    {statuses.map(s => {
                        const sId = s.todo_status_id || s.id;
                        const sName = s.todo_status_name || s.name;
                        const sConfig = statusColorsMapping[sName] || { color: 'default', text: sName };
                        return (
                            <Option key={sId} value={sId}>
                                <Tag color={sConfig.color} style={{ marginRight: 0 }}>
                                    {sName}
                                </Tag>
                            </Option>
                        );
                    })}
                </Select>
            )
        },
        {
            title: "Due",
            dataIndex: "target_date",
            key: "target_date",
            width: 150,
            render: (date, record) => {
                if (!date) {
                    return <span className="tdl-muted">No due date</span>;
                }
                const statusObj = statuses.find(item => (item.todo_status_id || item.id) === record.status);
                const closed = statusObj && (statusObj.todo_status_name || statusObj.name) === "Closed";
                const due = dueInfo(date);
                return (
                    <div>
                        <div>{moment(date).format("DD MMM YYYY")}</div>
                        {!closed && <Tag color={due.color} style={{ marginRight: 0 }}>{due.text}</Tag>}
                    </div>
                );
            }
        },
        {
            title: "Created",
            key: "created_info",
            width: 160,
            render: (text, record) => (
                <div>
                    <div>{record.created_by_name || "N/A"}</div>
                    <div className="tdl-muted">
                        {record.created_at ? moment(record.created_at).format("DD MMM YYYY, HH:mm") : "N/A"}
                    </div>
                </div>
            ),
            sorter: (a, b) => {
                if (!a.created_at && !b.created_at) return 0;
                if (!a.created_at) return -1;
                if (!b.created_at) return 1;
                return moment(a.created_at).unix() - moment(b.created_at).unix();
            },
        },
        {
            title: "",
            key: "actions",
            width: 110,
            fixed: "right",
            render: (_, record) => (
                <Space size={0}>
                    <Tooltip title="Quick view">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setSelectedTodo(record);
                                setDrawerVisible(true);
                            }}
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => navigate(`/todo/edit/${record.id}`)}
                        />
                    </Tooltip>
                    {permissions.delete && (
                        <Popconfirm
                            title="Delete this item?"
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => handleDelete(record.id)}
                        >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            )
        }
    ];

    // The Actions view is about the action itself: no owner column, and a link to the todo it belongs to
    const actionColumns = [];
    columns.forEach(column => {
        if (column.key === "owner_name") {
            return;
        }
        actionColumns.push(column);
        if (column.key === "title") {
            actionColumns.push({
                title: "Todo",
                dataIndex: "parent_title",
                key: "parent_title",
                width: 180,
                ellipsis: true,
                render: (text, record) => (
                    <a onClick={() => navigate(`/todo/edit/${record.parent_todo_id}`)}>{text || record.parent_code}</a>
                )
            });
        }
    });

    const hasActiveFilters =
        titleFilter !== "" ||
        refFilter !== "" ||
        (listView === "actions" && parentFilter !== null) ||
        statusFilter !== "all" ||
        priorityFilter !== "all" ||
        ownerFilter.length > 0 ||
        assignedFilter.length > 0 ||
        createdByFilter.length > 0 ||
        dueRange !== null ||
        teamFilter !== null ||
        termFilter !== null;

    const clearFilters = () => {
        setTitleFilter("");
        setRefFilter("");
        setParentFilter(null);
        setStatusFilter("all");
        setPriorityFilter("all");
        setOwnerFilter([]);
        setAssignedFilter([]);
        setCreatedByFilter([]);
        setDueRange(null);
        setTeamFilter(null);
        setTermFilter(null);
    };

    return (
        <div className="tdl-page">
            <div className="tdl-header">
                <div className="tdl-title">
                    {listView === "actions" ? "Actions" : "Todos"}
                    <span className="tdl-count">{totalCount}</span>
                </div>
                <Space>
                    <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
                        Export
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={!permissions.add}
                        onClick={() => navigate('/todo/create')}
                    >
                        New
                    </Button>
                </Space>
            </div>

            <div className="tdl-panel tdl-toolbar">
                <Segmented
                    size="small"
                    options={[
                        { label: "Todos", value: "todos" },
                        { label: "Actions", value: "actions" },
                    ]}
                    value={listView}
                    onChange={setListView}
                />
                                <Tooltip title="Default shows the todos related to you. All shows every todo.">
                    <Select
                        size="small"
                        className="tdl-filter"
                        value={filterCode}
                        options={getResultsFilterOptions(permissions)}
                        onChange={(value) => {
                            sessionStorage.setItem("todo_filter_code", value);
                            setFilterCode(value);
                        }}
                    />
                </Tooltip>
                <div className="tdl-search">
                    <Input
                        size="small"
                        allowClear
                        placeholder="Title"
                        prefix={<SearchOutlined />}
                        value={titleFilter}
                        onChange={(e) => setTitleFilter(e.target.value)}
                    />
                </div>
                <div className="tdl-ref-filter">
                    <Input
                        size="small"
                        allowClear
                        placeholder="Ref no"
                        value={refFilter}
                        onChange={(e) => setRefFilter(e.target.value)}
                    />
                </div>
                {listView === "actions" && (
                    <Select
                        size="small"
                        showSearch
                        allowClear
                        filterOption={false}
                        className="tdl-filter tdl-filter-wide"
                        placeholder="Todo"
                        searchValue={parentQuery}
                        onSearch={setParentQuery}
                        value={parentFilter ? parentFilter.todo_id : undefined}
                        onChange={(value) => {
                            if (value === undefined) {
                                setParentFilter(null);
                                return;
                            }
                            setParentFilter(parentOptions.find(option => option.todo_id === value) || null);
                        }}
                    >
                        {parentOptions.map(option => (
                            <Option key={option.todo_id} value={option.todo_id}>
                                {option.title}
                            </Option>
                        ))}
                    </Select>
                )}
                <Select size="small" className="tdl-filter" value={statusFilter} onChange={setStatusFilter}>
                    <Option value="all">All status</Option>
                    {statuses.map(status => (
                        <Option key={status.todo_status_id || status.id} value={status.todo_status_id || status.id}>
                            {status.todo_status_name || status.name}
                        </Option>
                    ))}
                </Select>
                <Select size="small" className="tdl-filter" value={priorityFilter} onChange={setPriorityFilter}>
                    <Option value="all">All priority</Option>
                    {priorities.map(priority => (
                        <Option key={priority.priority_id ?? priority.id} value={priority.priority_id ?? priority.id}>
                            {priority.priority_name || priority.name}
                        </Option>
                    ))}
                </Select>
                {listView === "todos" && (
                    <Select
                        size="small"
                        mode="multiple"
                        allowClear
                        showSearch
                        optionFilterProp="children"
                        maxTagCount="responsive"
                        className="tdl-filter tdl-filter-wide"
                        placeholder="Owner"
                        value={ownerFilter}
                        onChange={setOwnerFilter}
                    >
                        {employees.map(employee => (
                            <Option key={employee.employee_id || employee.id} value={employee.employee_id || employee.id}>
                                {employee.employee_name || employee.name}
                            </Option>
                        ))}
                    </Select>
                )}
                <Select
                        size="small"
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    maxTagCount="responsive"
                    className="tdl-filter tdl-filter-wide"
                    placeholder="Assigned to"
                    value={assignedFilter}
                    onChange={setAssignedFilter}
                >
                    {employees.map(employee => (
                        <Option key={employee.employee_id || employee.id} value={employee.employee_id || employee.id}>
                            {employee.employee_name || employee.name}
                        </Option>
                    ))}
                </Select>
                <Select
                    size="small"
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    maxTagCount="responsive"
                    className="tdl-filter tdl-filter-wide"
                    placeholder="Created by"
                    value={createdByFilter}
                    onChange={setCreatedByFilter}
                >
                    {employees.map(employee => (
                        <Option key={employee.employee_id || employee.id} value={employee.employee_id || employee.id}>
                            {employee.employee_name || employee.name}
                        </Option>
                    ))}
                </Select>
                <RangePicker
                    size="small"
                    className="tdl-filter-range"
                    placeholder={["Due from", "Due to"]}
                    value={dueRange}
                    onChange={setDueRange}
                />
                <Select
                    size="small"
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    className="tdl-filter"
                    placeholder="Team"
                    value={teamFilter}
                    onChange={(value) => setTeamFilter(value === undefined ? null : value)}
                >
                    {departments.map(department => (
                        <Option key={department.department_id || department.id} value={department.department_id || department.id}>
                            {department.department_name || department.name}
                        </Option>
                    ))}
                </Select>
                <Select
                    size="small"
                    allowClear
                    className="tdl-filter"
                    placeholder="Term type"
                    value={termFilter}
                    onChange={(value) => setTermFilter(value === undefined ? null : value)}
                >
                    <Option value="Short Term">Short Term</Option>
                    <Option value="Medium Term">Medium Term</Option>
                    <Option value="Long Term">Long Term</Option>
                </Select>
                {hasActiveFilters && (
                    <Button size="small" type="link" onClick={clearFilters}>
                        Clear filters
                    </Button>
                )}
            </div>

            <div className="tdl-panel">
                <Table
                    className="tdl-table"
                    columns={listView === "actions" ? actionColumns : columns}
                    dataSource={todos}
                    loading={loading}
                    rowKey="id"
                    scroll={{ x: "max-content" }}
                    expandable={listView === "todos" ? {
                        expandedRowRender: record => (
                            <SubtaskExpandRow parentTodo={record} columns={columns} statuses={statuses} />
                        ),
                    } : undefined}
                    pagination={{
                        current: page,
                        pageSize: pageSize,
                        total: totalCount,
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
                        onChange: (newPage, newPageSize) => {
                            setPage(newPage);
                            setPageSize(newPageSize);
                        }
                    }}
                />
            </div>

            <TaskDetailDrawer
                todo={selectedTodo}
                visible={drawerVisible}
                onClose={() => setDrawerVisible(false)}
                onUpdate={loadTodos}
            />
        </div>
    );
};

// Enhanced Kanban Board Component with Advanced Features
export const KanbanBoard = ({ permissions = {} }) => {
    const navigate = useNavigate();
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [teamFilter, setTeamFilter] = useState("all");
    const [filterCode, setFilterCode] = useState(getStartingFilterCode(permissions));
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            // Load reference data and todos in parallel
            const [statusesResponse, prioritiesResponse, departmentsResponse] = await Promise.all([
                axios.get('/get_todo_statuses'),
                axios.get('/get_all_priorities'),
                axios.get('/get_all_departments')
            ]);
            
            const statusesData = statusesResponse.data?.data || statusesResponse.data || [];
            const prioritiesData = prioritiesResponse.data?.data || prioritiesResponse.data || [];
            const departmentsData = departmentsResponse.data?.data || departmentsResponse.data || [];
            
            setStatuses(statusesData);
            setPriorities(prioritiesData);
            setDepartments(departmentsData);
            
            // Build dynamic mappings from API data
            buildMappingsFromAPI(statusesData, prioritiesData);
            
            // Load todos after getting reference data
            await loadTodos();
        } catch (error) {
            console.error("Failed to load initial data:", error);
            message.error("Failed to load reference data");
        }
    };

    const loadTodos = async (newFilterCode) => {
        try {
            setLoading(true);
            const response = await axios.post("/todo_tasks", {}, { 
                params: {
                    page: 1,
                    apply_limit: true,
                    page_multiplier: 100,
                    filter_code: typeof newFilterCode === "string" ? newFilterCode : filterCode
                }
            });
            
            const responseData = response.data?.data || response.data;
            const todos = Array.isArray(responseData) 
                ? transformTodosFromBackend(responseData)
                : transformTodosFromBackend(responseData?.todos || []);
            
            setTodos(todos);
        } catch (error) {
            message.error("Failed to load todos");
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (todoId, newStatusId) => {
        try {
            // Add a small delay to prevent ResizeObserver issues during drag operations
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Get current todo first
            const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(todoId) }
            });
            
            const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
            const currentTodo = transformTodoFromBackend(currentTodoData);
            
            if (!currentTodo) {
                throw new Error("Todo not found");
            }

            // Find status name for the message
            const statusObj = statuses.find(s => (s.todo_status_id || s.id) === newStatusId);
            const statusName = statusObj ? (statusObj.todo_status_name || statusObj.name) : 'Unknown';

            // Update with new status ID (newStatusId is already the ID from the column)
            const backendData = transformTodoToBackend({
                ...currentTodo,
                status: newStatusId, // This is now the status ID
                todo_status_id: newStatusId // Also set explicitly
            });

            await axios.put(`/update_todo_task/${todoId}`, backendData);
            message.success(`Task moved to ${statusName}`);
            // Defer the state update to prevent layout shifts
            setTimeout(() => {
                loadTodos();
            }, 100);
        } catch (error) {
            console.error("Failed to update status:", error);
            message.error(error?.response?.data?.detail || "Failed to update status");
        }
    };

    const handleEditTask = (todo) => {
        navigate(`/todo/edit/${todo.id}`);
    };

    const getTodosByStatus = (statusId) => {
        // statusId is now the status ID (number), compare with todo.status which is also an ID.
        // Subtasks stay off the board itself — they show as a count on their parent's card.
        let filteredTodos = todos.filter(todo =>
            !todo.parent_todo_id && (todo.status === statusId || todo.todo_status_id === statusId)
        );
        
        // Apply search filter
        if (searchText) {
            filteredTodos = filteredTodos.filter(todo =>
                todo.title.toLowerCase().includes(searchText.toLowerCase()) ||
                todo.description.toLowerCase().includes(searchText.toLowerCase()) ||
                todo.ref_no.toLowerCase().includes(searchText.toLowerCase())
            );
        }
        
        // Apply priority filter
        if (priorityFilter !== "all") {
            filteredTodos = filteredTodos.filter(todo => todo.priority === parseInt(priorityFilter));
        }
        
        // Apply team filter
        if (teamFilter !== "all") {
            filteredTodos = filteredTodos.filter(todo => todo.team_id === parseInt(teamFilter));
        }
        
        return filteredTodos;
    };

    // Build status columns from API data
    const getStatusColumns = () => {
        const iconMapping = {
            'new': '🆕',
            'assigned': '👤',
            'in progress': '⚡',
            'blocked': '🚫',
            'resolved': '✅',
            'closed': '🔒'
        };
        
        const colorMapping = {
            'new': '#1890ff',
            'assigned': '#52c41a',
            'in progress': '#fa8c16',
            'blocked': '#f5222d',
            'resolved': '#13c2c2',
            'closed': '#722ed1'
        };
        
        const descriptionMapping = {
            'new': 'Newly created tasks',
            'assigned': 'Tasks assigned to team members',
            'in progress': 'Tasks currently being worked on',
            'blocked': 'Tasks blocked by dependencies',
            'resolved': 'Tasks completed and ready for testing',
            'closed': 'Tasks fully completed and closed'
        };
        
        return statuses.map(status => {
            const statusName = status.todo_status_name || status.name;
            const statusId = status.todo_status_id || status.id;
            const statusKey = statusName.toLowerCase();
            
            return {
                id: statusId, // Use status ID instead of name
                statusId: statusId, // Also store as statusId for clarity
                title: statusName,
                color: colorMapping[statusKey] || '#1890ff',
                icon: iconMapping[statusKey] || '📋',
                description: descriptionMapping[statusKey] || `Tasks with ${statusName} status`
            };
        });
    };
    
    const statusColumns = getStatusColumns();

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="kanban-board">
                <div className="flex justify-between items-center mb-6">
                    <Title level={2}>Kanban Board</Title>
                    <Space>
                        <Tooltip title="Default shows the todos related to you. All shows every todo.">
                            <Select
                                value={filterCode}
                                style={{ width: 140 }}
                                options={getResultsFilterOptions(permissions)}
                                onChange={(value) => {
                                    sessionStorage.setItem("todo_filter_code", value);
                                    setFilterCode(value);
                                    loadTodos(value);
                                }}
                            />
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            disabled={!permissions.add}
                            onClick={() => navigate('/todo/create')}
                        >
                            New
                        </Button>
                    </Space>
                </div>

                {/* Enhanced Filters */}
                <Card className="mb-6">
                    <Row gutter={[16, 16]} align="middle">
                        <Col xs={24} sm={8} md={6}>
                            <Input
                                placeholder="Search tasks..."
                                prefix={<SearchOutlined />}
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                allowClear
                            />
                        </Col>
                        <Col xs={24} sm={8} md={4}>
                            <Select
                                placeholder="Priority"
                                value={priorityFilter}
                                onChange={setPriorityFilter}
                                style={{ width: "100%" }}
                                allowClear
                            >
                                <Option value="all">All Priority</Option>
                                {priorities.map(priority => (
                                    <Option key={priority.priority_id ?? priority.id} value={priority.priority_id ?? priority.id}>
                                        {priority.priority_name || priority.name}
                                    </Option>
                                ))}
                            </Select>
                        </Col>
                        <Col xs={24} sm={8} md={4}>
                            <Select
                                placeholder="Team"
                                value={teamFilter}
                                onChange={setTeamFilter}
                                style={{ width: "100%" }}
                                allowClear
                            >
                                <Option value="all">All Teams</Option>
                                {departments.map(dept => (
                                    <Option key={dept.department_id || dept.id} value={dept.department_id || dept.id}>
                                        {dept.department_name || dept.name}
                                    </Option>
                                ))}
                            </Select>
                        </Col>
                        <Col xs={24} sm={24} md={10}>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                                <span>Total Tasks: <strong>{todos.length}</strong></span>
                                <span>Overdue: <strong className="text-red-500">{
                                    todos.filter(t => {
                                        // Find closed/resolved status IDs
                                        const resolvedStatus = statuses.find(s => 
                                            (s.todo_status_name || s.name)?.toLowerCase() === 'resolved'
                                        );
                                        const closedStatus = statuses.find(s => 
                                            (s.todo_status_name || s.name)?.toLowerCase() === 'closed'
                                        );
                                        const closedStatusIds = [resolvedStatus?.todo_status_id, closedStatus?.todo_status_id].filter(Boolean);
                                        
                                        return t.target_date && 
                                               moment(t.target_date).isBefore(moment(), 'day') && 
                                               !closedStatusIds.includes(t.status);
                                    }).length
                                }</strong></span>
                                <span>High Priority: <strong className="text-red-500">{todos.filter(t => t.priority === 3).length}</strong></span>
                            </div>
                        </Col>
                    </Row>
                </Card>

                {/* Kanban Columns */}
                <div 
                    className="kanban-columns-container"
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'nowrap',
                        alignItems: 'flex-start',
                        gap: '16px',
                        overflowX: 'auto',
                        paddingBottom: '16px'
                    }}
                >
                    {statusColumns.map(column => (
                        <DroppableColumn
                            key={column.id}
                            column={column}
                            todos={getTodosByStatus(column.id)}
                            allTodos={todos}
                            onStatusChange={handleStatusChange}
                            onEdit={handleEditTask}
                            navigate={navigate}
                            loading={loading}
                        />
                    ))}
                </div>

            </div>
        </DndProvider>
    );
};

// Draggable Task Card Component
const DraggableTaskCard = ({ todo, onEdit, subtaskCount = 0 }) => {
    const auth = useAuth();
    const currentUserId = auth.user?.employee_id;
    
    const [{ isDragging }, drag] = useDrag({
        type: 'task',
        item: { id: todo.id, status: todo.status },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subscribing, setSubscribing] = useState(false);

    const isOverdue = moment(todo.target_date).isBefore(moment(), 'day');

    useEffect(() => {
        checkSubscriptionStatus();
    }, [todo.id, currentUserId]);

    const checkSubscriptionStatus = async () => {
        try {
            if (!currentUserId) return;
            
            const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(todo.id) }
            });
            
            const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
            const currentTodo = transformTodoFromBackend(currentTodoData);
            
            if (currentTodo) {
                const subscribers = currentTodo.subscribers || [];
                const isSubscribed = subscribers.some(
                    s => s.subscriber_id === currentUserId || s.user_id === currentUserId
                );
                setIsSubscribed(isSubscribed);
            }
        } catch (error) {
            console.error("Failed to check subscription status");
        }
    };

    const handleSubscribeToggle = async (e) => {
        e.stopPropagation(); // Prevent card click
        try {
            if (!currentUserId) {
                message.error("User not authenticated");
                return;
            }
            
            setSubscribing(true);
            
            const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(todo.id) }
            });
            
            const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
            const currentTodo = transformTodoFromBackend(currentTodoData);
            
            if (!currentTodo) {
                throw new Error("Todo not found");
            }

            let subscribers = currentTodo.subscribers || [];
            
            if (isSubscribed) {
                // Unsubscribe
                subscribers = subscribers.filter(
                    s => s.subscriber_id !== currentUserId && s.user_id !== currentUserId
                );
                setIsSubscribed(false);
                message.success("Unsubscribed from task");
            } else {
                // Subscribe
                const isAlreadySubscribed = subscribers.some(
                    s => s.subscriber_id === currentUserId || s.user_id === currentUserId
                );

                if (!isAlreadySubscribed) {
                    subscribers.push({
                        subscriber_id: currentUserId
                    });
                }
                setIsSubscribed(true);
                message.success("Subscribed to task");
            }

            const backendData = transformTodoToBackend({
                ...currentTodo,
                subscribers: subscribers
            });

            await axios.put(`/update_todo_task/${todo.id}`, backendData);
        } catch (error) {
            message.error("Failed to update subscription");
        } finally {
            setSubscribing(false);
        }
    };

    return (
        <div
            ref={drag}
            className={`draggable-card cursor-pointer hover:shadow-lg transition-all duration-200 ${
                isDragging ? 'dragging' : ''
            }`}
            onClick={() => onEdit(todo)}
        >
            <Card
                size="small"
                className="todo-card mb-3"
                style={{
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    border: '1px solid #e8e8e8'
                }}
            >
                <div className="space-y-3">
                    {/* Header with Ref No and Priority */}
                    <div className="flex items-center justify-between">
                        <Text 
                            code 
                            className="text-xs font-bold" 
                            style={{ 
                                backgroundColor: '#f0f0f0',
                                color: '#666',
                                padding: '2px 6px',
                                borderRadius: '4px'
                            }}
                        >
                            {todo.ref_no}
                        </Text>
                        <Tag 
                            color={priorityColorsMapping[todo.priority]?.color || 'blue'} 
                            size="small"
                            style={{ fontWeight: 'bold' }}
                        >
                            {priorityColorsMapping[todo.priority]?.text || 'Unknown'}
                        </Tag>
                    </div>

                    {/* Title */}
                    <div 
                        className="font-semibold text-sm text-gray-800" 
                        title={todo.title} 
                        style={{ 
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: '1.4'
                        }}
                    >
                        {todo.title}
                    </div>

                    {subtaskCount > 0 && (
                        <Tag color="purple" style={{ fontSize: 11 }}>
                            {subtaskCount} action{subtaskCount > 1 ? "s" : ""}
                        </Tag>
                    )}

                    {/* Description */}
                    <div 
                        className="text-xs text-gray-600" 
                        style={{ 
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: '1.3'
                        }}
                    >
                        {todo.description?.substring(0, 100)}...
                    </div>

                    {/* Footer with Assign To and Date */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-200">
                        <div className="flex items-center space-x-2">
                            <Avatar 
                                size="small" 
                                icon={<UserOutlined />}
                                style={{ backgroundColor: '#1890ff' }}
                            />
                            <span className="truncate max-w-20 font-medium text-gray-700">
                                {todo.assigned_to_name || todo.owner_name || '-'}
                            </span>
                        </div>
                        <div className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                            {moment(todo.target_date).format("MMM DD")}
                            {/* {isOverdue && <ExclamationCircleOutlined className="ml-1" />} */}
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1">
                            {todo.attachments?.length > 0 && (
                                <Tooltip title={`${todo.attachments.length} attachments`}>
                                    <Tag size="small" icon={<PaperClipOutlined />} color="blue">
                                        {todo.attachments.length}
                                    </Tag>
                                </Tooltip>
                            )}
                            {todo.comments?.length > 0 && (
                                <Tooltip title={`${todo.comments.length} comments`}>
                                    <Tag size="small" icon={<CommentOutlined />} color="green">
                                        {todo.comments.length}
                                    </Tag>
                                </Tooltip>
                            )}
                            {todo.subscribers?.length > 0 && (
                                <Tooltip title={`${todo.subscribers.length} subscribers`}>
                                    <Tag size="small" icon={<TeamOutlined />} color="purple">
                                        {todo.subscribers.length}
                                    </Tag>
                                </Tooltip>
                            )}
                        </div>
                        <div className="flex items-center space-x-1">
                            <Button
                                type="text"
                                size="small"
                                icon={isSubscribed ? <BellOutlined /> : <UserAddOutlined />}
                                onClick={handleSubscribeToggle}
                                loading={subscribing}
                                className={`text-xs ${isSubscribed ? 'text-green-600' : 'text-gray-400'}`}
                                title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                            />
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

// Droppable Column Component
const DroppableColumn = ({ column, todos, allTodos, onStatusChange, onEdit, navigate, loading }) => {
    const [{ isOver }, drop] = useDrop({
        accept: 'task',
        drop: (item) => {
            if (item.status !== column.id) {
                onStatusChange(item.id, column.id);
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

    return (
        <div
            ref={drop}
            className={`kanban-column ${isOver ? 'drop-zone-active' : ''}`}
            style={{
                minWidth: '320px',
                width: '320px',
                flexShrink: 0,
                flexGrow: 0
            }}
        >
            <Card
                className="h-full"
                style={{ 
                    backgroundColor: '#f8f9fa',
                    minHeight: '600px',
                    border: `2px solid ${column.color}20`
                }}
            >
                {/* Column Header */}
                <div 
                    className="flex items-center justify-between mb-4 p-3 rounded-t-lg"
                    style={{ backgroundColor: column.color }}
                >
                    <div className="flex items-center space-x-2">
                        <span className="text-lg">{column.icon}</span>
                        <div>
                            <div className="text-white font-semibold text-sm">
                                {column.title}
                            </div>
                            <div className="text-white text-xs opacity-90">
                                {column.description}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Badge 
                            count={todos.length} 
                            style={{ 
                                backgroundColor: '#fff', 
                                color: column.color,
                                fontWeight: 'bold'
                            }} 
                        />
                        <Button
                            type="text"
                            size="small"
                            icon={<PlusOutlined />}
                            style={{ color: '#fff' }}
                            onClick={() => navigate('/todo/create', { state: { status: column.id } })}
                        />
                    </div>
                </div>

                {/* Column Content */}
                <div className="space-y-2 max-h-96 overflow-y-auto px-2">
                    {loading ? (
                        <div className="text-center text-gray-400 py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
                            <div className="text-sm">Loading...</div>
                        </div>
                    ) : todos.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                            <div className="text-2xl mb-2">{column.icon}</div>
                            <div className="text-sm">No tasks</div>
                            <div className="text-xs opacity-75">Drag tasks here or create new ones</div>
                        </div>
                    ) : (
                        todos.map(todo => (
                            <DraggableTaskCard
                                key={todo.id}
                                todo={todo}
                                onEdit={onEdit}
                                subtaskCount={allTodos.filter(t => t.parent_todo_id === todo.todo_id).length}
                            />
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
};

// Task Detail Drawer Component
export const TaskDetailDrawer = ({ todo, visible, onClose, onUpdate }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [attachments, setAttachments] = useState([]);

    useEffect(() => {
        if (todo) {
            setComments(todo.comments || []);
            setAttachments(todo.attachments || []);
        }
    }, [todo]);

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        try {
            const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(todo.id) }
            });
            
            const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
            const currentTodo = transformTodoFromBackend(currentTodoData);
            
            if (!currentTodo) {
                throw new Error("Todo not found");
            }

            const comments = currentTodo.comments || [];
            const newCommentObj = {
                comment: newComment
            };
            comments.push(newCommentObj);

            const backendData = transformTodoToBackend({
                ...currentTodo,
                comments: comments
            });

            await axios.put(`/update_todo_task/${todo.id}`, backendData);
            
            setComments([...comments, {
                id: Date.now(),
                text: newComment,
                user: "Current User",
                created_at: new Date().toISOString()
            }]);
            setNewComment("");
            message.success("Comment added successfully");
        } catch (error) {
            message.error("Failed to add comment");
        }
    };

    const handleFileUpload = async (file) => {
        try {
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('todo_id', todo.id);

                await axios.post(`/upload_todo_attachment/${todo.id}`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
            } catch (uploadError) {
                // If upload endpoint doesn't exist, update via main update endpoint
                const currentTodoResponse = await axios.get("/get_todo_task_by_id", {
                    params: { todo_id: parseInt(todo.id) }
                });
                
                const currentTodoData = currentTodoResponse.data?.data || currentTodoResponse.data;
                const currentTodo = transformTodoFromBackend(currentTodoData);
                
                if (!currentTodo) {
                    throw new Error("Todo not found");
                }

                const attachments = currentTodo.attachments || [];
                attachments.push({
                    name: file.name,
                    type: file.type || "document",
                    uploaded_at: new Date().toISOString()
                });

                const backendData = transformTodoToBackend({
                    ...currentTodo,
                    attachments: attachments
                });

                await axios.put(`/update_todo_task/${todo.id}`, backendData);
            }
            
            setAttachments([...attachments, {
                id: Date.now(),
                name: file.name,
                type: "document",
                uploaded_at: new Date().toISOString()
            }]);
            message.success("File uploaded successfully");
        } catch (error) {
            message.error("Failed to upload file");
        }
        return false; // Prevent default upload
    };

    if (!todo) return null;

    return (
        <Drawer
            title={
                <div>
                    <Text code>{todo.ref_no}</Text>
                    <div className="text-lg font-medium">{todo.title}</div>
                </div>
            }
            width={600}
            visible={visible}
            onClose={onClose}
            footer={
                <div className="flex justify-between">
                    <Button onClick={onClose}>Close</Button>
                    <Space>
                        <Button icon={<EditOutlined />}>Edit</Button>
                        <Button type="primary" icon={<PlusOutlined />}>Add Sub-task</Button>
                    </Space>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Basic Info */}
                <Card size="small" title="Basic Information">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Status:</span>
                            {(() => {
                                // todo.status is now an ID, get the name from statusReverseMapping
                                const statusName = statusReverseMapping[todo.status] || statusReverseMapping[todo.todo_status_id] || 'Unknown';
                                const config = statusColorsMapping[statusName] || { color: 'default', text: statusName };
                                return <Tag color={config.color}>{statusName}</Tag>;
                            })()}
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Priority:</span>
                            <Tag color={priorityColorsMapping[todo.priority]?.color || 'blue'}>
                                {priorityColorsMapping[todo.priority]?.text || 'Unknown'}
                            </Tag>
                        </div>
                        <div className="flex items-center justify-between">
                                            <span className="font-medium">Assign To:</span>
                                            <div className="flex items-center space-x-2">
                                                <Avatar size="small" icon={<UserOutlined />} />
                                                <span>{todo.assigned_to_name || '-'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">Owner:</span>
                                            <div className="flex items-center space-x-2">
                                                <Avatar size="small" icon={<UserOutlined />} />
                                                <span>{todo.owner_name || '-'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">Target Date:</span>
                                            <div className="flex items-center space-x-2">
                                                <CalendarOutlined />
                                                <span>{moment(todo.target_date).format("MMM DD, YYYY")}</span>
                                            </div>
                                        </div>
                        {/* <div className="flex items-center justify-between">
                            <span className="font-medium">Duration:</span>
                            <span>{todo.expected_duration_days} days</span>
                        </div> */}
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Created By:</span>
                            <div className="flex items-center space-x-2">
                                <Avatar size="small" icon={<UserOutlined />} />
                                <span>{todo.created_by_name}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Created Date:</span>
                            <div className="flex items-center space-x-2">
                                <CalendarOutlined />
                                <span>{moment(todo.created_at).format("MMM DD, YYYY")}</span>
                            </div>
                        </div>
                        {/* <div className="flex items-center justify-between">
                            <span className="font-medium">Assigned Date:</span>
                            <div className="flex items-center space-x-2">
                                <CalendarOutlined />
                                <span>{moment(todo.assigned_date).format("MMM DD, YYYY")}</span>
                            </div>
                        </div> */}
                    </div>
                </Card>

                {/* Description */}
                <Card size="small" title="Description">
                    <Text>{todo.description}</Text>
                </Card>

                {/* Metadata */}
                {/* {todo.metadata && (
                    <Card size="small" title="Metadata">
                        <div className="space-y-2">
                            {Object.entries(todo.metadata).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                    <span className="font-medium">{key}:</span>
                                    <span>{value}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                )} */}

                {/* References */}
                <ModuleLinksSection todo={todo} onUpdate={onUpdate} />

                {/* Key-Value Pairs */}
                {/* <KeyValuePairsSection todo={todo} onUpdate={onUpdate} /> */}

                {/* Attachments */}
                <Card size="small" title="Attachments">
                    <div className="space-y-3">
                        <Upload
                            beforeUpload={handleFileUpload}
                            showUploadList={false}
                        >
                            <Button icon={<PaperClipOutlined />}>Upload File</Button>
                        </Upload>
                        <List
                            size="small"
                            dataSource={attachments}
                            renderItem={attachment => (
                                <List.Item>
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center space-x-2">
                                            <PaperClipOutlined />
                                            <span>{attachment.name}</span>
                                            <Tag size="small">{attachment.type}</Tag>
                                        </div>
                                        <Button type="text" size="small">Download</Button>
                                    </div>
                                </List.Item>
                            )}
                        />
                    </div>
                </Card>

                {/* Comments */}
                <Card size="small" title="Comments">
                    <div className="space-y-3">
                        <div className="flex space-x-2">
                            <Input
                                placeholder="Add a comment..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onPressEnter={handleAddComment}
                            />
                            <Button type="primary" onClick={handleAddComment}>
                                Add
                            </Button>
                        </div>
                        <List
                            size="small"
                            dataSource={comments}
                            renderItem={comment => (
                                <List.Item>
                                    <div className="w-full">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium">{comment.user}</span>
                                            <span className="text-xs text-gray-500">
                                                {moment(comment.created_at).format("MMM DD, HH:mm")}
                                            </span>
                                        </div>
                                        <div className="text-sm">{comment.text}</div>
                                    </div>
                                </List.Item>
                            )}
                        />
                    </div>
                </Card>

                {/* Transaction History */}
                <TransactionHistorySection todo={todo} />
            </div>
        </Drawer>
    );
};

// Create/Edit Modal Component
export const CreateEditModal = ({ todo, visible, onClose, onSave }) => {
    const auth = useAuth();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        if (visible) {
            loadReferenceData();
        }
    }, [visible]);

    useEffect(() => {
        if (todo) {
            form.setFieldsValue({
                ...todo,
                target_date: todo.target_date ? moment(todo.target_date) : null
            });
        } else {
            form.resetFields();
        }
    }, [todo, form]);

    const loadReferenceData = async () => {
        try {
            const [statusesResponse, prioritiesResponse, departmentsResponse, employeesResponse] = await Promise.all([
                axios.get('/get_todo_statuses'),
                axios.get('/get_all_priorities'),
                axios.get('/get_all_departments'),
                axios.get('/get_employees')
            ]);
            
            const statusesData = statusesResponse.data?.data || statusesResponse.data || [];
            const prioritiesData = prioritiesResponse.data?.data || prioritiesResponse.data || [];
            const departmentsData = departmentsResponse.data?.data || departmentsResponse.data || [];
            const employeesData = employeesResponse.data?.data || employeesResponse.data || [];
            
            setStatuses(statusesData);
            setPriorities(prioritiesData);
            setDepartments(departmentsData);
            setEmployees(employeesData);
            
            // Build dynamic mappings from API data
            buildMappingsFromAPI(statusesData, prioritiesData);
        } catch (error) {
            console.error("Failed to load reference data:", error);
            message.error("Failed to load reference data");
        }
    };

    const handleSubmit = async (values) => {
        try {
            setLoading(true);
            const formData = {
                ...values,
                target_date: values.target_date?.format("YYYY-MM-DD"),
                created_by: auth.user?.employee_id,
                owner_id: values.owner_id || null,
                department_id: values.team_id || values.department_id || null
            };

            if (todo) {
                const backendData = transformTodoToBackend({
                    ...formData,
                    todo_id: parseInt(todo.id),
                    id: parseInt(todo.id)
                });
                
                await axios.put(`/update_todo_task/${parseInt(todo.id)}`, backendData);
                message.success("Task updated successfully");
            } else {
                const backendData = transformTodoToBackend(formData);
                // Remove todo_id for create operation
                delete backendData.todo_id;
                
                await axios.post("/create_todo_task", backendData);
                message.success("Task created successfully");
            }

            onSave?.();
            onClose();
        } catch (error) {
            message.error("Failed to save task");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={todo ? "Edit Task" : "Create New Task"}
            visible={visible}
            onCancel={onClose}
            footer={null}
            width={800}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
            >
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="title"
                            label="Title"
                            rules={[{ required: true, message: "Please enter task title" }]}
                        >
                            <Input placeholder="Enter task title" />
                        </Form.Item>
                    </Col>
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
                >
                    <TextArea rows={4} placeholder="Enter task description" />
                </Form.Item>

                <Row gutter={16}>
                    <Col span={8}>
                        <Form.Item
                            name="status"
                            label="Status"
                            rules={[{ required: true }]}
                        >
                            <Select>
                                {statuses.map(status => {
                                    const statusId = status.todo_status_id || status.id;
                                    const statusName = status.todo_status_name || status.name;
                                    return (
                                        <Option key={statusId} value={statusId}>
                                            {statusName}
                                        </Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item
                            name="priority"
                            label="Priority"
                            rules={[{ required: true }]}
                        >
                            <Select>
                                {priorities.map(priority => (
                                    <Option key={priority.priority_id ?? priority.id} value={priority.priority_id ?? priority.id}>
                                        {priority.priority_name || priority.name}
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
                                            <Select>
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
                            <DatePicker style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="expected_duration_days"
                            label="Expected Duration (Days)"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col span={8}>
                        <Form.Item
                            name="assigned_to_id"
                            label="Assign To"
                        >
                            <Select placeholder="Select assignee" showSearch optionFilterProp="children">
                                {employees.map(emp => (
                                    <Option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                                        {emp.employee_name || emp.name}
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
                            <Select placeholder="Select owner" showSearch optionFilterProp="children">
                                {employees.map(emp => (
                                    <Option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                                        {emp.employee_name || emp.name}
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
                            <Select placeholder="Select team" showSearch optionFilterProp="children">
                                {departments.map(dept => (
                                    <Option key={dept.department_id || dept.id} value={dept.department_id || dept.id}>
                                        {dept.department_name || dept.name}
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item
                    name="is_private"
                    label="Private Task"
                    valuePropName="checked"
                >
                    <Switch />
                </Form.Item>

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

                <Divider>References (Optional)</Divider>
                
                <Form.List name="links">
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <Card key={key} size="small" className="mb-2 relative">
                                    <Row gutter={16}>
                                        <Col span={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'module_name']}
                                                label="Label"
                                                rules={[{ required: true, message: 'Enter a label' }]}
                                            >
                                                <Input placeholder="JIRA" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'module_id']}
                                                label="Record ID"
                                            >
                                                <Input placeholder="123" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'module_ref']}
                                                label="Reference"
                                                rules={[{ required: true, message: 'Enter reference' }]}
                                            >
                                                <Input placeholder="ABC-123" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={16}>
                                        <Col span={16}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'title']}
                                                label="Title"
                                                rules={[{ required: true, message: 'Enter title' }]}
                                            >
                                                <Input placeholder="Brief description" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'url']}
                                                label="Web address"
                                            >
                                                <Input placeholder="https://..." />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => remove(name)}
                                        className="absolute top-2 right-2"
                                    >
                                        Remove
                                    </Button>
                                </Card>
                            ))}
                            <Form.Item>
                                <Button
                                    type="dashed"
                                    onClick={() => add()}
                                    block
                                    icon={<PlusOutlined />}
                                >
                                    Add Reference
                                </Button>
                            </Form.Item>
                        </>
                    )}
                </Form.List>

                <div className="flex justify-end space-x-2">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" htmlType="submit" loading={loading}>
                        {todo ? "Update" : "Create"}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

// Main ToDo Module Component
export default function ToDoModule({ selectedClient = {}, permissions = {} }) {
    const [searchParams] = useSearchParams();
    const [activeView, setActiveView] = useState("dashboard");

    useEffect(() => {
        // Check URL parameters to set initial view
        const viewParam = searchParams.get('view');
        if (viewParam && ['dashboard', 'list', 'kanban'].includes(viewParam)) {
            setActiveView(viewParam);
        }
    }, [searchParams]);

    const renderView = () => {
        switch (activeView) {
            case "dashboard":
                return <MyTasksLanding permissions={permissions} />;
            case "list":
                return <TaskListView permissions={permissions} />;
            case "kanban":
                return <KanbanBoard permissions={permissions} />;
            default:
                return <MyTasksLanding permissions={permissions} />;
        }
    };

    return (
        <div>
            <div className="tdl-module-header">
                <span className="tdl-module-title">Todos &amp; Actions</span>
                <Segmented
                    value={activeView}
                    onChange={setActiveView}
                    options={[
                        { label: "Dashboard", value: "dashboard", icon: <MdDashboard /> },
                        { label: "List", value: "list", icon: <MdList /> },
                        { label: "Kanban", value: "kanban", icon: <MdViewKanban /> },
                    ]}
                />
            </div>
            {renderView()}
        </div>
    );
}