/* ==========================================================================
   GitHub 云存储 — 数据读写到 GitHub 仓库
   ========================================================================== */

const GitHubStorage = {
  owner: "stitch626-dot",
  repo: "talent-map",
  branch: "master",
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
    this.data = JSON.parse(atob(file.content));
    return this.data;
  },

  /* 保存 data.json 到 GitHub */
  async save(data) {
    if (!this.token) throw new Error("请先设置 GitHub Token");
    if (!this.sha) {
      // If no SHA, try loading first to get it
      try { await this.load(); } catch (e) { /* ignore */ }
    }
    const path = "/repos/" + this.owner + "/" + this.repo + "/contents/" + this.dataPath;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = {
      message: "更新人才数据 " + new Date().toLocaleString("zh-CN"),
      content: content,
      branch: this.branch
    };
    if (this.sha) body.sha = this.sha;
    const result = await this.api("PUT", path, body);
    this.sha = result.content.sha;
    return result;
  },

  /* 测试 token 是否有效 */
  async test() {
    const user = await this.api("GET", "/user");
    return user.login;
  }
};
