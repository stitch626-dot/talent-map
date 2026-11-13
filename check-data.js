const http = require("http");
const d = JSON.stringify({email:"admin@talentmap.com",password:"admin123"});
http.request({host:"localhost",port:3456,path:"/api/auth/login",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(d)}}, res => {
  let b = ""; res.on("data", c => b += c);
  res.on("end", () => {
    const token = JSON.parse(b).token;
    const get = (p) => new Promise(resolve => {
      http.get("http://localhost:3456"+p,{headers:{Authorization:"Bearer "+token}}, r => {
        let d = ""; r.on("data", c => d += c); r.on("end", () => resolve(JSON.parse(d)));
      });
    });
    Promise.all([get("/api/talents"), get("/api/companies"), get("/api/space")]).then(([talents, companies, space]) => {
      console.log("Talents:", talents.length);
      console.log("Companies:", companies.length);
      console.log("Space:", JSON.stringify(space));
      console.log("First talent full:", JSON.stringify(talents[0], null, 2).slice(0, 1500));
    });
  });
}).write(d);
