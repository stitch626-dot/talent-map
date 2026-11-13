const fs = require("fs");
const path = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public/index.html";
let html = fs.readFileSync(path, "utf8");

const oldScripts = `<script src="api-client.js"></script>
<script src="app.js"></script>`;

const newScripts = `<script src="github-storage.js"></script>
<script src="gh-data.js"></script>
<script src="api-client.js"></script>
<script src="app.js"></script>`;

html = html.replace(oldScripts, newScripts);
fs.writeFileSync(path, html, "utf8");
console.log("Updated index.html");
