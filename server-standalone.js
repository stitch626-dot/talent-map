// server-standalone.js — 零依赖服务器，无需 npm install
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const https = require('https');

const PORT = process.env.PORT || 3456;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = 'talent-map-secret-change-me';
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// ====== JWT ======
function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}
function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (sig !== parts[2]) return null;
    return payload;
  } catch { return null; }
}

// ====== 密码哈希 ======
function hashPassword(pw) { return crypto.createHash('sha256').update(pw + 'salt-talentmap').digest('hex'); }

// ====== 数据 ======
function loadData() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return null; } }
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  // auto-backup
  try {
    const d = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    fs.writeFileSync(DATA_FILE + ".backup-" + d, JSON.stringify(data, null, 2));
    // keep only last 5 backups
    const backups = fs.readdirSync(__dirname).filter(f => f.startsWith("data.json.backup-")).sort().reverse();
    backups.slice(5).forEach(f => { try { fs.unlinkSync(f); } catch {} });
  } catch {}
}

function initData() {
  const d = loadData();
  if (d) return d;
  const fresh = {
    users: [{ id: 'u_admin', name: '贾洪爽', email: 'admin@talentmap.com', password: hashPassword('admin123'), role: 'admin', avatarColor: '#1f5eff' }],
    space: { name: '贾洪爽 的团队空间' },
    companies: [], positions: [], talents: [], talentPositions: [],
    resumeFiles: [], communicationRecords: [], reminders: [], activityLogs: [], workExperiences: [], invites: [], settings: { feishuWebhook: '' }
  };
  saveData(fresh);
  return fresh;
}
let DB = initData();

function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'); }


function sendFeishuMsg(webhookUrl, title, content) {
  if (!webhookUrl) return;
  return new Promise((resolve) => {
    try {
      const u = new URL(webhookUrl);
      const body = JSON.stringify({
        msg_type: 'interactive',
        card: { header: { title: { tag: 'plain_text', content: title }, template: 'blue' }, elements: [{ tag: 'markdown', content: content }] }
      });
      const req = https.request({
        hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => { resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
      req.write(body); req.end();
    } catch { resolve(false); }
  });
}
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
  });
}
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function err(res, msg, status = 400) { json(res, { error: msg }, status); }
function getUser(req) {
  const a = req.headers['authorization'];
  if (!a || !a.startsWith('Bearer ')) return null;
  return verifyToken(a.slice(7));
}
function auth(req, res) {
  const u = getUser(req);
  if (!u) { err(res, '未登录', 401); return null; }
  return u;
}

function mapTalent(t) {
  const tags = (() => { try { return JSON.parse(t.tags || '[]'); } catch { return []; } })();
  const positions = DB.talentPositions.filter(tp => tp.talent_id === t.id).map(tp => {
    const p = DB.positions.find(x => x.id === tp.position_id);
    const c = p ? DB.companies.find(x => x.id === p.company_id) : null;
    return { positionId: tp.position_id, rating: tp.rating, associatedAt: tp.associated_at, positionName: p ? p.name : '', companyId: p ? p.company_id : '', companyName: c ? c.name : '' };
  });
  const we = DB.workExperiences.filter(w => w.talent_id === t.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const resumeFiles = DB.resumeFiles.filter(f => f.talent_id === t.id).map(f => ({ id: f.id, name: f.name, size: f.size }));
  const comms = DB.communicationRecords.filter(c => c.talent_id === t.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const reminders = DB.reminders.filter(r => r.talent_id === t.id);
  const logs = DB.activityLogs.filter(l => l.talent_id === t.id).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20);
  return {
    id: t.id, name: t.name, currentCompany: t.current_company, currentPosition: t.current_position,
    level: t.level, city: t.city, phone: t.phone, email: t.email, workYears: t.work_years,
    tags, ownerId: t.owner_id, contactStatus: t.contact_status, lastContactDate: t.last_contact_date,
    onboardDate: t.onboard_date, giveupReason: t.giveup_reason, status: t.status,
    createdAt: t.created_at, updatedAt: t.updated_at, version: t.version, createdBy: t.created_by,
    positions, workExperiences: we.map(w => ({ id: w.id, company: w.company, position: w.position, startDate: w.start_date, endDate: w.end_date, content: w.content })),
    resumeFiles,
    communicationRecords: comms.map(c => ({ id: c.id, date: c.date, method: c.method, content: c.content, createdBy: c.created_by, createdAt: c.created_at, deletedAt: c.deleted_at, deletedBy: c.deleted_by })),
    reminders: reminders.map(r => ({ id: r.id, date: r.date, note: r.note, status: r.status, createdBy: r.created_by })),
    activityLogs: logs.map(a => ({ id: a.id, type: a.type, actor: a.actor, time: a.time, summary: a.summary }))
  };
}

// ====== 路由 ======
const routes = [];
function addRoute(method, pattern, handler) {
  routes.push({ method, pattern: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), handler });
}

