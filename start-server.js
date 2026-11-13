const { exec, spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const SERVER_DIR = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server";
const NODE_BIN = "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";
const URL_FILE = path.join(SERVER_DIR, "current-url.txt");

console.log("=== Talent Map Auto-Start ===");

// Start server
console.log("Starting server...");
const server = spawn(NODE_BIN, ["server-standalone.js"], {
  cwd: SERVER_DIR,
  stdio: "pipe",
  shell: false
});
server.stdout.on("data", d => process.stdout.write("[SERVER] " + d));
server.stderr.on("data", d => process.stderr.write("[SERVER] " + d));
server.on("exit", code => { console.log("Server exited with code", code); process.exit(1); });

// Wait for server to be ready
function checkServer() {
  return new Promise(resolve => {
    const check = () => {
      const req = http.get("http://127.0.0.1:3456", res => {
        resolve(true);
      });
      req.on("error", () => setTimeout(check, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
    };
    check();
  });
}

(async () => {
  await checkServer();
  console.log("Server is ready!");

  // Start SSH tunnel
  console.log("Starting SSH tunnel...");
  const tunnel = spawn("ssh", [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=30",
    "-R", "80:localhost:3456",
    "serveo.net"
  ], { stdio: "pipe", shell: false });

  tunnel.stdout.on("data", d => {
    const str = d.toString();
    process.stdout.write("[TUNNEL] " + str);
    const match = str.match(/Forwarding HTTP traffic from (https:\/\/[^\s]+)/);
    if (match) {
      console.log("\n==================================");
      console.log("  公网地址: " + match[1]);
      console.log("==================================");
      fs.writeFileSync(URL_FILE, match[1]);
    }
  });
  tunnel.stderr.on("data", d => process.stderr.write("[TUNNEL] " + d));

  // Keep process alive and restart tunnel if it dies
  tunnel.on("exit", (code) => {
    console.log("Tunnel died (code " + code + "). Restarting in 5s...");
    setTimeout(() => process.exit(1), 5000);
  });

  // Keep server alive
  server.on("exit", code => {
    console.log("Server died. Exiting.");
    process.exit(1);
  });
})();
