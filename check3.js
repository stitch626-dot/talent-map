const https = require("https");
https.get({host:"organizational-michelle-acre-newcastle.trycloudflare.com",path:"/api-client.js",headers:{"User-Agent":"Mozilla/5.0"}}, res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Content-Type:", res.headers["content-type"]);
    console.log("Length:", d.length);
    console.log("Has ApiClient:", d.includes("ApiClient"));
  });
}).on("error", e => console.error("ERR:", e.message));
