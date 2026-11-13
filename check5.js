const https = require("https");
https.get({host:"b0376cd6f81af32b-103-85-170-35.serveousercontent.com",path:"/login.html",headers:{"User-Agent":"Mozilla/5.0"}}, res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => console.log("Status:", res.statusCode, "login:", d.includes("登录")));
}).on("error", e => console.error("ERR:", e.message));