// Auth
addRoute('POST', '/api/auth/login', async (req, res) => {
  const { email, password } = await parseBody(req);
  if (!email || !password) return err(res, '请输入邮箱和密码');
  const user = DB.users.find(u => u.email === email.trim().toLowerCase());
  if (!user || user.password !== hashPassword(password)) return err(res, '邮箱或密码错误', 401);
  const token = createToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  json(res, { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor } });
});
addRoute('POST', '/api/auth/register', async (req, res) => {
  const { name, email, password } = await parseBody(req);
  if (!name || !email || !password) return err(res, '请填写完整');
  if (DB.users.find(u => u.email === email.trim().toLowerCase())) return err(res, '该邮箱已注册');
  const isFirst = DB.users.length === 0;
  const user = { id: uid('u'), name, email: email.trim().toLowerCase(), password: hashPassword(password), role: isFirst ? 'admin' : 'member', avatarColor: '#1f5eff' };
  DB.users.push(user); saveData(DB);
  const token = createToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  json(res, { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor } });
});
addRoute('GET', '/api/auth/me', async (req, res) => {
  const u = auth(req, res); if (!u) return;
  const user = DB.users.find(x => x.id === u.id);
  if (!user) return err(res, '用户不存在', 404);
  json(res, { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor });
});

// Space / members
addRoute('GET', '/api/space', async (req, res) => {
  if (!auth(req, res)) return;
  json(res, {
    space: DB.space,
    settings: DB.settings || { feishuWebhook: '' },
    members: DB.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatarColor: u.avatarColor })),
    tags: [...new Set(DB.talents.filter(t => t.status !== 'trash').flatMap(t => { try { return JSON.parse(t.tags || '[]'); } catch { return []; } }))]
  });
});
addRoute('POST', '/api/space/name', async (req, res) => { const u = auth(req, res); if (!u) return; DB.space.name = (await parseBody(req)).name || ''; saveData(DB); json(res, { ok: true });
  // feishu notification
  const ft = DB.talents.find(x => x.id === id);
  const wh = DB.settings && DB.settings.feishuWebhook;
  if (wh && ft) {
    sendFeishuMsg(wh,
      '沟通记录 - ' + (ft.name || '未知'),
      '人选：' + (ft.name || '未知') + '\n公司：' + (ft.current_company || '未知') + '\n职位：' + (ft.current_position || '未知') + '\n沟通方式：' + (b.method || '其他') + '\n内容：' + (b.content || '无') + '\n操作人：' + u.name
    );
  } });
