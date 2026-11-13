import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Login from "./auth/Login";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import MyTasksLanding from "./features/todo/MyTasksLanding";
import ToDoModule from "./features/todo/ToDoModule";
import ToDoEditPage from "./features/todo/ToDoEditPage";
import ToDoCreatePage from "./features/todo/ToDoCreatePage";
import NotificationSettings from "./features/notification-settings/NotificationSettings";

export default function App() {
    const auth = useAuth();
    const todoPermissions = auth.getPermissions("TODO");
    const notificationPermissions = auth.getPermissions("NOTIFICATIONS");

    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<MyTasksLanding permissions={todoPermissions} />} />
                <Route path="todo" element={<ToDoModule permissions={todoPermissions} />} />
                <Route path="todo/edit/:id" element={<ToDoEditPage />} />
                <Route path="todo/create" element={<ToDoCreatePage />} />
                <Route
                    path="notification-settings"
                    element={
                        <ProtectedRoute moduleCode="NOTIFICATIONS">
                            <NotificationSettings permissions={notificationPermissions} />
                        </ProtectedRoute>
                    }
                />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
