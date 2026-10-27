#!/usr/bin/env node
/**
 * utils-mcp-proxy — thin stdio MCP server that proxies a hosted utility toolbox
 * (uuid/ulid, csv/json conversion, hashing, AI-slop detector) over MCP.
 *
 * Tool list is fetched live from the hosted endpoint so it can never drift
 * from what the service actually offers. Free tier, no API key required.
 * Discloses AI operation on every request (User-Agent).
 */
const http = require("http");
const https = require("https");
const BASE = process.env.UTILS_MCP_URL || "https://utils.bigfloppy.net";
const ENDPOINT = BASE + "/mcp";
const UA = "utils-mcp-proxy/1.0.0 (npm; autonomous-agent-maintained; disclosure: AI-operated service)";

function req(method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(ENDPOINT);
    const payload = body ? JSON.stringify(body) : null;
    const lib = u.protocol === "http:" ? http : https;
    const r = lib.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
        method: method || "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": UA,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d }));
      }
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function extractJson(textBody) {
  // endpoint may answer JSON or SSE; find the embedded JSON object
  const m = textBody.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

let TOOLS = null;
async function loadTools() {
  const init = extractJson((await req("POST", { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "utils-mcp-proxy", version: "1.0.0" } } })).body);
  const list = extractJson((await req("POST", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })).body);
  if (list && Array.isArray(list.result && list.result.tools)) {
    TOOLS = list.result.tools;
  } else {
    throw new Error("could not fetch tool list from " + ENDPOINT);
  }
}

async function callTool(name, args) {
  const r = extractJson((await req("POST", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args || {} } })).body);
  if (r && r.result) return r.result;
  if (r && r.error) return { content: [{ type: "text", text: "upstream error: " + JSON.stringify(r.error) }] };
  return { content: [{ type: "text", text: "empty upstream response" }] };
}

// ---- stdio MCP loop (JSON-RPC over newline-delimited JSON) ----
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", async (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    await handle(msg);
  }
});

async function handle(msg) {
  const { id, method } = msg;
  try {
    if (method === "initialize") {
      send(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "utils-mcp-proxy", version: "1.0.0", title: "Utils (hosted toolbox proxy)" } });
    } else if (method === "notifications/initialized") {
      if (!TOOLS) await loadTools();
    } else if (method === "tools/list") {
      if (!TOOLS) await loadTools();
      send(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      const { name, arguments: args } = msg.params || {};
      send(id, await callTool(name, args));
    } else if (method === "ping") {
      send(id, {});
    } else if (id !== undefined) {
      send(id, { error: { code: -32601, message: "method not supported: " + method } });
    }
  } catch (e) {
    if (id !== undefined) send(id, { error: { code: -32000, message: "proxy error: " + e.message } });
  }
}

function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
