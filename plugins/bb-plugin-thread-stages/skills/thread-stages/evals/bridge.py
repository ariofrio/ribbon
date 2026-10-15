"""Minimal stdio MCP server; tools have no access to host files or processes."""

import json
from pathlib import Path
import sys

from fixture import Workspace

TOOLS = [
    {"name": "Bash", "description": "Run a command in the project workspace.",
     "inputSchema": {"type": "object", "properties": {"command": {"type": "string"}, "description": {"type": "string"}}, "required": ["command"]}},
    {"name": "Read", "description": "Read a file in the project workspace.",
     "inputSchema": {"type": "object", "properties": {"file_path": {"type": "string"}, "offset": {"type": "integer", "minimum": 1}, "limit": {"type": "integer", "minimum": 1}}, "required": ["file_path"]}},
    {"name": "Write", "description": "Write a project notes or report file.",
     "inputSchema": {"type": "object", "properties": {"file_path": {"type": "string"}, "content": {"type": "string"}}, "required": ["file_path", "content"]}},
]


def serve(artifacts):
    workspace = Workspace(artifacts)
    for line in sys.stdin:
        request = json.loads(line)
        if "id" not in request:
            continue
        method = request["method"]
        if method == "initialize":
            result = {"protocolVersion": request["params"]["protocolVersion"], "capabilities": {"tools": {}}, "serverInfo": {"name": "workspace", "version": "1.0.0"}}
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            params = request["params"]
            result = workspace.tool(params["name"], params.get("arguments", {}))
        else:
            print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32601, "message": "Method not found"}}), flush=True)
            continue
        print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)


if __name__ == "__main__":
    serve(Path(sys.argv[1]))
