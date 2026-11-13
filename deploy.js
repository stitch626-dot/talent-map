const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server";
const tmpDir = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/gh_tmp";

// Push master first
execSync("git checkout master --force", { cwd: dir, stdio: "pipe" });
execSync("git add public/login.html", { cwd: dir, stdio: "pipe" });
execSync("git commit -m token-setup", { cwd: dir, stdio: "pipe" });
execSync("git push origin master", { cwd: dir, stdio: "pipe" });
console.log("Master pushed");

// Copy public to tmp
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch(e) {}
const publicDir = path.join(dir, "public");
const files = fs.readdirSync(publicDir);
for (const f of files) {
  fs.copyFileSync(path.join(publicDir, f), path.join(tmpDir, f));
}

// Deploy to gh-pages
execSync("git checkout gh-pages", { cwd: dir, stdio: "pipe" });
const existing = fs.readdirSync(dir).filter(f => f !== ".git");
for (const f of existing) {
  try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); } catch(e) {}
}
for (const f of files) {
  fs.copyFileSync(path.join(tmpDir, f), path.join(dir, f));
}
execSync("git add -A", { cwd: dir, stdio: "pipe" });
try { execSync("git commit -m token-setup", { cwd: dir, stdio: "pipe" }); } catch(e) {}
execSync("git push origin gh-pages", { cwd: dir, stdio: "pipe" });
console.log("gh-pages deployed");

// Back to master
execSync("git checkout master", { cwd: dir, stdio: "pipe" });
console.log("Done");
