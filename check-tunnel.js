const https = require("https");
https.get({host:"organizational-michelle-acre-newcastle.trycloudflare.com",path:"/login.html",headers:{"User-Agent":"Mozilla/5.0"}}, res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    console.log("STATUS", res.statusCode);
    console.log("CF:", d.includes("challenge-platform") || d.includes("Just a moment"));
    console.log("Has login:", d.includes("login") || d.includes("登录"));
    console.log("Length:", d.length);
  });
}).on("error", e => console.error("ERR:", e.message));
