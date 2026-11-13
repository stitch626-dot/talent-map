const fs = require("fs");
const lines = fs.readFileSync("C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public/app.js", "utf8").split("\n");

// Find handleResumeUpload function
let start = -1, end = -1, braceCount = 0;
for (let i = 2031; i < lines.length; i++) {
  if (start === -1 && lines[i].includes("handleResumeUpload")) {
    start = i;
    braceCount = (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    continue;
  }
  if (start !== -1) {
    braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (braceCount <= 0) {
      end = i;
      break;
    }
  }
}
console.log("handleResumeUpload: lines", start+1, "to", end+1);
console.log("---");
lines.slice(start, end+1).forEach((l, i) => console.log((start+i+1) + ": " + l));