addRoute('POST', '/api/invite', async (req, res) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const { email } = await parseBody(req);
  if (!email) return err(res, '请输入邮箱');
  if (DB.users.find(x => x.email === email.trim().toLowerCase())) return err(res, '该邮箱已加入');
  const token = crypto.randomBytes(16).toString('hex');
  DB.invites.push({ id: uid('inv'), email: email.trim().toLowerCase(), token, expires_at: new Date(Date.now() + 86400000).toISOString(), used: false });
  saveData(DB);
  json(res, { link: '/join?token=' + token, email });
});
addRoute('POST', '/api/members/role', async (req, res) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const { userId, role } = await parseBody(req);
  const target = DB.users.find(x => x.id === userId);
  if (!target) return err(res, '成员不存在');
  if (role === 'member' && target.role === 'admin' && DB.users.filter(x => x.role === 'admin').length <= 1) return err(res, '至少保留1名管理员');
  target.role = role; saveData(DB); json(res, { ok: true });
});
addRoute('POST', '/api/members/remove', async (req, res) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const { userId } = await parseBody(req);
  if (userId === u.id) return err(res, '不能移除自己');
  DB.users = DB.users.filter(x => x.id !== userId);
  DB.talents.forEach(t => { if (t.owner_id === userId) t.owner_id = u.id; });
  saveData(DB); json(res, { ok: true });
});

// Companies
addRoute('GET', '/api/companies', async (req, res) => {
  if (!auth(req, res)) return;
  const companies = DB.companies.filter(c => !c.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  json(res, companies.map(c => {
    const posIds = DB.positions.filter(p => p.company_id === c.id && !p.deleted_at).map(p => p.id);
    const ratings = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
    let talentCount = 0;
    const seen = new Set();
    DB.talentPositions.filter(tp => posIds.includes(tp.position_id)).forEach(tp => {
      const t = DB.talents.find(x => x.id === tp.talent_id);
      if (t && t.status === 'active') {
        if (!seen.has(t.id)) { seen.add(t.id); talentCount++; }
        const r = tp.rating || '未评级'; ratings[r] = (ratings[r] || 0) + 1;
      }
    });
    return { ...c, positionCount: posIds.length, talentCount, ratings };
  }));
});
addRoute('POST', '/api/companies', async (req, res) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  if (!b.name || !b.name.trim()) return err(res, '请输入公司名称');
  if (DB.companies.find(c => c.name === b.name.trim() && !c.deleted_at)) return err(res, '该公司已存在');
  const company = { id: uid('comp'), name: b.name.trim(), industry: b.industry || '', scale: b.scale || '未知', city: b.city || '', priority: b.priority || '中', note: b.note || '', deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  DB.companies.push(company); saveData(DB); json(res, company);
});
addRoute('PUT', '/api/companies/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  const c = DB.companies.find(x => x.id === id);
  if (!c) return err(res, '不存在', 404);
  Object.assign(c, { name: b.name || c.name, industry: b.industry || '', scale: b.scale || '未知', city: b.city || '', priority: b.priority || '中', note: b.note || '', updated_at: new Date().toISOString() });
  saveData(DB); json(res, c);
});
addRoute('DELETE', '/api/companies/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const c = DB.companies.find(x => x.id === id);
  if (!c) return err(res, '不存在', 404);
  c.deleted_at = new Date().toISOString();
  DB.positions.filter(p => p.company_id === id).forEach(p => p.deleted_at = c.deleted_at);
  saveData(DB); json(res, { ok: true });
});

