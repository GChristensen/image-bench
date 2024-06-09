let socket;
let onBackendMessage;

export function setSocketEventListener(listener) {
    onBackendMessage = listener;
}

export function createWebSocket() {
    if (!socket) {
        socket = new WebSocket("ws://" + location.host + "/image-bench/websocket");
        // socket.onopen = e => {
        // }
        socket.onmessage = onBackendMessage;
    }
}

export function checkWebSocketConnection() {
    if (socket?.readyState === WebSocket.CLOSED) {
        createWebSocket();
        return false
    }

    return true;
}