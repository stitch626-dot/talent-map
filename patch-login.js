const fs = require("fs");
const path = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public/login.html";
let html = fs.readFileSync(path, "utf8");

// Add token setup before the form
const formStart = `<form id="loginForm"`;

const tokenSetup = `<div id="tokenSetup" style="margin-bottom:20px;padding:12px;background:#fff8e1;border-radius:8px;display:none">
    <label class="form-label">🔑 GitHub Token（云端存储必须）</label>
    <input class="form-input" type="password" id="ghToken" placeholder="ghp_..." style="margin-bottom:6px">
    <div style="display:flex;gap:8px">
      <button type="button" class="btn btn-primary" onclick="saveToken()" style="flex:1">保存 Token</button>
      <button type="button" class="btn btn-ghost" onclick="clearToken()">清除</button>
    </div>
    <p style="font-size:12px;color:#888;margin-top:6px">数据存储在 GitHub 仓库，需要 Token 读写权限。Token 仅保存在你的浏览器中。</p>
  </div>
  <div id="tokenStatus" style="margin-bottom:12px;text-align:center;display:none">
    <span style="color:green">✅ Token 已保存</span>
  </div>
  `;

html = html.replace(formStart, tokenSetup + "\n" + formStart);

// Add token management JS before the existing script
const scriptTag = `<script src="api-client.js">`;

const tokenJs = `<script>
const GH_HOST = window.location.hostname.includes("github.io");
if (GH_HOST) {
  document.getElementById("tokenSetup").style.display = "block";
  const saved = localStorage.getItem("gh_token");
  if (saved) {
    document.getElementById("ghToken").value = saved;
    document.getElementById("tokenStatus").style.display = "block";
  }
}
function saveToken() {
  const t = document.getElementById("ghToken").value.trim();
  if (!t) return;
  localStorage.setItem("gh_token", t);
  document.getElementById("tokenStatus").style.display = "block";
  showMsg("Token 已保存", "success");
}
function clearToken() {
  localStorage.removeItem("gh_token");
  document.getElementById("ghToken").value = "";
  document.getElementById("tokenStatus").style.display = "none";
}
function showMsg(msg, type) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = type === "success" ? "green" : "#b91c1c";
  setTimeout(() => el.style.display = "none", 3000);
}
</script>
`;

html = html.replace(scriptTag, tokenJs + "\n" + scriptTag);

fs.writeFileSync(path, html, "utf8");
console.log("Updated login.html with token setup");
