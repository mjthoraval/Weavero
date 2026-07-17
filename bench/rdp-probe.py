import subprocess, json, os, sys, time, threading, queue

# Drive @introfini/mcp-server-zotero-dev over stdio against ZOTERO_RDP_PORT=6101
env = dict(os.environ, ZOTERO_RDP_PORT=os.environ.get('ZOTERO_RDP_PORT', '6100'))
p = subprocess.Popen('npx -y @introfini/mcp-server-zotero-dev', shell=True, env=env,
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                     text=True, encoding='utf-8')

q = queue.Queue()
def reader():
    for line in p.stdout:
        line = line.strip()
        if line:
            q.put(line)
threading.Thread(target=reader, daemon=True).start()

def send(o):
    p.stdin.write(json.dumps(o) + '\n')
    p.stdin.flush()

def recv(want_id, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        try:
            line = q.get(timeout=1)
        except queue.Empty:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if msg.get('id') == want_id:
            return msg
    return None

send({"jsonrpc": "2.0", "id": 1, "method": "initialize",
      "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                 "clientInfo": {"name": "probe", "version": "0.1"}}})
r = recv(1)
if not r:
    print("INIT_TIMEOUT"); sys.exit(1)
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

def call(idn, tool, args):
    send({"jsonrpc": "2.0", "id": idn, "method": "tools/call",
          "params": {"name": tool, "arguments": args}})
    r = recv(idn, timeout=45)
    if not r:
        print(f"== {tool}: TIMEOUT"); return
    content = r.get('result', {}).get('content', [])
    text = '\n'.join(c.get('text', '') for c in content if c.get('type') == 'text')
    print(f"== {tool} ==")
    print(text[:6000])

if len(sys.argv) > 2 and sys.argv[1] == 'file':
    code = open(sys.argv[2], encoding='utf-8').read()
    call(2, "zotero_execute_js", {"code": code})
elif len(sys.argv) > 2 and sys.argv[1] == 'tool':
    call(2, sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
elif len(sys.argv) > 1 and sys.argv[1] == 'list':
    send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    r = recv(2, timeout=30)
    for t in r.get('result', {}).get('tools', []):
        print(t['name'], '::', json.dumps(t.get('inputSchema', {}).get('properties', {})))
elif len(sys.argv) > 1:
    call(2, "zotero_execute_js", {"code": sys.argv[1]})
else:
    call(2, "zotero_ping", {})
    call(3, "zotero_read_errors", {})
    call(4, "zotero_execute_js", {"code": "(typeof Zotero !== 'undefined' && Zotero.startupError) ? Zotero.startupError : '(no Zotero.startupError)'"})

p.terminate()
