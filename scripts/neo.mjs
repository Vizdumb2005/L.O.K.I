
// BrowserOS neo MCP client — reusable module
const MCP_URL = 'http://127.0.0.1:9010/mcp';
let sessionId = null;
let requestId = 1;

export async function mcpCall(method, params = {}) {
  const headers = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  
  const body = JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params });
  const resp = await fetch(MCP_URL, { method: 'POST', headers, body });
  
  if (!sessionId) sessionId = resp.headers.get('mcp-session-id');
  
  const text = await resp.text();
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { return JSON.parse(line.substring(6)); } catch {}
    }
  }
  return { raw: text.substring(0, 2000) };
}

export async function mcpNotify(method, params = {}) {
  const headers = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const body = JSON.stringify({ jsonrpc: '2.0', method, params });
  await fetch(MCP_URL, { method: 'POST', headers, body }).then(r => r.text());
}

export async function init() {
  const init = await mcpCall('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'dsh', version: '1.0' }
  });
  await mcpNotify('notifications/initialized');
  return init;
}

// Convenience wrappers
export async function nameSession(name, category, summary) {
  return mcpCall('tools/call', { name: 'name_session', arguments: { name, category, summary } });
}

export async function newTab(url) {
  return mcpCall('tools/call', { name: 'tabs', arguments: { action: 'new', url } });
}

export async function listTabs() {
  return mcpCall('tools/call', { name: 'tabs', arguments: { action: 'list' } });
}

export async function navigate(pageId, url) {
  return mcpCall('tools/call', { name: 'navigate', arguments: { pageId, url } });
}

export async function snapshot(pageId) {
  return mcpCall('tools/call', { name: 'snapshot', arguments: { pageId } });
}

export async function read(pageId) {
  return mcpCall('tools/call', { name: 'read', arguments: { pageId } });
}

export async function screenshot(pageId) {
  return mcpCall('tools/call', { name: 'screenshot', arguments: { pageId } });
}

export async function run(code) {
  return mcpCall('tools/call', { name: 'run', arguments: { code } });
}