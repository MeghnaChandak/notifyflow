import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Empty, List, Popover, notification } from "antd";
import { BellOutlined } from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { connectSocket, disconnectSocket, socket } from "../../socket";

const PAGE_LIMIT = 30;

// Where a notification points to. Only To-Do records exist in NotifyFlow.
function recordPath(item) {
    if (item.module_code === "TODO" && item.module_key) {
        return `/todo/edit/${item.module_key}`;
    }
    return null;
}

// Bell in the header: the inbox of the signed-in user. The list comes from GET /inbox and new items
// arrive live on the socket event "inbox-notification".
export default function Notifications() {
    const navigate = useNavigate();
    const [api, contextHolder] = notification.useNotification();
    const [items, setItems] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadInbox = useCallback(() => {
        setLoading(true);
        axios
            .get("/inbox", { params: { limit: PAGE_LIMIT, unread_only: false } })
            .then((res) => {
                setItems(res.data.data || []);
                setUnreadCount(res.data.unread_count || 0);
            })
            .catch((err) => err?.handleGlobally?.("Notifications"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        loadInbox();
    }, [loadInbox]);

    useEffect(() => {
        connectSocket();

        const onInboxNotification = (data) => {
            const item = {
                inbox_id: data.inbox_id,
                title: data.title,
                message: data.message,
                module_code: data.module_code,
                module_key: data.module_key,
                is_read: 0,
                created_time: data.created_time,
            };
            setItems((prev) => [item, ...prev.filter((old) => old.inbox_id !== item.inbox_id)].slice(0, PAGE_LIMIT));
            setUnreadCount((prev) => prev + 1);
            api.info({ message: item.title, description: item.message, placement: "topRight" });
        };

        socket.on("inbox-notification", onInboxNotification);
        return () => {
            socket.off("inbox-notification", onInboxNotification);
            disconnectSocket();
        };
    }, []);

    const markRead = (item) => {
        if (item.is_read) return;
        axios
            .post("/inbox/mark_read", { inbox_ids: [item.inbox_id] })
            .then(() => {
                setItems((prev) => prev.map((old) => (old.inbox_id === item.inbox_id ? { ...old, is_read: 1 } : old)));
                setUnreadCount((prev) => Math.max(prev - 1, 0));
            })
            .catch((err) => err?.handleGlobally?.("Mark notification read"));
    };

    const markAllRead = () => {
        axios
            .post("/inbox/mark_all_read")
            .then(() => {
                setItems((prev) => prev.map((old) => ({ ...old, is_read: 1 })));
                setUnreadCount(0);
            })
            .catch((err) => err?.handleGlobally?.("Mark all notifications read"));
    };

    const openItem = (item) => {
        markRead(item);
        const path = recordPath(item);
        if (path) {
            setOpen(false);
            navigate(path);
        }
    };

    const handleOpenChange = (nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
            loadInbox();
        }
    };

    const content = (
        <div style={{ width: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong>Notifications</strong>
                <Button size="small" onClick={markAllRead} disabled={unreadCount === 0}>
                    Mark all read
                </Button>
            </div>
            {items.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications" />
            ) : (
                <List
                    size="small"
                    loading={loading}
                    style={{ maxHeight: 360, overflowY: "auto" }}
                    dataSource={items}
                    renderItem={(item) => (
                        <List.Item
                            key={item.inbox_id}
                            onClick={() => openItem(item)}
                            style={{ cursor: "pointer", background: item.is_read ? undefined : "#e6f4ff" }}
                        >
                            <List.Item.Meta
                                title={<span style={{ fontWeight: item.is_read ? 400 : 600 }}>{item.title}</span>}
                                description={
                                    <div>
                                        <div>{item.message}</div>
                                        <div style={{ color: "#888", fontSize: 12 }}>{moment(item.created_time).format("Do MMM, h:mm a")}</div>
                                    </div>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}
        </div>
    );

    return (
        <div>
            {contextHolder}
            <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={handleOpenChange}>
                <Badge count={unreadCount} size="small" overflowCount={99}>
                    <BellOutlined style={{ fontSize: 22, cursor: "pointer" }} />
                </Badge>
            </Popover>
        </div>
    );
}
