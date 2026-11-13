import { useState } from "react";
import { Button, Card, Form, Input, message } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Login() {
    const auth = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(false);

    if (auth.isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    const onFinish = async (values) => {
        setLoading(true);
        try {
            await auth.login(values.email, values.password);
            const target = location.state?.from || "/";
            navigate(target, { replace: true });
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (typeof detail === "string") {
                message.error(detail);
            } else {
                message.error("Could not sign in");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="nf-login-wrap">
            <Card className="nf-login-card">
                <div className="nf-login-title">NotifyFlow</div>
                <div className="nf-login-subtitle">Tasks and rule-based notifications</div>
                <Form layout="vertical" onFinish={onFinish}>
                    <Form.Item name="email" label="Email" rules={[{ required: true, message: "Enter your email" }]}>
                        <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true, message: "Enter your password" }]}>
                        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                        Sign in
                    </Button>
                </Form>
            </Card>
        </div>
    );
}
