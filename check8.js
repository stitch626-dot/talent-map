const https = require("https");
https.get({host:"79cb4b44c0c1ee.lhr.life",path:"/api-client.js"}, res => {
  let d = ""; res.on("data", c => d += c);
  res.on("end", () => {
    console.log("Status:", res.statusCode, "len:", d.length);
    // Check for corruption
    const hasBadMerge = d.includes("async getSettings(){return this.request('GET','/settings')}") && d.includes("Content-Type");
    console.log("Clean:", !hasBadMerge);
    console.log("Has ApiClient:", d.includes("ApiClient"));
    console.log("Has request:", d.includes("async request"));
  });
}).on("error", e => console.error("ERR:", e.message));
