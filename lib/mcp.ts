export interface McpResult {
  [key: string]: unknown;
}

// PNA (Private Network Access) requires two round-trips from HTTPS → localhost:
// 1. OPTIONS preflight, 2. actual request. Use generous timeouts.
const HEALTH_TIMEOUT_MS = 4000;
const DISCOVER_TIMEOUT_MS = 3000;

const AUTH_HEADER = { Authorization: "Bearer test-token-123" };

// Try both 127.0.0.1 and localhost — browsers treat them slightly differently for PNA
async function healthFetch(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/mcp/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: AUTH_HEADER,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function callMcpTool(
  port: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpResult> {
  const url = `http://127.0.0.1:${port}/mcp/invoke`;
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH_HEADER },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MCP server returned ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return (json.result ?? json) as McpResult;
}

export async function discoverMcpPort(): Promise<{ port: number | null; error?: string }> {
  for (let port = 8180; port <= 8195; port++) {
    // Try 127.0.0.1 first, then localhost as fallback
    for (const host of ["127.0.0.1", "localhost"]) {
      try {
        const res = await fetch(`http://${host}:${port}/mcp/health`, {
          signal: AbortSignal.timeout(DISCOVER_TIMEOUT_MS),
          headers: AUTH_HEADER,
        });
        if (res.ok) return { port };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If it looks like a PNA/CORS block rather than a refused connection, surface it
        if (msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
          return {
            port: null,
            error:
              "Browser blocked the request (Private Network Access). " +
              "Try opening the app at http://localhost:3000 instead of the Vercel URL, " +
              "or type the port manually and click Discover again.",
          };
        }
      }
    }
  }
  return { port: null };
}

export async function checkMcpHealth(port: number): Promise<boolean> {
  // Try both hosts
  return (await healthFetch("127.0.0.1", port)) || (await healthFetch("localhost", port));
}
