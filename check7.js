const https = require("https");
const d = JSON.stringify({email:"admin@talentmap.com",password:"admin123"});
const req = https.request({host:"79cb4b44c0c1ee.lhr.life",path:"/api/auth/login",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(d)}}, res => {
  let b = ""; res.on("data", c => b += c);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    try { const j = JSON.parse(b); console.log("Has token:", !!j.token); } catch { console.log("Body:", b.slice(0,200)); }
  });
});
req.on("error", e => console.error("ERR:", e.message));
req.write(d); req.end();
