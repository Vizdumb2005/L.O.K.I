
// BrowserOS neo MCP client
const MCP_URL = 'http://127.0.0.1:9010/mcp';
let sessionId = null;
let requestId = 1;

async function mcpCall(method, params = {}) {
  const headers = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  
  const body = JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params });
  const resp = await fetch(MCP_URL, { method: 'POST', headers, body });
  
  if (!sessionId) {
    sessionId = resp.headers.get('mcp-session-id');
  }
  
  const text = await resp.text();
  // Parse SSE: lines starting with "data: " contain JSON
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const json = line.substring(6);
      try {
        return JSON.parse(json);
      } catch {}
    }
  }
  return { raw: text };
}

async function mcpNotify(method, params = {}) {
  const headers = {
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  
  const body = JSON.stringify({ jsonrpc: '2.0', method, params });
  const resp = await fetch(MCP_URL, { method: 'POST', headers, body });
  await resp.text(); // consume
}

async function main() {
  // 1. Initialize
  console.log('=== Initialize ===');
  const init = await mcpCall('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'dsh', version: '1.0' }
  });
  console.log('Server:', init.result?.serverInfo?.name, init.result?.serverInfo?.version);
  console.log('Session ID:', sessionId);
  
  // 2. Initialized notification
  await mcpNotify('notifications/initialized');
  console.log('Initialized.');
  
  // 3. List tools
  console.log('\n=== Tools ===');
  const tools = await mcpCall('tools/list');
  if (tools.result?.tools) {
    for (const t of tools.result.tools) {
      const desc = (t.description || '').split('\n')[0].substring(0, 80);
      console.log('  ' + t.name + ' — ' + desc);
    }
    console.log('\nTotal: ' + tools.result.tools.length + ' tools');
    
    // Print tool names for easy reference
    console.log('\n=== Tool Names ===');
    console.log(tools.result.tools.map(t => t.name).join(', '));
  } else {
    console.log('No tools found:', JSON.stringify(tools).substring(0, 500));
  }
  
  return { sessionId, toolCount: tools.result?.tools?.length || 0 };
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