// Positions
addRoute('GET', '/api/companies/:id/positions', async (req, res, id) => {
  if (!auth(req, res)) return;
  const positions = DB.positions.filter(p => p.company_id === id && !p.deleted_at).sort((a, b) => (a.status === '盘点中' ? -1 : 1) || b.updated_at.localeCompare(a.updated_at));
  json(res, positions.map(p => {
    const tps = DB.talentPositions.filter(tp => tp.position_id === p.id);
    const ratings = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
    tps.forEach(tp => { const t = DB.talents.find(x => x.id === tp.talent_id); if (t && t.status === 'active') { const r = tp.rating || '未评级'; ratings[r] = (ratings[r] || 0) + 1; } });
    return { ...p, ratings, talentCount: tps.filter(tp => { const t = DB.talents.find(x => x.id === tp.talent_id); return t && t.status === 'active'; }).length };
  }));
});
addRoute('POST', '/api/companies/:id/positions', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  if (!b.name || !b.name.trim()) return err(res, '请输入职位名称');
  if (DB.positions.find(p => p.company_id === id && p.name === b.name.trim() && !p.deleted_at)) return err(res, '该职位已存在');
  const pos = { id: uid('pos'), company_id: id, name: b.name.trim(), func: b.func || '其他', level: b.level || '不限', city: b.city || '', status: b.status || '盘点中', deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  DB.positions.push(pos); saveData(DB); json(res, pos);
});
addRoute('PUT', '/api/positions/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  const p = DB.positions.find(x => x.id === id);
  if (!p) return err(res, '不存在', 404);
  Object.assign(p, { name: b.name || p.name, func: b.func || '其他', level: b.level || '不限', city: b.city || '', status: b.status || '盘点中', updated_at: new Date().toISOString() });
  saveData(DB); json(res, p);
});
addRoute('DELETE', '/api/positions/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const p = DB.positions.find(x => x.id === id);
  if (!p) return err(res, '不存在', 404);
  p.deleted_at = new Date().toISOString(); saveData(DB); json(res, { ok: true });
});

// Talents
addRoute('GET', '/api/talents', async (req, res) => {
  if (!auth(req, res)) return;
  const status = new URL(req.url, 'http://x').searchParams.get('status');
  let talents = DB.talents;
  if (status) talents = talents.filter(t => t.status === status);
  else talents = talents.filter(t => t.status !== 'trash');
  talents.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  json(res, talents.map(mapTalent));
});
addRoute('GET', '/api/talents/:id', async (req, res, id) => {
  if (!auth(req, res)) return;
  const t = DB.talents.find(x => x.id === id);
  if (!t) return err(res, '不存在', 404);
  json(res, mapTalent(t));
});
addRoute('POST', '/api/talents', async (req, res) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  const t = { id: uid('talent'), name: b.name || '待确认', current_company: b.currentCompany || '', current_position: b.currentPosition || '', level: b.level || '', city: b.city || '', phone: b.phone || '', email: b.email || '', work_years: b.workYears || '', tags: JSON.stringify(b.tags || []), owner_id: b.ownerId || u.id, contact_status: b.contactStatus || '未接触', last_contact_date: b.lastContactDate || '', onboard_date: b.onboardDate || '', giveup_reason: b.giveupReason || '', status: b.status || 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1, created_by: u.name, merged_to_id: null, note: '' };
  DB.talents.push(t);
  if (b.positions) b.positions.forEach(p => { if (!DB.talentPositions.find(tp => tp.talent_id === t.id && tp.position_id === p.positionId)) DB.talentPositions.push({ talent_id: t.id, position_id: p.positionId, rating: p.rating || '未评级', associated_at: new Date().toISOString() }); });
  if (b.workExperiences) b.workExperiences.forEach(w => DB.workExperiences.push({ talent_id: t.id, company: w.company || '', position: w.position || '', start_date: w.startDate || '', end_date: w.endDate || '', content: w.content || '', sort_order: DB.workExperiences.filter(x => x.talent_id === t.id).length }));
  saveData(DB); json(res, mapTalent(t));
});
addRoute('PUT', '/api/talents/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  const t = DB.talents.find(x => x.id === id);
  if (!t) return err(res, '不存在', 404);
  Object.assign(t, {
    name: b.name ?? t.name, current_company: b.currentCompany ?? t.current_company, current_position: b.currentPosition ?? t.current_position,
    level: b.level ?? t.level, city: b.city ?? t.city, phone: b.phone ?? t.phone, email: b.email ?? t.email,
    work_years: b.workYears ?? t.work_years, tags: b.tags !== undefined ? JSON.stringify(b.tags) : t.tags,
    owner_id: b.ownerId ?? t.owner_id, contact_status: b.contactStatus ?? t.contact_status,
    last_contact_date: b.lastContactDate ?? t.last_contact_date, onboard_date: b.onboardDate ?? t.onboard_date,
    giveup_reason: b.giveupReason ?? t.giveup_reason, status: b.status ?? t.status,
    updated_at: new Date().toISOString(), version: (t.version || 0) + 1
  });
  if (b.positions) { DB.talentPositions = DB.talentPositions.filter(tp => tp.talent_id !== id); b.positions.forEach(p => DB.talentPositions.push({ talent_id: id, position_id: p.positionId, rating: p.rating || '未评级', associated_at: new Date().toISOString() })); }
  saveData(DB); json(res, mapTalent(t));
});
addRoute('DELETE', '/api/talents/:id', async (req, res, id) => {
  if (!auth(req, res)) return;
  const t = DB.talents.find(x => x.id === id);
  if (!t) return err(res, '不存在', 404);
  t.status = 'trash'; t.updated_at = new Date().toISOString();
  DB.reminders.filter(r => r.talent_id === id && r.status === 'pending').forEach(r => r.status = 'closed');
  saveData(DB); json(res, { ok: true });
  // feishu notification
  const ftr = DB.talents.find(x => x.id === id);
  const whr = DB.settings && DB.settings.feishuWebhook;
  if (whr && ftr) {
    sendFeishuMsg(whr,
      '阶段提醒 - ' + (ftr.name || '未知'),
      '人选：' + (ftr.name || '未知') + '\n公司：' + (ftr.current_company || '未知') + '\n提醒日期：' + (b.date || '') + '\n备注：' + (b.note || '无') + '\n操作人：' + u.name
    );
  }
});
addRoute('POST', '/api/talents/:id/restore', async (req, res, id) => {
  if (!auth(req, res)) return;
  const t = DB.talents.find(x => x.id === id);
  if (!t) return err(res, '不存在', 404);
  t.status = 'active'; t.updated_at = new Date().toISOString(); saveData(DB); json(res, { ok: true });
});
addRoute('DELETE', '/api/talents/:id/permanent', async (req, res, id) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  DB.workExperiences = DB.workExperiences.filter(x => x.talent_id !== id);
  DB.talentPositions = DB.talentPositions.filter(x => x.talent_id !== id);
  DB.communicationRecords = DB.communicationRecords.filter(x => x.talent_id !== id);
  DB.reminders = DB.reminders.filter(x => x.talent_id !== id);
  DB.activityLogs = DB.activityLogs.filter(x => x.talent_id !== id);
  DB.resumeFiles = DB.resumeFiles.filter(x => x.talent_id !== id);
  DB.talents = DB.talents.filter(x => x.id !== id);
  saveData(DB); json(res, { ok: true });
});

