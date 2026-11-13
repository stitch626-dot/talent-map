const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server";
const tmpDir = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/gh_tmp";

// Push master with any changes
execSync("git checkout master --force", { cwd: dir, stdio: "pipe" });
try {
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync("git commit -m update-public", { cwd: dir, stdio: "pipe" });
  execSync("git push origin master", { cwd: dir, stdio: "pipe" });
  console.log("Master pushed");
} catch(e) {
  console.log("Master: no changes to push");
}

// Copy public files
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
fs.mkdirSync(tmpDir, { recursive: true });
const publicDir = path.join(dir, "public");
const files = fs.readdirSync(publicDir);
for (const f of files) {
  fs.copyFileSync(path.join(publicDir, f), path.join(tmpDir, f));
}
console.log("Copied", files.length, "files");

// Deploy to gh-pages
execSync("git checkout gh-pages --force", { cwd: dir, stdio: "pipe" });
const existing = fs.readdirSync(dir).filter(f => f !== ".git");
for (const f of existing) {
  try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch(e) {}
}
for (const f of files) {
  fs.copyFileSync(path.join(tmpDir, f), path.join(dir, f));
}
console.log("Deployed to gh-pages root");

execSync("git add -A", { cwd: dir, stdio: "pipe" });
execSync("git commit -m deploy-v3 --allow-empty", { cwd: dir, stdio: "pipe" });
execSync("git push origin gh-pages --force", { cwd: dir, stdio: "pipe" });
console.log("gh-pages pushed");

execSync("git checkout master --force", { cwd: dir, stdio: "pipe" });
console.log("Done!");
