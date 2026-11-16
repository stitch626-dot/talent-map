/* ==========================================================================
   GitHub 云存储 — 数据读写到 GitHub 仓库
   ========================================================================== */

const GitHubStorage = {
  owner: "stitch626-dot",
  repo: "talent-map",
  branch: "gh-pages",
  dataPath: "data.json",
  token: null,
  sha: null,
  data: null,

  /* 初始化：从 localStorage 读取 token */
  init() {
    this.token = localStorage.getItem("gh_token");
    return !!this.token;
  },

  /* 设置 token */
  setToken(token) {
    this.token = token;
    localStorage.setItem("gh_token", token);
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem("gh_token");
  },

  /* GitHub API 请求 */
  async api(method, path, body) {
    const headers = {
      "Authorization": "Bearer " + this.token,
      "Accept": "application/vnd.github.v3+json"
    };
    const opts = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch("https://api.github.com" + path, opts);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "GitHub API 请求失败 (HTTP " + res.status + ")");
    }
    return data;
  },

  /* 从 GitHub 加载 data.json */
  async load() {
    if (!this.token) throw new Error("请先设置 GitHub Token");
    const path = "/repos/" + this.owner + "/" + this.repo + "/contents/" + this.dataPath + "?ref=" + this.branch;
    const file = await this.api("GET", path);
    this.sha = file.sha;
    // 正确解码 UTF-8（GitHub API 返回 base64 编码的 UTF-8 内容）
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const text = new TextDecoder("utf-8").decode(bytes);
    this.data = JSON.parse(text);
    return this.data;
  },

  /* 保存 data.json 到 GitHub（自动重试处理冲突） */
  async save(data, retries = 3) {
    if (!this.token) throw new Error("请先设置 GitHub Token");
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (!this.sha) {
          try { await this.load(); } catch (e) { /* ignore */ }
        }
        const path = "/repos/" + this.owner + "/" + this.repo + "/contents/" + this.dataPath;
        const text = JSON.stringify(data, null, 2);
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const content = btoa(binary);
        const body = {
          message: "\u66f4\u65b0\u4eba\u624d\u6570\u636e " + new Date().toLocaleString("zh-CN"),
          content: content,
          branch: this.branch
        };
        if (this.sha) body.sha = this.sha;
        const result = await this.api("PUT", path, body);
        this.sha = result.content.sha;
        return result;
      } catch(e) {
        if (attempt < retries - 1 && (e.message.includes("409") || e.message.includes("conflict") || e.message.includes("does not match"))) {
          // SHA conflict - reload and retry
          console.warn("SHA conflict, retrying... (" + (attempt + 2) + "/" + retries + ")");
          this.sha = null;
          try { await this.load(); } catch (e2) {}
          continue;
        }
        throw e;
      }
    }
  },

  /* 测试 token 是否有效 */
  async test() {
    const user = await this.api("GET", "/user");
    return user.login;
  }
};