// Communications / reminders / work experiences / logs
addRoute('POST', '/api/talents/:id/communications', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  DB.communicationRecords.push({ id: uid('comm'), talent_id: id, date: b.date, method: b.method || '其他', content: b.content || '', created_by: u.name, created_at: new Date().toISOString(), deleted_at: null, deleted_by: null });
  const t = DB.talents.find(x => x.id === id);
  if (t && t.contact_status === '未接触') { t.contact_status = '已联系'; t.last_contact_date = b.date; } else if (t) { t.last_contact_date = b.date; }
  saveData(DB); json(res, { ok: true });
});
addRoute('DELETE', '/api/communications/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const c = DB.communicationRecords.find(x => x.id === id);
  if (!c) return err(res, '不存在', 404);
  c.deleted_at = new Date().toISOString(); c.deleted_by = u.name; saveData(DB); json(res, { ok: true });
});
addRoute('POST', '/api/talents/:id/reminders', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  DB.reminders.filter(r => r.talent_id === id && r.status === 'pending').forEach(r => r.status = 'closed');
  DB.reminders.push({ id: uid('rem'), talent_id: id, date: b.date, note: b.note || '', status: 'pending', created_by: u.name });
  saveData(DB); json(res, { ok: true });
});
addRoute('PUT', '/api/reminders/:id', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  const r = DB.reminders.find(x => x.id === id);
  if (!r) return err(res, '不存在', 404);
  if (b.date) r.date = b.date;
  if (b.status) r.status = b.status;
  saveData(DB); json(res, { ok: true });
});
addRoute('POST', '/api/talents/:id/work-experiences', async (req, res, id) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  DB.workExperiences.push({ talent_id: id, company: b.company || '', position: b.position || '', start_date: b.startDate || '', end_date: b.endDate || '', content: b.content || '', sort_order: DB.workExperiences.filter(x => x.talent_id === id).length });
  saveData(DB); json(res, { ok: true });
});
addRoute('DELETE', '/api/work-experiences/:id', async (req, res, id) => {
  if (!auth(req, res)) return;
  DB.workExperiences = DB.workExperiences.filter(x => x.id !== parseInt(id));
  saveData(DB); json(res, { ok: true });
});
addRoute('POST', '/api/activity-logs', async (req, res) => {
  const u = auth(req, res); if (!u) return;
  const b = await parseBody(req);
  DB.activityLogs.push({ id: uid('log'), talent_id: b.talentId, type: b.type || '', actor: u.name, actor_id: u.id, time: new Date().toISOString(), summary: b.summary || '', changes: b.changes || null });
  saveData(DB); json(res, { ok: true });
});

