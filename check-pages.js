const https = require("https");
https.get({host:"stitch626-dot.github.io",path:"/talent-map/",headers:{"User-Agent":"Mozilla/5.0"}}, r => {
  let d = "";
  r.on("data", c => d += c);
  r.on("end", () => {
    console.log("Status", r.statusCode);
    console.log("Has talent:", d.includes("人才地图") || d.includes("talent"));
    console.log("Len:", d.length);
  });
}).on("error", e => console.error("ERR:", e.message));
