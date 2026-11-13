import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getStoredToken, setUnauthorizedHandler, storeToken } from "../api";

const USER_KEY = "notifyflow_user";

const AuthContext = createContext(null);

function readStoredUser() {
    try {
        const text = localStorage.getItem(USER_KEY);
        if (!text) return null;
        return JSON.parse(text);
    } catch (err) {
        return null;
    }
}

function storeUser(user) {
    try {
        if (user) {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(USER_KEY);
        }
    } catch (err) {
        // storage can be blocked; the session then lasts until the page reloads
    }
}

// ADMIN can do everything. USER can use To-Do only, so Notification Settings has no access for USER.
// all_todos lets a user see everyone's tasks, not just their own.
export function getPermissions(role, moduleCode) {
    const isAdmin = role === "ADMIN";
    if (moduleCode === "TODO") {
        return {
            view: true,
            add: true,
            edit: true,
            delete: isAdmin,
            all_todos: isAdmin,
        };
    }
    if (moduleCode === "NOTIFICATIONS") {
        return {
            view: isAdmin,
            add: isAdmin,
            edit: isAdmin,
            delete: isAdmin,
        };
    }
    return { view: false, add: false, edit: false, delete: false };
}

export function AuthProvider({ children }) {
    const [token, setToken] = useState(getStoredToken());
    const [user, setUser] = useState(readStoredUser());
    const [employees, setEmployees] = useState([]);

    const logout = useCallback(() => {
        storeToken(null);
        storeUser(null);
        setToken(null);
        setUser(null);
        setEmployees([]);
    }, []);

    useEffect(() => {
        setUnauthorizedHandler(logout);
    }, [logout]);

    // The employee list feeds the owner / assignee / subscriber pickers across the To-Do screens
    useEffect(() => {
        if (!token) return;
        axios
            .get("/get_employees")
            .then((res) => setEmployees(res.data.data || []))
            .catch((err) => err?.handleGlobally?.("Employees"));
    }, [token]);

    const login = async (email, password) => {
        const res = await axios.post("/login", { email: email, password: password });
        storeToken(res.data.token);
        storeUser(res.data.user);
        setToken(res.data.token);
        setUser(res.data.user);
    };

    const value = useMemo(
        () => ({
            token: token,
            user: user,
            employees: employees,
            isAuthenticated: !!token && !!user,
            login: login,
            logout: logout,
            getPermissions: (moduleCode) => getPermissions(user?.role, moduleCode),
        }),
        [token, user, employees, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
