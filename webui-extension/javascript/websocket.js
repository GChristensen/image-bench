let socket;
let onBackendMessage;

export function setSocketEventListener(listener) {
    onBackendMessage = listener;
}

export function createWebSocket(force) {
    if (!socket || force) {
        socket = new WebSocket("ws://" + location.host + "/image-bench/websocket");
        // socket.onopen = e => {
        // }
        socket.onmessage = onBackendMessage;
    }
}

export function checkWebSocketConnection() {
    if (socket?.readyState === WebSocket.CLOSED) {
        createWebSocket(true);
        return false
    }

    return true;
}