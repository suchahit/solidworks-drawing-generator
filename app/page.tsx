"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { callMcpTool, checkMcpHealth, discoverMcpPort } from "@/lib/mcp";
import { TOOL_NAME_MAP } from "@/lib/sw-tools";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  type: "user" | "ai" | "tool-call" | "tool-result" | "error" | "success";
  text: string;
  detail?: string;
}

interface DrawingFormValues {
  partPath: string;
  outputPath: string;
  templatePath: string;
  paperSize: string;
  description: string;
  partNumber: string;
  material: string;
  drawnBy: string;
  revision: string;
  project: string;
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatusDot({ online }: { online: boolean | null }) {
  if (online === null)
    return <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />;
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${online ? "bg-green-500" : "bg-red-500"}`}
    />
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const base = "px-3 py-2 rounded text-sm font-mono whitespace-pre-wrap break-all";
  const styles: Record<LogEntry["type"], string> = {
    user: "bg-blue-50 text-blue-800 border border-blue-200",
    ai: "bg-white text-gray-700 border border-gray-200",
    "tool-call": "bg-amber-50 text-amber-900 border border-amber-200",
    "tool-result": "bg-green-50 text-green-800 border border-green-200",
    error: "bg-red-50 text-red-800 border border-red-200",
    success: "bg-green-100 text-green-900 border border-green-400 font-semibold",
  };
  const icons: Record<LogEntry["type"], string> = {
    user: "▶",
    ai: "◆",
    "tool-call": "⚙",
    "tool-result": "✓",
    error: "✗",
    success: "★",
  };
  return (
    <div className={`${base} ${styles[entry.type]}`}>
      <span className="mr-2 opacity-60">{icons[entry.type]}</span>
      {entry.text}
      {entry.detail && (
        <div className="mt-1 text-xs opacity-70 font-mono">{entry.detail}</div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [mcpPort, setMcpPort] = useState<number>(8180);
  const [mcpOnline, setMcpOnline] = useState<boolean | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<DrawingFormValues>({
    partPath: "",
    outputPath: "",
    templatePath:
      "C:\\Program Files\\Dassault Systemes\\SOLIDWORKS 3DEXPERIENCE R2026x\\SOLIDWORKS\\data\\templates\\ansi.drwdot",
    paperSize: "A",
    description: "",
    partNumber: "",
    material: "",
    drawnBy: "",
    revision: "A",
    project: "",
  });

  const addLog = useCallback((entry: Omit<LogEntry, "id">) => {
    setLog((prev) => [...prev, { ...entry, id: ++logIdRef.current }]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // ── MCP health check ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    checkMcpHealth(mcpPort).then((ok) => {
      if (!cancelled) setMcpOnline(ok);
    });
    return () => { cancelled = true; };
  }, [mcpPort]);

  async function handleDiscover() {
    setDiscovering(true);
    setMcpOnline(null);
    const port = await discoverMcpPort();
    setDiscovering(false);
    if (port) {
      setMcpPort(port);
      setMcpOnline(true);
    } else {
      setMcpOnline(false);
      addLog({ type: "error", text: "No MCP server found on ports 8180–8195. Is SolidWorksMcp.exe running?" });
    }
  }

  // ── Agent loop ────────────────────────────────────────────────────────────

  async function runAgentLoop(initialMessages: Anthropic.MessageParam[]) {
    const messages = [...initialMessages];

    for (let turn = 0; turn < 10; turn++) {
      // 1. Call Anthropic via server proxy
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat API error: ${res.status}`);
      }

      // 2. Read SSE stream and accumulate the full message
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let currentText = "";
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      let stopReason = "";
      let currentToolBlock: Partial<Anthropic.ToolUseBlock> | null = null;
      let inputJson = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          const type = event.type as string;

          if (type === "error") {
            throw new Error(String((event as { error: string }).error));
          }
          if (type === "content_block_start") {
            const block = (event as { index: number; content_block: Anthropic.ContentBlock }).content_block;
            if (block.type === "tool_use") {
              currentToolBlock = { id: block.id, type: "tool_use", name: block.name };
              inputJson = "";
            } else if (block.type === "text") {
              currentText = "";
            }
          }
          if (type === "content_block_delta") {
            const delta = (event as { delta: { type: string; text?: string; partial_json?: string } }).delta;
            if (delta.type === "text_delta" && delta.text) {
              currentText += delta.text;
            }
            if (delta.type === "input_json_delta" && delta.partial_json) {
              inputJson += delta.partial_json;
            }
          }
          if (type === "content_block_stop") {
            if (currentToolBlock) {
              currentToolBlock.input = JSON.parse(inputJson || "{}");
              toolUseBlocks.push(currentToolBlock as Anthropic.ToolUseBlock);
              currentToolBlock = null;
            } else if (currentText) {
              addLog({ type: "ai", text: currentText });
              currentText = "";
            }
          }
          if (type === "message_delta") {
            stopReason = ((event as { delta: { stop_reason: string } }).delta.stop_reason) ?? "";
          }
        }
      }

      // 3. Build assistant message from accumulated content
      const assistantContent: Anthropic.MessageParam["content"] = [];
      if (currentText) {
        assistantContent.push({ type: "text", text: currentText });
        addLog({ type: "ai", text: currentText });
      }
      for (const tb of toolUseBlocks) assistantContent.push(tb);

      messages.push({ role: "assistant", content: assistantContent });

      // 4. If no tool calls, we're done
      if (stopReason !== "tool_use" || toolUseBlocks.length === 0) break;

      // 5. Execute each tool call against local MCP
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        const mcpName = TOOL_NAME_MAP[tool.name] ?? tool.name.replace(/_/g, ".");
        const inputArgs = (tool.input ?? {}) as Record<string, unknown>;

        addLog({
          type: "tool-call",
          text: `Calling ${mcpName}`,
          detail: JSON.stringify(inputArgs, null, 2),
        });

        try {
          const result = await callMcpTool(mcpPort, mcpName, inputArgs);
          const resultText = JSON.stringify(result, null, 2);
          addLog({ type: "tool-result", text: `${mcpName} → ok`, detail: resultText });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: resultText,
          });

          // Surface success prominently
          if (result.success && result.output_path) {
            addLog({ type: "success", text: `Drawing saved: ${result.output_path}` });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addLog({ type: "error", text: `${mcpName} failed: ${msg}` });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `Error: ${msg}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  // ── Generate handler ──────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partPath) return;
    setRunning(true);
    setLog([]);

    const outputPath =
      form.outputPath ||
      form.partPath.replace(/\.sldprt$/i, ".slddrw").replace(/\.SLDPRT$/i, ".slddrw");

    const properties: Record<string, string> = {};
    if (form.description) properties["Description"] = form.description;
    if (form.partNumber) properties["PartNumber"] = form.partNumber;
    if (form.material) properties["Material"] = form.material;
    if (form.drawnBy) properties["DrawnBy"] = form.drawnBy;
    if (form.revision) properties["Revision"] = form.revision;
    if (form.project) properties["Project"] = form.project;

    const userPrompt = [
      `Generate a SOLIDWORKS drawing for the part at: ${form.partPath}`,
      `Save the drawing to: ${outputPath}`,
      form.templatePath ? `Use template: ${form.templatePath}` : "",
      `Paper size: ANSI ${form.paperSize}`,
      Object.keys(properties).length > 0
        ? `Title block properties:\n${Object.entries(properties)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    addLog({ type: "user", text: userPrompt });

    try {
      await runAgentLoop([{ role: "user", content: userPrompt }]);
    } catch (err) {
      addLog({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  // ── Field helper ──────────────────────────────────────────────────────────

  function field(
    label: string,
    key: keyof DrawingFormValues,
    opts?: { placeholder?: string; required?: boolean }
  ) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={opts?.placeholder}
          required={opts?.required}
          disabled={running}
        />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-bold tracking-tight">SOLIDWORKS Drawing Generator</h1>
          <p className="text-blue-200 text-xs mt-0.5">AI-powered • ANSI standard • Auto-dimensions</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <StatusDot online={mcpOnline} />
          <span className="text-blue-100">
            {mcpOnline === null ? "Checking…" : mcpOnline ? `MCP :${mcpPort}` : "MCP offline"}
          </span>
          <input
            type="number"
            className="w-20 text-gray-900 rounded px-2 py-1 text-xs"
            value={mcpPort}
            onChange={(e) => { setMcpPort(Number(e.target.value)); setMcpOnline(null); }}
            disabled={running}
          />
          <button
            onClick={handleDiscover}
            disabled={discovering || running}
            className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded px-3 py-1 text-xs"
          >
            {discovering ? "Scanning…" : "Discover"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Form */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <form onSubmit={handleGenerate} className="p-4 flex flex-col gap-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Part & Output</div>
            {field("Part File (.sldprt)", "partPath", { placeholder: "C:\\Parts\\bracket.sldprt", required: true })}
            {field("Output Path (.slddrw)", "outputPath", { placeholder: "Leave blank to save next to part" })}
            {field("Template (.drwdot)", "templatePath")}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paper Size</label>
              <select
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.paperSize}
                onChange={(e) => setForm((f) => ({ ...f, paperSize: e.target.value }))}
                disabled={running}
              >
                {["A", "B", "C", "D", "E"].map((s) => (
                  <option key={s} value={s}>
                    ANSI {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Title Block</div>
              {field("Description", "description", { placeholder: "Mounting Bracket" })}
              {field("Part Number", "partNumber", { placeholder: "MB-001" })}
              {field("Material", "material", { placeholder: "AISI 1018 Steel" })}
              {field("Drawn By", "drawnBy")}
              {field("Revision", "revision")}
              {field("Project", "project")}
            </div>

            <button
              type="submit"
              disabled={running || !form.partPath || mcpOnline === false}
              className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Generating…
                </>
              ) : (
                "Generate Drawing"
              )}
            </button>

            {mcpOnline === false && (
              <p className="text-xs text-red-600 text-center -mt-2">
                MCP server offline. Start SolidWorksMcp.exe first.
              </p>
            )}
          </form>
        </aside>

        {/* Right: Activity log */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <div className="border-b border-gray-200 px-4 py-2 bg-white text-xs text-gray-500 font-medium">
            Activity Log
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {log.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Fill in the form and click Generate Drawing to start.
              </div>
            )}
            {log.map((entry) => (
              <LogLine key={entry.id} entry={entry} />
            ))}
            <div ref={logEndRef} />
          </div>
        </main>
      </div>
    </div>
  );
}
