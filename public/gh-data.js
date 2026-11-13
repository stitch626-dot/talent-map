/* ==========================================================================
   GitHub 数据适配层 — 替换 ApiClient，对接 GitHub 云存储
   ========================================================================== */

const GH_DATA_MODE = (typeof GitHubStorage !== "undefined" && window.location.hostname.includes("github.io"));

if (GH_DATA_MODE) {

  /* ---------- 覆盖 ApiClient 使用 GitHub 存储 ---------- */
  const _origRequest = ApiClient.request;

  // 登录/注册：纯客户端验证
  ApiClient._ghUsers = null;

  ApiClient.login = async function(email, password) {
    const data = await GitHubStorage.load();
    const users = data.users || [];
    ApiClient._ghUsers = users;
    const user = users.find(u => u.email === email);
    if (!user) throw new Error("账号不存在");
    // 简单密码验证（与服务器端 hash 逻辑一致）
    const pwHash = await sha256(password + "salt-talentmap");
    if (user.password !== pwHash) throw new Error("密码错误");
    const token = btoa(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, exp: Date.now() + 86400000 }));
    ApiClient.setToken(token);
    ApiClient.user = { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor };
    return ApiClient.user;
  };

  ApiClient.me = async function() {
    if (!ApiClient.getToken()) return null;
    return ApiClient.user;
  };

  // 数据操作：通过 GitHub 存储
  ApiClient.getSpace = async function() {
    const d = await GitHubStorage.load();
    return {
      space: d.space || { name: "我的团队空间" },
      members: (d.users || []).map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatarColor: u.avatarColor || "#1f5eff" })),
      settings: d.settings || {},
      tags: d.settings?.tags || []
    };
  };

  ApiClient.getCompanies = async function() {
    const d = await GitHubStorage.load();
    return (d.companies || []).filter(c => !c.deleted_at).map(c => ({
      id: c.id, name: c.name, industry: c.industry || "", city: c.city || "",
      note: c.notes || "", createdAt: c.created_at, updatedAt: c.updated_at,
      deletedAt: c.deleted_at || null
    }));
  };

  ApiClient.getTalents = async function(status) {
    const d = await GitHubStorage.load();
    let talents = d.talents || [];
    if (status) talents = talents.filter(t => t.status === status);
    else talents = talents.filter(t => t.status !== "trash");
    talents.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    return talents.map(t => _mapTalent(t, d));
  };

  ApiClient.getTalent = async function(id) {
    const d = await GitHubStorage.load();
    const t = d.talents.find(x => x.id === id);
    if (!t) throw new Error("不存在");
    return _mapTalent(t, d);
  };

  ApiClient.createTalent = async function(b) {
    const d = await GitHubStorage.load();
    if (!d.talents) d.talents = [];
    const t = {
      id: "talent_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      name: b.name || "待确认",
      current_company: b.currentCompany || "",
      current_position: b.currentPosition || "",
      level: b.level || "", city: b.city || "",
      phone: b.phone || "", email: b.email || "",
      work_years: b.workYears || "", tags: "[]",
      owner_id: "u_admin",
      contact_status: b.contactStatus || "未接触",
      last_contact_date: b.lastContactDate || "",
      onboard_date: b.onboardDate || "",
      giveup_reason: b.giveupReason || "",
      status: b.status || "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1, created_by: "贾洪爽",
      merged_to_id: null, note: b.note || ""
    };
    d.talents.push(t);
    // Handle positions
    if (!d.talentPositions) d.talentPositions = [];
    if (b.positions) {
      b.positions.forEach(p => {
        d.talentPositions.push({ talent_id: t.id, position_id: p.positionId, rating: p.rating || "未评级", associated_at: new Date().toISOString() });
      });
    }
    await GitHubStorage.save(d);
    return _mapTalent(t, d);
  };

  ApiClient.updateTalent = async function(id, b) {
    const d = await GitHubStorage.load();
    const t = d.talents.find(x => x.id === id);
    if (!t) throw new Error("不存在");
    if (b.name !== undefined) t.name = b.name;
    if (b.currentCompany !== undefined) t.current_company = b.currentCompany;
    if (b.currentPosition !== undefined) t.current_position = b.currentPosition;
    if (b.level !== undefined) t.level = b.level;
    if (b.city !== undefined) t.city = b.city;
    if (b.phone !== undefined) t.phone = b.phone;
    if (b.email !== undefined) t.email = b.email;
    if (b.workYears !== undefined) t.work_years = b.workYears;
    if (b.contactStatus !== undefined) t.contact_status = b.contactStatus;
    if (b.lastContactDate !== undefined) t.last_contact_date = b.lastContactDate;
    if (b.onboardDate !== undefined) t.onboard_date = b.onboardDate;
    if (b.giveupReason !== undefined) t.giveup_reason = b.giveupReason;
    if (b.status !== undefined) t.status = b.status;
    if (b.note !== undefined) t.note = b.note;
    t.updated_at = new Date().toISOString();
    // Positions
    if (b.positions) {
      if (!d.talentPositions) d.talentPositions = [];
      b.positions.forEach(p => {
        const existing = d.talentPositions.find(tp => tp.talent_id === id && tp.position_id === p.positionId);
        if (existing) { existing.rating = p.rating || existing.rating; }
        else { d.talentPositions.push({ talent_id: id, position_id: p.positionId, rating: p.rating || "未评级", associated_at: new Date().toISOString() }); }
      });
    }
    await GitHubStorage.save(d);
    return _mapTalent(t, d);
  };

  ApiClient.deleteTalent = async function(id) {
    const d = await GitHubStorage.load();
    const t = d.talents.find(x => x.id === id);
    if (t) t.status = "trash";
    await GitHubStorage.save(d);
  };

  /* ---------- 辅助：映射人才字段 ---------- */
  function _mapTalent(t, d) {
    const positions = (d.talentPositions || []).filter(tp => tp.talent_id === t.id).map(tp => {
      const p = (d.positions || []).find(x => x.id === tp.position_id);
      const c = p ? (d.companies || []).find(x => x.id === p.company_id) : null;
      return {
        positionId: tp.position_id, rating: tp.rating, associatedAt: tp.associated_at,
        positionName: p ? p.name : "", companyId: p ? p.company_id : "", companyName: c ? c.name : ""
      };
    });
    const we = (d.workExperiences || []).filter(w => w.talent_id === t.id);
    const comms = (d.communicationRecords || []).filter(c => c.talent_id === t.id);
    const reminders = (d.reminders || []).filter(r => r.talent_id === t.id);

    return {
      id: t.id, name: t.name,
      currentCompany: t.current_company, currentPosition: t.current_position,
      level: t.level, city: t.city, phone: t.phone, email: t.email,
      workYears: t.work_years, tags: (() => { try { return JSON.parse(t.tags || "[]"); } catch { return []; } })(),
      ownerId: t.owner_id, contactStatus: t.contact_status,
      lastContactDate: t.last_contact_date, onboardDate: t.onboard_date,
      giveupReason: t.giveup_reason, status: t.status,
      createdAt: t.created_at, updatedAt: t.updated_at,
      version: t.version || 1, createdBy: t.created_by,
      positions, workExperiences: we,
      communicationRecords: comms, reminders,
      resumeFiles: [], activityLogs: []
    };
  }

  /* ---------- SHA256 客户端实现 ---------- */
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- 补充：Company/Position/Communication CRUD ---------- */
  ApiClient.createCompany = async function(data) {
    const d = await GitHubStorage.load();
    if (!d.companies) d.companies = [];
    const c = { id: "comp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), name: data.name, industry: data.industry || "", city: data.city || "", notes: data.note || "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.companies.push(c);
    await GitHubStorage.save(d);
    return { id: c.id, name: c.name };
  };

  ApiClient.updateCompany = async function(id, data) {
    const d = await GitHubStorage.load();
    const c = d.companies.find(x => x.id === id);
    if (!c) throw new Error("不存在");
    if (data.name !== undefined) c.name = data.name;
    if (data.industry !== undefined) c.industry = data.industry;
    if (data.city !== undefined) c.city = data.city;
    if (data.note !== undefined) c.notes = data.note;
    c.updated_at = new Date().toISOString();
    await GitHubStorage.save(d);
  };

  ApiClient.deleteCompany = async function(id) {
    const d = await GitHubStorage.load();
    const c = d.companies.find(x => x.id === id);
    if (c) c.deleted_at = new Date().toISOString();
    await GitHubStorage.save(d);
  };

  ApiClient.createPosition = async function(cid, data) {
    const d = await GitHubStorage.load();
    if (!d.positions) d.positions = [];
    const p = { id: "pos_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), name: data.name, company_id: cid, func: data.func || "其他", level: data.level || "不限", city: data.city || "", status: "盘点中", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.positions.push(p);
    await GitHubStorage.save(d);
    return p;
  };

  ApiClient.getCompanyPositions = async function(cid) {
    const d = await GitHubStorage.load();
    return (d.positions || []).filter(p => p.company_id === cid && !p.deleted_at);
  };

  ApiClient.addCommunication = async function(tid, data) {
    const d = await GitHubStorage.load();
    if (!d.communicationRecords) d.communicationRecords = [];
    d.communicationRecords.push({
      id: "comm_" + Date.now(),
      talent_id: tid,
      date: data.date || "",
      method: data.method || "",
      content: data.content || "",
      created_by: "贾洪爽",
      created_at: new Date().toISOString()
    });
    await GitHubStorage.save(d);
  };

  ApiClient.addReminder = async function(tid, data) {
    const d = await GitHubStorage.load();
    if (!d.reminders) d.reminders = [];
    d.reminders.push({
      id: "rem_" + Date.now(),
      talent_id: tid,
      date: data.date || "",
      note: data.note || "",
      status: "pending",
      created_by: "贾洪爽"
    });
    await GitHubStorage.save(d);
  };

  ApiClient.addWorkExperience = async function(tid, data) {
    const d = await GitHubStorage.load();
    if (!d.workExperiences) d.workExperiences = [];
    d.workExperiences.push({
      id: "we_" + Date.now(),
      talent_id: tid,
      company: data.company || "",
      position: data.position || "",
      start_date: data.startDate || "",
      end_date: data.endDate || "",
      content: data.content || "",
      sort_order: (d.workExperiences || []).filter(x => x.talent_id === tid).length
    });
    await GitHubStorage.save(d);
  };

  ApiClient.deleteCommunication = async function(cid) {
    const d = await GitHubStorage.load();
    if (!d.communicationRecords) return;
    const idx = d.communicationRecords.findIndex(x => x.id === cid);
    if (idx >= 0) d.communicationRecords.splice(idx, 1);
    await GitHubStorage.save(d);
  };

  // Settings
  ApiClient.getSettings = async function() {
    const d = await GitHubStorage.load();
    return d.settings || {};
  };

  ApiClient.updateSettings = async function(s) {
    const d = await GitHubStorage.load();
    d.settings = { ...(d.settings || {}), ...s };
    await GitHubStorage.save(d);
  };

  ApiClient.testFeishu = async function() {
    // Feishu test: use webhook directly
    const d = await GitHubStorage.load();
    const webhook = (d.settings || {}).feishuWebhook;
    if (!webhook) throw new Error("未配置飞书 Webhook");
    const body = JSON.stringify({ msg_type: "text", content: { text: "✅ 人才地图测试消息" } });
    const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const r = await res.json();
    if (r.code !== 0) throw new Error(r.msg || "发送失败");
    return r;
  };

  console.log("[GH] GitHub 云存储模式已启用");
}
