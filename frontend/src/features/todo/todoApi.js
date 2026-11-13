import axios from "axios";

// Status mapping: Frontend string -> Backend ID
// Note: These IDs may need to be fetched from the backend or adjusted based on actual database values
const statusMapping = {
    "New": 1,
    "Assigned": 2,
    "In Progress": 3,
    "Blocked": 4,
    "Resolved": 5,
    "Closed": 6
};

// Reverse mapping: Backend ID -> Frontend string
const statusReverseMapping = {
    1: "New",
    2: "Assigned",
    3: "In Progress",
    4: "Blocked",
    5: "Resolved",
    6: "Closed"
};

// Transform backend todo to frontend format
const transformTodoFromBackend = (backendTodo) => {
    if (!backendTodo) return null;
    
    return {
        id: backendTodo.todo_id,
        todo_id: backendTodo.todo_id,
        parent_todo_id: backendTodo.parent_todo_id || null,
        parent_title: backendTodo.parent_title || null,
        parent_assigned_to_name: backendTodo.parent_assigned_to_name || null,
        ref_no: backendTodo.ref_no || `TD-${backendTodo.todo_id}`,
        title: backendTodo.title,
        description: backendTodo.description || "",
        status: backendTodo.todo_status_name || statusReverseMapping[backendTodo.todo_status_id] || "New",
        priority: backendTodo.todo_priority_id ?? 3,
        term_type: backendTodo.term_type || "",
        target_date: backendTodo.target_date || null,
        expected_duration_days: backendTodo.expected_duration_days || 0,
        owner_id: backendTodo.owner_id || null,
        owner_name: backendTodo.owner_name || "",
        assigned_to_id: backendTodo.assigned_to_id || null,
        assigned_to_name: backendTodo.assigned_to_name || "",
        team_id: backendTodo.department_id || null,
        department_id: backendTodo.department_id || null,
        team_name: backendTodo.department_name || "",
        created_by: backendTodo.created_by || null,
        created_by_name: backendTodo.created_by_name || "",
        created_at: backendTodo.created_at || backendTodo.created_time || null,
        assigned_date: backendTodo.assigned_date || null,
        updated_at: backendTodo.updated_at || new Date().toISOString(),
        is_private: backendTodo.is_private || 0,
        visibility_scope: backendTodo.visibility_scope || "Organization",
        attachments: backendTodo.attachments || [],
        comments: backendTodo.comments || [],
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
        todo_status_id: typeof frontendTodo.status === 'string' 
            ? statusMapping[frontendTodo.status] || 1
            : frontendTodo.todo_status_id || frontendTodo.status || 1,
        todo_priority_id: frontendTodo.priority ?? frontendTodo.todo_priority_id ?? 3,
        term_type: frontendTodo.term_type || null,
        target_date: frontendTodo.target_date || null,
        owner_id: frontendTodo.owner_id || null,
        department_id: frontendTodo.department_id || frontendTodo.team_id || null,
        assigned_date: frontendTodo.assigned_date || null,
        is_private: frontendTodo.is_private || 0,
        assigned_to_id: frontendTodo.assigned_to_id || null,
        parent_todo_id: frontendTodo.parent_todo_id || null,
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

export const todoApi = {
    // Get all todos with pagination
    getTodos: async (filters = {}, page = 1, pageSize = 10) => {
        try {
            const params = {
                page: page,
                apply_limit: true,
                page_multiplier: pageSize
            };

            // POST request with filters in body and pagination in params
            const response = await axios.post("/todo_tasks", filters, { params });
            
            // Transform the response data
            // Backend may return data in response.data.data or response.data
            const responseData = response.data?.data || response.data;
            const todos = Array.isArray(responseData) 
                ? transformTodosFromBackend(responseData)
                : transformTodosFromBackend(responseData?.todos || []);
            
            return {
                data: todos,
                total: response.data?.total_count || response.data?.total || todos.length,
                page: response.data?.page || page,
                pageSize: response.data?.page_size || pageSize
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to fetch todos");
            throw error;
        }
    },

    // Get a single todo by ID
    getTodo: async (id) => {
        try {
            const response = await axios.get("/get_todo_task_by_id", {
                params: { todo_id: parseInt(id) }
            });
            
            // Backend may return data in response.data.data or response.data
            const todoData = response.data?.data || response.data;
            
            return {
                data: transformTodoFromBackend(todoData)
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to fetch todo");
            throw error;
        }
    },

    // Create a new todo
    createTodo: async (todoData) => {
        try {
            const backendData = transformTodoToBackend(todoData);
            // Remove todo_id for create operation
            delete backendData.todo_id;
            
            const response = await axios.post("/create_todo_task", backendData);
            
            // Backend may return data in response.data.data or response.data
            const responseTodoData = response.data?.data || response.data;
            
            return {
                data: transformTodoFromBackend(responseTodoData)
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to create todo");
            throw error;
        }
    },

    // Update an existing todo
    updateTodo: async (id, todoData) => {
        try {
            const backendData = transformTodoToBackend({
                ...todoData,
                todo_id: parseInt(id),
                id: parseInt(id)
            });
            
            const response = await axios.put(`/update_todo_task/${parseInt(id)}`, backendData);
            
            // Backend may return data in response.data.data or response.data
            const responseTodoData = response.data?.data || response.data;
            
            return {
                data: transformTodoFromBackend(responseTodoData)
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to update todo");
            throw error;
        }
    },

    // Change status of a todo
    changeStatus: async (id, newStatus) => {
        try {
            // Get current todo first
            const currentTodo = await todoApi.getTodo(id);
            if (!currentTodo.data) {
                throw new Error("Todo not found");
            }

            // Update with new status
            const backendData = transformTodoToBackend({
                ...currentTodo.data,
                status: newStatus
            });

            const response = await axios.put(`/update_todo_task/${id}`, backendData);
            
            return {
                success: true,
                data: transformTodoFromBackend(response.data?.data || response.data)
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to update status");
            throw error;
        }
    },

    // Delete a todo (if endpoint exists)
    deleteTodo: async (id) => {
        try {
            // Note: If there's a delete endpoint, use it here
            // For now, assuming it might be a PUT with a deleted flag or a DELETE endpoint
            const response = await axios.delete(`/delete_todo_task/${id}`);
            
            return {
                success: true
            };
        } catch (error) {
            // If DELETE doesn't exist, try updating with a deleted status
            try {
                await todoApi.changeStatus(id, "Closed");
                return { success: true };
            } catch (updateError) {
                error.handleGlobally && error.handleGlobally("Failed to delete todo");
                throw error;
            }
        }
    },

    // Add comment to a todo
    addComment: async (id, commentText) => {
        try {
            const currentTodo = await todoApi.getTodo(id);
            if (!currentTodo.data) {
                throw new Error("Todo not found");
            }

            const comments = currentTodo.data.comments || [];
            const newComment = {
                comment: commentText
            };
            comments.push(newComment);

            const backendData = transformTodoToBackend({
                ...currentTodo.data,
                comments: comments
            });

            const response = await axios.put(`/update_todo_task/${id}`, backendData);
            
            return {
                success: true,
                data: newComment
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to add comment");
            throw error;
        }
    },

    // Upload attachment (if endpoint exists)
    uploadAttachment: async (id, file) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('todo_id', id);

            const response = await axios.post(`/upload_todo_attachment/${id}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            return {
                success: true,
                data: response.data?.data || response.data
            };
        } catch (error) {
            // If upload endpoint doesn't exist, update via main update endpoint
            try {
                const currentTodo = await todoApi.getTodo(id);
                if (!currentTodo.data) {
                    throw new Error("Todo not found");
                }

                const attachments = currentTodo.data.attachments || [];
                attachments.push({
                    name: file.name,
                    type: file.type || "document",
                    uploaded_at: new Date().toISOString()
                });

                const backendData = transformTodoToBackend({
                    ...currentTodo.data,
                    attachments: attachments
                });

                await axios.put(`/update_todo_task/${id}`, backendData);
                
                return {
                    success: true,
                    data: attachments[attachments.length - 1]
                };
            } catch (updateError) {
                error.handleGlobally && error.handleGlobally("Failed to upload attachment");
                throw error;
            }
        }
    },

    // Subscribe to todo
    subscribeToTodo: async (id, subscriberId = null) => {
        try {
            const currentTodo = await todoApi.getTodo(id);
            if (!currentTodo.data) {
                throw new Error("Todo not found");
            }

            const subscribers = currentTodo.data.subscribers || [];
            
            // Check if already subscribed
            const isAlreadySubscribed = subscribers.some(
                s => s.subscriber_id === subscriberId || s.user_id === subscriberId
            );

            if (isAlreadySubscribed) {
                return {
                    success: false,
                    message: "Already subscribed to this task"
                };
            }

            subscribers.push({
                subscriber_id: subscriberId
            });

            const backendData = transformTodoToBackend({
                ...currentTodo.data,
                subscribers: subscribers
            });

            const response = await axios.put(`/update_todo_task/${id}`, backendData);
            
            return {
                success: true,
                data: subscribers[subscribers.length - 1]
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to subscribe");
            throw error;
        }
    },

    // Unsubscribe from todo
    unsubscribeFromTodo: async (id, subscriberId = null) => {
        try {
            const currentTodo = await todoApi.getTodo(id);
            if (!currentTodo.data) {
                throw new Error("Todo not found");
            }

            const subscribers = (currentTodo.data.subscribers || []).filter(
                s => s.subscriber_id !== subscriberId && s.user_id !== subscriberId
            );

            const backendData = transformTodoToBackend({
                ...currentTodo.data,
                subscribers: subscribers
            });

            const response = await axios.put(`/update_todo_task/${id}`, backendData);
            
            return {
                success: true,
                message: "Successfully unsubscribed"
            };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to unsubscribe");
            throw error;
        }
    },

    // Check if user is subscribed
    isSubscribed: async (id, subscriberId = null) => {
        try {
            const currentTodo = await todoApi.getTodo(id);
            if (!currentTodo.data) {
                return { success: false, data: false };
            }

            const subscribers = currentTodo.data.subscribers || [];
            const isSubscribed = subscribers.some(
                s => s.subscriber_id === subscriberId || s.user_id === subscriberId
            );

            return {
                success: true,
                data: isSubscribed
            };
        } catch (error) {
            return { success: false, data: false };
        }
    },

    // "My Tasks" landing page — Assigned to me / Assigned by me / I own / Team / My employees / All.
    // view_as_user_id and the "all" tab are admin-only; the server checks the role itself.
    getMyTasks: async (tab = "assigned_to_me", viewAsUserId = null) => {
        try {
            const response = await axios.get("/get_my_tasks", {
                params: { tab, view_as_user_id: viewAsUserId || undefined },
            });
            const data = response.data?.data || response.data || {};
            return {
                data: {
                    overdue: transformTodosFromBackend(data.overdue || []),
                    due_this_week: transformTodosFromBackend(data.due_this_week || []),
                    later: transformTodosFromBackend(data.later || []),
                    no_due_date: transformTodosFromBackend(data.no_due_date || []),
                    completed_today: transformTodosFromBackend(data.completed_today || []),
                    audit: data.audit || [],
                }
            };
        } catch (error) {
            return { data: { overdue: [], due_this_week: [], later: [], no_due_date: [], completed_today: [], audit: [] } };
        }
    },

    // Tile counts for the My Actions summary row.
    getMyTasksCounts: async () => {
        try {
            const response = await axios.get("/get_my_tasks_counts");
            return response.data?.data || {};
        } catch (error) {
            return {};
        }
    },

    // Full-todo subtask create — same payload shape as createTodo, plus parent_todo_id.
    addSubtask: async (parentTodoId, todoData) => {
        try {
            const backendData = transformTodoToBackend(todoData);
            delete backendData.todo_id;
            backendData.parent_todo_id = parentTodoId;
            // Keep "no priority" empty so the server picks its default, not the shared fallback of 3
            backendData.todo_priority_id = todoData.todo_priority_id ?? null;

            const response = await axios.post("/create_todo_task", backendData);
            const responseTodoData = response.data?.data || response.data;
            return { data: transformTodoFromBackend(responseTodoData) };
        } catch (error) {
            error.handleGlobally && error.handleGlobally("Failed to create subtask");
            throw error;
        }
    },

    // Fetch subtasks of a given parent (empty list on failure).
    getSubtasks: async (parentTodoId) => {
        try {
            const response = await axios.get("/get_todo_subtasks", { params: { parent_todo_id: parentTodoId } });
            const data = response.data?.data || response.data || [];
            return { data: transformTodosFromBackend(Array.isArray(data) ? data : []) };
        } catch (error) {
            return { data: [] };
        }
    },

    // Free-text tags (Select mode="tags") on a task or subtask.
    setTags: async (todoId, tags = []) => {
        try {
            await axios.post("/set_todo_tags", { todo_id: todoId, tags });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }
};

export default todoApi;

