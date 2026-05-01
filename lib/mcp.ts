export interface McpResult {
  [key: string]: unknown;
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
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token-123",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MCP server returned ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return (json.result ?? json) as McpResult;
}

export async function discoverMcpPort(): Promise<number | null> {
  for (let port = 8180; port <= 8195; port++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp/health`, {
        signal: AbortSignal.timeout(800),
        headers: { Authorization: "Bearer test-token-123" },
      });
      if (res.ok) return port;
    } catch {
      // port not available, try next
    }
  }
  return null;
}

export async function checkMcpHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/mcp/health`, {
      signal: AbortSignal.timeout(1500),
      headers: { Authorization: "Bearer test-token-123" },
    });
    return res.ok;
  } catch {
    return false;
  }
}
