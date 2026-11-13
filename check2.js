const https = require("https");
// Get full page content
https.get({host:"organizational-michelle-acre-newcastle.trycloudflare.com",path:"/login.html",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}}, res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Content-Type:", res.headers["content-type"]);
    console.log("---PAGE START---");
    console.log(d.substring(0, 500));
    console.log("---PAGE END---");
  });
}).on("error", e => console.error("ERR:", e.message));
