import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.PORT || 3333);
const MCP_TOKEN = process.env.SOCIAL_MCP_TOKEN;
const BRIDGE_TOKEN = process.env.SOCIAL_BRIDGE_TOKEN || MCP_TOKEN;
if (!MCP_TOKEN || !BRIDGE_TOKEN) throw new Error("Set SOCIAL_MCP_TOKEN and SOCIAL_BRIDGE_TOKEN environment secrets.");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Session-Id, Last-Event-ID");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

let extension = null;
const pending = new Map();
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  if (extension && extension.readyState === 1) extension.close(4001, "A newer extension connected");
  extension = ws;
  ws.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    message.ok ? task.resolve(message.result) : task.reject(new Error(message.error || "Extension action failed"));
  });
  ws.on("close", () => { if (extension === ws) extension = null; });
});

function callExtension(action, payload = {}, timeout = 90000) {
  return new Promise((resolve, reject) => {
    if (!extension || extension.readyState !== 1) return reject(new Error("No browser extension is connected. Open Chrome and connect the Social MCP Bridge extension."));
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Browser action timed out: " + action)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    extension.send(JSON.stringify({ id, action, payload }));
  });
}

const textResult = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const safe = (fn) => async (args) => {
  try { return textResult(await fn(args)); }
  catch (error) { return { isError: true, content: [{ type: "text", text: String(error?.message || error) }] }; }
};

function createMcpServer() {
  const server = new McpServer({ name: "nndigitals-social-mcp", version: "1.0.0" });
  server.tool("list_connections", "Check which LinkedIn, Facebook and Instagram accounts are signed in in the connected Chrome browser.", {}, safe(() => callExtension("status")));
  server.tool("connect_platform", "Open the selected social platform sign-in page in Chrome. The user signs in directly; credentials are never collected by this service.", { platform: z.enum(["linkedin", "facebook", "instagram"]) }, safe(({ platform }) => callExtension("connect", { platform })));
  server.tool("publish_post", "Prepare a text post in the selected platform's composer. By default the user reviews and clicks Publish. Actual submission requires both submit=true and the extension's explicit Allow AI to submit setting.", {
    platform: z.enum(["linkedin", "facebook", "instagram"]),
    text: z.string().min(1).max(2200),
    submit: z.boolean().optional().default(false)
  }, safe((args) => callExtension("publish_post", args)));
  return server;
}

function authorized(req) {
  const header = req.headers.authorization || "";
  return header === `Bearer ${MCP_TOKEN}`;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "nndigitals-social-mcp", extensionConnected: !!extension }));
app.post("/mcp", async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});
app.get("/mcp", (_req, res) => res.status(405).json({ error: "Use POST for MCP requests." }));
app.delete("/mcp", (_req, res) => res.status(405).json({ error: "Stateless MCP sessions are not used." }));

const httpServer = http.createServer(app);
httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/bridge" || url.searchParams.get("token") !== BRIDGE_TOKEN) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
httpServer.listen(PORT, "0.0.0.0", () => console.log(`Social MCP listening on 0.0.0.0:${PORT}`));
