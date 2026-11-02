import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpScript = path.resolve(__dirname, "../dist/mcp.js");

const mcp = spawn("node", [mcpScript]);

mcp.stdout.on("data", (data) => {
  console.log(`STDOUT: ${data.toString()}`);
});

mcp.stderr.on("data", (data) => {
  console.log(`STDERR: ${data.toString()}`);
});

mcp.on("close", (code) => {
  console.log(`Process exited with code ${code}`);
});

const req = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
};

mcp.stdin.write(`${JSON.stringify(req)}\n`);
