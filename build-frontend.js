const fs = require('fs');
const p = 'C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public';

// Add api-client.js script to index.html
let html = fs.readFileSync(p + '/index.html', 'utf8');
html = html.replace('<script src="app.js"></script>', '<script src="api-client.js"></script>\n<script src="app.js"></script>');
fs.writeFileSync(p + '/index.html', html, 'utf8');

// Create login page
const loginHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>登录 - 人才地图</title>
<style>
:root{--primary:#1f5eff;--bg:#f7f8fa;--ink:#1a1d21;--muted:#5f6b7a;--line:#e3e7ee;--success:#0f766e}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;display:flex;align-items:center;justify-content:center}
.login-card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);width:400px;max-width:94vw;padding:40px 36px}
.logo{text-align:center;margin-bottom:28px}
.logo-mark{width:48px;height:48px;border-radius:12px;background:var(--primary);color:#fff;font-size:24px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px}
.logo-text{font-size:22px;font-weight:700;color:var(--ink)}
.form-group{margin-bottom:16px}
.form-label{display:block;font-size:13px;font-weight:600;color:#2d3644;margin-bottom:5px}
.form-input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:14px;font-family:inherit}
.form-input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(31,94,255,0.12)}
.btn{width:100%;padding:11px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.15s}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:#174bd1}
.btn-ghost{background:transparent;color:var(--muted);margin-top:8px}
.btn-ghost:hover{color:var(--ink)}
.error{color:#b91c1c;font-size:13px;text-align:center;margin-bottom:12px;display:none}
.toggle{text-align:center;margin-top:16px;font-size:14px;color:var(--muted)}
.toggle a{color:var(--primary);cursor:pointer}
</style>
</head>
<body>
<div class="login-card">
  <div class="logo">
    <div class="logo-mark">TM</div>
    <div class="logo-text">人才地图</div>
  </div>
  <div class="error" id="error"></div>
  <form id="loginForm" onsubmit="return handleSubmit(event)">
    <div class="form-group"><label class="form-label">邮箱</label><input class="form-input" type="email" id="email" placeholder="admin@talentmap.com" autocomplete="email"></div>
    <div class="form-group"><label class="form-label">密码</label><input class="form-input" type="password" id="password" placeholder="admin123" autocomplete="current-password"></div>
    <div class="form-group" id="nameGroup" style="display:none"><label class="form-label">姓名</label><input class="form-input" type="text" id="name" placeholder="你的姓名"></div>
    <button class="btn btn-primary" type="submit" id="submitBtn">登录</button>
  </form>
  <div class="toggle">
    <span id="toggleText">没有账号？</span> <a id="toggleLink" onclick="toggleMode()">注册</a>
  </div>
</div>

<script src="api-client.js"></script>
<script>
let isRegister = false;

function toggleMode() {
  isRegister = !isRegister;
  document.getElementById('nameGroup').style.display = isRegister ? 'block' : 'none';
  document.getElementById('submitBtn').textContent = isRegister ? '注册' : '登录';
  document.getElementById('toggleText').textContent = isRegister ? '已有账号？' : '没有账号？';
  document.getElementById('toggleLink').textContent = isRegister ? '登录' : '注册';
  document.getElementById('error').style.display = 'none';
}

async function handleSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value.trim();
  const errorEl = document.getElementById('error');
  
  if (!email || !password) {
    errorEl.textContent = '请输入邮箱和密码';
    errorEl.style.display = 'block';
    return;
  }

  try {
    if (isRegister) {
      if (!name) { errorEl.textContent = '请输入姓名'; errorEl.style.display = 'block'; return; }
      await ApiClient.register(name, email, password);
    } else {
      await ApiClient.login(email, password);
    }
    // Redirect to main app
    window.location.href = '/';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}
</script>
</body>
</html>`;

fs.writeFileSync(p + '/login.html', loginHtml, 'utf8');
console.log('Login page created');
