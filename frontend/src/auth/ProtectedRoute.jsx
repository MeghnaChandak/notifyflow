import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

// moduleCode is optional; when given, the user also needs view access to that module
export default function ProtectedRoute({ moduleCode, children }) {
    const auth = useAuth();
    const location = useLocation();

    if (!auth.isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    if (moduleCode && !auth.getPermissions(moduleCode).view) {
        return <Navigate to="/" replace />;
    }
    return children;
}
