const fs = require("fs");
const path = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public/app.js";
let src = fs.readFileSync(path, "utf8");

// Add auto-upload button next to the existing "导入简历" button
const oldBtn = 'onclick="App.navigate(\'talents\', {action:\'upload\'})">📄 导入简历</button>';
const newBtn = 'onclick="App.navigate(\'talents\', {action:\'upload\'})">📄 导入简历</button>\n            <button class="btn btn-primary" onclick="TalentDetail.uploadResumeAuto()">🤖 上传简历自动录入</button>';

src = src.replace(oldBtn, newBtn);

fs.writeFileSync(path, src, "utf8");
console.log("Added auto-import button");
