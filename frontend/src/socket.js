import { io } from "socket.io-client";
import { getStoredToken } from "./api";

// The API mounts socket.io under /ws; the dev proxy / reverse proxy maps /api -> API root
export const socket = io({
    path: "/api/ws/socket.io",
    autoConnect: false,
    reconnectionAttempts: 5,
    // the server reads the JWT from the handshake (no "Bearer " prefix) and puts the socket in the
    // user's notification room itself
    auth: (callback) => callback({ token: getStoredToken() }),
});

socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
});

export function connectSocket() {
    if (!socket.connected) {
        socket.connect();
    }
}

export function disconnectSocket() {
    socket.disconnect();
}
