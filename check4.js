const https = require("https");
// Test serveo tunnel current URL
https.get({host:"7781575bbe8a14d4-103-85-170-35.serveousercontent.com",path:"/login.html",headers:{"User-Agent":"Mozilla/5.0"}}, res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    console.log("Serveo Status:", res.statusCode);
    console.log("Has login:", d.includes("登录") || d.includes("login"));
  });
}).on("error", e => console.error("Serveo ERR:", e.message));
