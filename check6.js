const https = require("https");
const d = JSON.stringify({email:"admin@talentmap.com",password:"admin123"});
const req = https.request({host:"b0376cd6f81af32b-103-85-170-35.serveousercontent.com",path:"/api/auth/login",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(d)}}, res => {
  let b = ""; res.on("data", c => b += c);
  res.on("end", () => {
    const t = JSON.parse(b).token;
    https.get("https://b0376cd6f81af32b-103-85-170-35.serveousercontent.com/api/talents",{headers:{Authorization:"Bearer "+t}}, r2 => {
      let b2 = ""; r2.on("data", c => b2 += c);
      r2.on("end", () => console.log("Login OK, talents:", JSON.parse(b2).length));
    });
  });
});
req.on("error", e => console.error("ERR:", e.message));
req.write(d); req.end();
