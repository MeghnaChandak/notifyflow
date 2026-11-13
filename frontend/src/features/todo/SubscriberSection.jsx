import React, { useState, useEffect } from "react";
import {
    Button,
    Card,
    List,
    Avatar,
    Tag,
    Space,
    Modal,
    Form,
    Input,
    Select,
    Switch,
    message,
    Popconfirm,
    Tooltip,
    Badge,
    Divider,
} from "antd";
import {
    UserAddOutlined,
    UserDeleteOutlined,
    BellOutlined,
    MailOutlined,
    NotificationOutlined,
    TeamOutlined,
} from "@ant-design/icons";
import axios from 'axios';
import { useAuth } from '../../auth/AuthContext';

const { Option } = Select;

// Subscriber Section Component
export const SubscriberSection = ({ todo, onUpdate }) => {
    const auth = useAuth();
    const currentUserId = auth.user?.employee_id;
    const [subscribers, setSubscribers] = useState([]);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [addSubscriberVisible, setAddSubscriberVisible] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [form] = Form.useForm();

    useEffect(() => {
        if (todo) {
            loadInitialData();
        }
    }, [todo?.id, todo?.todo_id, todo?.subscribers]);

    const loadInitialData = async () => {
        try {
            // Load employees and subscribers in parallel
            const employeesResponse = await axios.get('/get_employees');
            setEmployees(employeesResponse.data?.data || employeesResponse.data || []);
            
            await loadSubscribers();
            await checkSubscriptionStatus();
        } catch (error) {
            console.error("Failed to load initial data:", error);
            message.error("Failed to load employees data");
        }
    };

    const loadSubscribers = async () => {
        try {
            // Subscribers are loaded from todo data in ToDoEditPage
            // Just set them from the todo prop
            if (todo && todo.subscribers) {
                setSubscribers(todo.subscribers);
            } else {
                setSubscribers([]);
            }
        } catch (error) {
            console.error("Failed to load subscribers:", error);
            setSubscribers([]);
        }
    };

    const checkSubscriptionStatus = async () => {
        try {
            // Check if the signed-in user is in the subscribers list
            if (todo && todo.subscribers) {
                const isSubscribed = todo.subscribers.some(
                    sub => (sub.subscriber_id === currentUserId || sub.user_id === currentUserId || sub.employee_id === currentUserId)
                );
                setIsSubscribed(isSubscribed);
            } else {
                setIsSubscribed(false);
            }
        } catch (error) {
            console.error("Failed to check subscription status:", error);
            setIsSubscribed(false);
        }
    };

    const handleSubscribe = async () => {
        try {
            setLoading(true);
            
            const response = await axios.post('/add_subscribers', {
                todo_id: parseInt(todo.todo_id || todo.id),
                subscriber_id: currentUserId
            });
            
            if (response.data?.success || response.status === 200) {
                setIsSubscribed(true);
                message.success("Successfully subscribed to this task");
                if (onUpdate) onUpdate(); // This will reload the todo and update subscribers
            } else {
                message.warning(response.data?.message || "Failed to subscribe");
            }
        } catch (error) {
            console.error("Failed to subscribe:", error);
            message.error(error.response?.data?.message || "Failed to subscribe");
        } finally {
            setLoading(false);
        }
    };

    const handleUnsubscribe = async () => {
        try {
            setLoading(true);
            
            const response = await axios.post('/remove_subscribers', {
                todo_id: parseInt(todo.todo_id || todo.id),
                subscriber_id: currentUserId
            });
            
            if (response.data?.success || response.status === 200) {
                setIsSubscribed(false);
                message.success("Successfully unsubscribed from this task");
                if (onUpdate) onUpdate(); // This will reload the todo and update subscribers
            } else {
                message.warning(response.data?.message || "Failed to unsubscribe");
            }
        } catch (error) {
            console.error("Failed to unsubscribe:", error);
            message.error(error.response?.data?.message || "Failed to unsubscribe");
        } finally {
            setLoading(false);
        }
    };

    const handleAddSubscriber = async (values) => {
        try {
            setLoading(true);
            
            const response = await axios.post('/add_subscribers', {
                todo_id: parseInt(todo.todo_id || todo.id),
                subscriber_id: values.user_id
            });
            
            if (response.data?.success || response.status === 200) {
                message.success("User subscribed successfully");
                setAddSubscriberVisible(false);
                form.resetFields();
                if (onUpdate) onUpdate(); // This will reload the todo and update subscribers
            } else {
                message.warning(response.data?.message || "Failed to add subscriber");
            }
        } catch (error) {
            console.error("Failed to add subscriber:", error);
            message.error(error.response?.data?.message || "Failed to add subscriber");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveSubscriber = async (subscriberId) => {
        try {
            setLoading(true);
            
            const response = await axios.post('/remove_subscribers', {
                todo_id: parseInt(todo.todo_id || todo.id),
                subscriber_id: subscriberId
            });
            
            if (response.data?.success || response.status === 200) {
                message.success("User unsubscribed successfully");
                if (onUpdate) onUpdate(); // This will reload the todo and update subscribers
            } else {
                message.warning(response.data?.message || "Failed to remove subscriber");
            }
        } catch (error) {
            console.error("Failed to remove subscriber:", error);
            message.error(error.response?.data?.message || "Failed to remove subscriber");
        } finally {
            setLoading(false);
        }
    };

    // const getNotificationIcon = (preferences) => {
    //     if (!preferences) {
    //         return <BellOutlined style={{ color: '#d9d9d9' }} />;
    //     }
        
    //     if (preferences.email && preferences.push) {
    //         return <BellOutlined style={{ color: '#52c41a' }} />;
    //     } else if (preferences.email) {
    //         return <MailOutlined style={{ color: '#1890ff' }} />;
    //     } else if (preferences.push) {
    //         return <NotificationOutlined style={{ color: '#faad14' }} />;
    //     }
    //     return <BellOutlined style={{ color: '#d9d9d9' }} />;
    // };

    return (
        <Card 
            title={
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <TeamOutlined />
                        <span>Subscribers</span>
                        <Badge count={subscribers.length} />
                    </div>
                    <Space>
                        {isSubscribed ? (
                            <Popconfirm
                                title="Unsubscribe from this task?"
                                // description="You will no longer receive notifications about this task."
                                onConfirm={handleUnsubscribe}
                                okText="Yes, Unsubscribe"
                                cancelText="Cancel"
                            >
                                <Button 
                                    type="default" 
                                    danger
                                    icon={<UserDeleteOutlined />}
                                    loading={loading}
                                >
                                    Unsubscribe
                                </Button>
                            </Popconfirm>
                        ) : (
                            <Button 
                                type="primary" 
                                icon={<UserAddOutlined />}
                                onClick={handleSubscribe}
                                loading={loading}
                            >
                                Subscribe
                            </Button>
                        )}
                        <Button 
                            type="dashed" 
                            icon={<UserAddOutlined />}
                            onClick={() => setAddSubscriberVisible(true)}
                        >
                            Add Subscriber
                        </Button>
                    </Space>
                </div>
            }
        >
            {/* Current User Subscription Status */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Avatar size="small" icon={<UserAddOutlined />} />
                        <span className="font-medium">Your Subscription Status</span>
                    </div>
                    <Tag color={isSubscribed ? 'green' : 'default'}>
                        {isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                    </Tag>
                </div>
                {/* <div className="text-sm text-gray-500 mt-1">
                    {isSubscribed 
                        ? 'You will receive notifications for comments and status changes'
                        : 'Subscribe to receive notifications about this task'
                    }
                </div> */}
            </div>

            <Divider />

            {/* Subscribers List */}
            <div className="space-y-3">
                {subscribers.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        <TeamOutlined className="text-4xl mb-2" />
                        <div>No subscribers yet</div>
                        <div className="text-sm">Be the first to subscribe to this task</div>
                    </div>
                ) : (
                    <List
                        dataSource={subscribers}
                        renderItem={subscriber => {
                            const subscriberId = subscriber.subscriber_id || subscriber.user_id || subscriber.employee_id;
                            // Look up employee name from employees list
                            const employee = employees.find(emp => 
                                (emp.employee_id || emp.id) === subscriberId
                            );
                            const subscriberName = subscriber.employee_name || subscriber.user_name || subscriber.name || 
                                employee?.employee_name || employee?.name || `User ${subscriberId}`;
                            
                            return (
                                <List.Item
                                    actions={[
                                        // <Tooltip title="Notification Settings">
                                        //     {getNotificationIcon(subscriber.notification_preferences)}
                                        // </Tooltip>,
                                        <Popconfirm
                                            title="Remove subscriber?"
                                            // description="This user will no longer receive notifications."   
                                            onConfirm={() => handleRemoveSubscriber(subscriberId)}
                                            okText="Remove"
                                            cancelText="Cancel"
                                        >
                                            <Button 
                                                type="text" 
                                                danger 
                                                size="small"
                                                icon={<UserDeleteOutlined />}
                                            />
                                        </Popconfirm>
                                    ]}
                                >
                                    <List.Item.Meta
                                        avatar={<Avatar icon={<UserAddOutlined />} />}
                                        title={
                                            <div className="flex items-center space-x-2">
                                                <span>{subscriberName}</span>
                                                {subscriberId === 1 && (
                                                    <Tag size="small" color="blue">You</Tag>
                                                )}
                                            </div>
                                        }
                                        description={
                                            <div className="space-y-1">
                                                {subscriber.subscribed_at && (
                                                    <div className="text-sm text-gray-500">
                                                        Subscribed: {new Date(subscriber.subscribed_at).toLocaleDateString()}
                                                    </div>
                                                )}
                                                {/* {subscriber.notification_preferences && (
                                                    <div className="flex items-center space-x-4 text-xs">
                                                        <span className={subscriber.notification_preferences?.email ? 'text-green-600' : 'text-gray-400'}>
                                                            📧 Email
                                                        </span>
                                                        <span className={subscriber.notification_preferences?.push ? 'text-green-600' : 'text-gray-400'}>
                                                            🔔 Push
                                                        </span>
                                                        <span className={subscriber.notification_preferences?.comments ? 'text-green-600' : 'text-gray-400'}>
                                                            💬 Comments
                                                        </span>
                                                        <span className={subscriber.notification_preferences?.status_changes ? 'text-green-600' : 'text-gray-400'}>
                                                            🔄 Status Changes
                                                        </span>
                                                    </div>
                                                )} */}
                                            </div>
                                        }
                                    />
                                </List.Item>
                            );
                        }}
                    />
                )}
            </div>

            {/* Add Subscriber Modal */}
            <Modal
                title="Add Subscriber"
                open={addSubscriberVisible}
                onCancel={() => {
                    setAddSubscriberVisible(false);
                    form.resetFields();
                }}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAddSubscriber}
                >
                    <Form.Item
                        name="user_id"
                        label="Select User"
                        rules={[{ required: true, message: 'Please select a user' }]}
                    >
                        <Select placeholder="Choose a user to subscribe" showSearch optionFilterProp="children">
                            {employees.map(emp => (
                                <Option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                                    {emp.employee_name || emp.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {/* <Form.Item
                        name="notification_preferences"
                        label="Notification Preferences"
                        initialValue={{
                            email: true,
                            push: true,
                            comments: true,
                            status_changes: true
                        }}
                    >
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span>Email Notifications</span>
                                <Form.Item name={['notification_preferences', 'email']} valuePropName="checked" noStyle>
                                    <Switch />
                                </Form.Item>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Push Notifications</span>
                                <Form.Item name={['notification_preferences', 'push']} valuePropName="checked" noStyle>
                                    <Switch />
                                </Form.Item>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Comment Notifications</span>
                                <Form.Item name={['notification_preferences', 'comments']} valuePropName="checked" noStyle>
                                    <Switch />
                                </Form.Item>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Status Change Notifications</span>
                                <Form.Item name={['notification_preferences', 'status_changes']} valuePropName="checked" noStyle>
                                    <Switch />
                                </Form.Item>
                            </div>
                        </div>
                    </Form.Item> */}

                    <Form.Item className="mb-0">
                        <div className="flex justify-end space-x-2">
                            <Button onClick={() => setAddSubscriberVisible(false)}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit" loading={loading}>
                                Add Subscriber
                            </Button>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default SubscriberSection;