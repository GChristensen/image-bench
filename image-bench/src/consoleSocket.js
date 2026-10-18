/**
 * The socket of the console drawer (/image-bench/console), open only while the drawer is shown: the backend sends
 * the output so far ("backlog") on each connection, then the output written since ("append")
 */

const ENDPOINT = "/image-bench/console";
const RETRY_DELAY = 2000;

/**
 * Connect to the terminal output of the host, reconnecting while it is not closed
 * @param {Object} handlers
 * @param {function(string)} handlers.onBacklog the output so far, which replaces the shown text
 * @param {function(string)} handlers.onAppend output written since
 * @param {function(boolean)} [handlers.onState] whether the socket is connected
 * @returns {function()} Closes the socket
 */
export function openConsoleSocket({onBacklog, onAppend, onState}) {
  let socket = null;
  let closed = false;
  let retryTimer = null;

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}${ENDPOINT}`);
    socket = ws;

    ws.onopen = () => onState?.(true);

    ws.onmessage = e => {
      let message;

      try {
        message = JSON.parse(e.data);
      } catch {
        return;
      }

      if (message.type === "backlog")
        onBacklog(message.text);
      else if (message.type === "append")
        onAppend(message.text);
    };

    ws.onclose = () => {
      if (socket !== ws || closed)
        return;

      onState?.(false);
      retryTimer = setTimeout(connect, RETRY_DELAY);
    };
  }

  connect();

  return () => {
    closed = true;
    clearTimeout(retryTimer);
    socket?.close();
    socket = null;
  };
}