// Settings / Feishu
addRoute('GET', '/api/settings', async (req, res) => {
  const u = auth(req, res); if (!u) return;
  json(res, DB.settings || { feishuWebhook: '' });
});
addRoute('PUT', '/api/settings', async (req, res) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const b = await parseBody(req);
  if (b.feishuWebhook !== undefined) {
    if (!DB.settings) DB.settings = {};
    DB.settings.feishuWebhook = b.feishuWebhook;
  }
  saveData(DB); json(res, { ok: true });
});
addRoute('POST', '/api/feishu/test', async (req, res) => {
  const u = auth(req, res); if (!u || u.role !== 'admin') return err(res, '仅管理员', 403);
  const webhook = DB.settings && DB.settings.feishuWebhook;
  if (!webhook) return err(res, '请先配置飞书 Webhook 地址');
  const ok = await sendFeishuMsg(webhook, '人才地图 - 测试消息', '飞书集成配置成功！🎉\n来自人才地图系统的测试消息。');
  if (ok) json(res, { ok: true, msg: '测试消息已发送' });
  else err(res, '发送失败，请检查 Webhook 地址是否正确');
});

// Export
addRoute('GET', '/api/export/talents', async (req, res) => {
  if (!auth(req, res)) return;
  const talents = DB.talents.filter(t => t.status === 'active').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const header = '姓名,当前公司,当前职位,级别,城市,手机,邮箱,接触状态,标签,归属人,最近更新时间';
  const lines = talents.map(t => {
    const tags = (() => { try { return JSON.parse(t.tags || '[]').join(';'); } catch { return ''; } })();
    return [t.name, t.current_company, t.current_position, t.level, t.city, t.phone, t.email, t.contact_status, tags, t.created_by, t.updated_at].map(v => '"' + (v || '') + '"').join(',');
  });
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="talents.csv"' });
  res.end('\uFEFF' + header + '\n' + lines.join('\n'));
});

// ====== 静态文件 + SPA fallback ======
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname;
  for (const route of routes) {
    const match = url.match(route.pattern);
    if (match && req.method === route.method) { route.handler(req, res, ...match.slice(1)); return; }
  }
  let filePath = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  if (!fs.existsSync(filePath)) filePath = path.join(__dirname, 'public', 'index.html');
  try {
    let content = fs.readFileSync(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    if ((/text|javascript|json|css/.test(contentType)) && acceptEncoding.includes('gzip') && content.length > 1024) {
      content = zlib.gzipSync(content);
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Encoding': 'gzip' });
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
    }
    res.end(content);
  } catch {
    res.writeHead(404); res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  人才地图 服务器已启动');
  console.log('  本地访问: http://localhost:' + PORT);
  console.log('  管理员: admin@talentmap.com / admin123');
  console.log('  数据文件: ' + DATA_FILE);
  console.log('========================================');
  console.log('');
});
