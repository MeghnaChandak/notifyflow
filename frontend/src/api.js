import axios from "axios";
import { message } from "antd";

export const TOKEN_KEY = "notifyflow_token";

export function getStoredToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch (err) {
        return null;
    }
}

export function storeToken(token) {
    try {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    } catch (err) {
        // storage can be blocked; the session then lasts until the page reloads
    }
}

// FastAPI sends {"detail": "text"} for handled errors and {"detail": [..]} for 422 validation errors
function readDetail(error) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    return null;
}

// errorComposer will compose a handleGlobally function
const errorComposer = (error, prefixMessage) => {
    const statusCode = error.response ? error.response.status : null;
    const detail = readDetail(error);

    if (!statusCode) {
        message.error(prefixMessage + " : Network Error");
        return;
    }
    if (statusCode === 401) {
        message.error(prefixMessage + " : Unauthorized");
        return;
    }
    if (statusCode === 422) {
        message.error(prefixMessage + " : Error with Pydantic Schema");
        return;
    }
    if (detail) {
        message.error(prefixMessage + " : " + detail);
        return;
    }
    if (statusCode === 404) {
        message.error(prefixMessage + " : Not Found");
        return;
    }
    message.error(prefixMessage + " : Error Occured");
};

// onUnauthorized is set by AuthProvider so a 401 clears the session and returns to /login
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

export function setupAxios() {
    axios.defaults.baseURL = "/api";

    axios.interceptors.request.use((config) => {
        const token = getStoredToken();
        if (token) {
            config.headers.Authorization = "Bearer " + token;
        }
        return config;
    });

    // apiName comes as a prefix when handling the error globally
    axios.interceptors.response.use(undefined, (error) => {
        const isLoginCall = error.config?.url === "/login";
        if (error.response?.status === 401 && !isLoginCall && onUnauthorized) {
            onUnauthorized();
        }
        error.handleGlobally = (prefixMessage) => {
            errorComposer(error, prefixMessage);
        };
        return Promise.reject(error);
    });
}
