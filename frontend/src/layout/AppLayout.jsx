import { useState } from "react";
import { Button, Layout, Menu, Space, Typography } from "antd";
import { BellOutlined, CheckSquareOutlined, LogoutOutlined, ProfileOutlined } from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Notifications from "../features/notifications/Notifications";

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
    const auth = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);

    const items = [
        { key: "/", icon: <CheckSquareOutlined />, label: "My Tasks" },
        { key: "/todo", icon: <ProfileOutlined />, label: "To-Do" },
    ];
    if (auth.getPermissions("NOTIFICATIONS").view) {
        items.push({ key: "/notification-settings", icon: <BellOutlined />, label: "Notification Settings" });
    }

    // Highlight the menu entry whose path the current URL starts with ("/" only matches exactly)
    let selectedKey = "/";
    if (location.pathname.startsWith("/todo")) selectedKey = "/todo";
    if (location.pathname.startsWith("/notification-settings")) selectedKey = "/notification-settings";

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light">
                <div className="nf-brand">{collapsed ? "NF" : "NotifyFlow"}</div>
                <Menu mode="inline" selectedKeys={[selectedKey]} items={items} onClick={(info) => navigate(info.key)} />
            </Sider>
            <Layout>
                <Header className="nf-header">
                    <Space size="large">
                        <Notifications />
                        <Typography.Text>
                            {auth.user?.name} ({auth.user?.role})
                        </Typography.Text>
                        <Button icon={<LogoutOutlined />} onClick={auth.logout}>
                            Logout
                        </Button>
                    </Space>
                </Header>
                <Content className="nf-content">
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
}
