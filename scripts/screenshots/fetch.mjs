// The harness blocks its event loop while bb CLI commands run. A pooled HTTP
// socket can time out on the isolated server during that block, then be reused
// before the client processes the close event.
export function fetchFromStack(input, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("connection", "close");
  return fetch(input, { ...init, headers });
}
