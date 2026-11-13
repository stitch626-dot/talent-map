const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3456;
const JWT_SECRET = process.env.JWT_SECRET || 'talent-map-secret-change-in-production';
const TOKEN_EXPIRY = '30d';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database('talent-map.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ====== Database Schema ======
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'member' CHECK(role IN ('admin','member')),
    avatar_color TEXT DEFAULT '#1f5eff',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS spaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '我的团队空间'
  );

  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT DEFAULT '',
    scale TEXT DEFAULT '未知',
    city TEXT DEFAULT '',
    priority TEXT DEFAULT '中' CHECK(priority IN ('高','中','低')),
    note TEXT DEFAULT '',
    deleted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    func TEXT DEFAULT '其他',
    level TEXT DEFAULT '不限',
    city TEXT DEFAULT '',
    status TEXT DEFAULT '盘点中' CHECK(status IN ('盘点中','已暂停','已完成')),
    deleted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS talents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '待确认',
    current_company TEXT DEFAULT '',
    current_position TEXT DEFAULT '',
    level TEXT DEFAULT '',
    city TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    work_years TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    owner_id TEXT REFERENCES users(id),
    contact_status TEXT DEFAULT '未接触',
    last_contact_date TEXT DEFAULT '',
    onboard_date TEXT DEFAULT '',
    giveup_reason TEXT DEFAULT '',
    status TEXT DEFAULT 'active' CHECK(status IN ('draft','active','archived','trash')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    created_by TEXT DEFAULT '',
    merged_to_id TEXT,
    note TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS talent_positions (
    talent_id TEXT NOT NULL REFERENCES talents(id),
    position_id TEXT NOT NULL REFERENCES positions(id),
    rating TEXT DEFAULT '未评级' CHECK(rating IN ('S','A','B','C','未评级')),
    associated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (talent_id, position_id)
  );

  CREATE TABLE IF NOT EXISTS resume_files (
    id TEXT PRIMARY KEY,
    talent_id TEXT NOT NULL REFERENCES talents(id),
    name TEXT NOT NULL,
    size TEXT DEFAULT '',
    file_data BLOB,
    mime_type TEXT DEFAULT 'application/octet-stream',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS communication_records (
    id TEXT PRIMARY KEY,
    talent_id TEXT NOT NULL REFERENCES talents(id),
    date TEXT NOT NULL,
    method TEXT DEFAULT '其他',
    content TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    deleted_by TEXT
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    talent_id TEXT NOT NULL REFERENCES talents(id),
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done','closed')),
    created_by TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    talent_id TEXT,
    type TEXT DEFAULT '',
    actor TEXT DEFAULT '',
    actor_id TEXT,
    time TEXT DEFAULT (datetime('now')),
    summary TEXT DEFAULT '',
    changes TEXT
  );

  CREATE TABLE IF NOT EXISTS work_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    talent_id TEXT NOT NULL REFERENCES talents(id),
    company TEXT DEFAULT '',
    position TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    content TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  );
`);

// Insert default space if none exists
const spaceCount = db.prepare('SELECT COUNT(*) as cnt FROM spaces').get().cnt;
if (spaceCount === 0) {
  db.prepare('INSERT INTO spaces (name) VALUES (?)').run('贾洪爽 的团队空间');
}

// First-time setup: create admin user if none exist
const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
if (userCount === 0) {
  const adminId = 'u_admin';
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, avatar_color)
    VALUES (?, ?, ?, ?, 'admin', '#1f5eff')`).run(adminId, '贾洪爽', 'admin@talentmap.com', hash);
}

console.log('Database ready');

// ====== Auth Middleware ======
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录过期，请重新登录' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  next();
}

// ====== Auth Routes ======
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatar_color } });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: '请填写完整信息' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(400).json({ error: '该邮箱已注册' });
  const id = 'u_' + Date.now().toString(36);
  const hash = bcrypt.hashSync(password, 10);
  const isFirst = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt === 0;
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)')
    .run(id, name, email.trim().toLowerCase(), hash, isFirst ? 'admin' : 'member');
  const token = jwt.sign({ id, name, email: email.trim().toLowerCase(), role: isFirst ? 'admin' : 'member' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  res.json({ token, user: { id, name, email: email.trim().toLowerCase(), role: isFirst ? 'admin' : 'member', avatarColor: '#1f5eff' } });
});

app.post('/api/auth/accept-invite', (req, res) => {
  const { token, name, password } = req.body;
  const invite = db.prepare('SELECT * FROM invites WHERE token = ? AND used = 0 AND expires_at > datetime("now")').get(token);
  if (!invite) return res.status(400).json({ error: '邀请链接无效或已过期' });
  const id = 'u_' + Date.now().toString(36);
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,"member")')
    .run(id, name || invite.email.split('@')[0], invite.email, hash);
  db.prepare('UPDATE invites SET used = 1 WHERE id = ?').run(invite.id);
  const userToken = jwt.sign({ id, name: name || invite.email.split('@')[0], email: invite.email, role: 'member' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  res.json({ token: userToken, user: { id, name: name || invite.email.split('@')[0], email: invite.email, role: 'member', avatarColor: '#1f5eff' } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, avatar_color FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatar_color });
});

// ====== Space & Members ======
app.get('/api/space', authMiddleware, (req, res) => {
  const space = db.prepare('SELECT * FROM spaces LIMIT 1').get();
  const members = db.prepare('SELECT id, name, email, role, avatar_color FROM users').all();
  const tags = db.prepare("SELECT DISTINCT value FROM (SELECT value FROM json_each((SELECT group_concat(tags) FROM talents WHERE status != 'trash')))").all().map(r => r.value).filter(Boolean);
  res.json({ space, members: members.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role, avatarColor: m.avatar_color })), tags });
});

app.post('/api/space/name', authMiddleware, (req, res) => {
  db.prepare('UPDATE spaces SET name = ?').run(req.body.name || '');
  res.json({ ok: true });
});

app.post('/api/invite', authMiddleware, adminMiddleware, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '请输入邮箱' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(400).json({ error: '该邮箱已加入空间' });
  const token = require('crypto').randomBytes(16).toString('hex');
  const id = 'inv_' + Date.now().toString(36);
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  db.prepare('INSERT INTO invites (id, email, token, expires_at) VALUES (?,?,?,?)').run(id, email.trim().toLowerCase(), token, expiresAt);
  res.json({ link: '/join?token=' + token, email, expiresAt });
});

app.post('/api/members/role', authMiddleware, adminMiddleware, (req, res) => {
  const { userId, role } = req.body;
  if (role === 'member') {
    const admins = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get().cnt;
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    if (target && target.role === 'admin' && admins <= 1) return res.status(400).json({ error: '至少保留1名管理员' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  res.json({ ok: true });
});

app.post('/api/members/remove', authMiddleware, adminMiddleware, (req, res) => {
  const { userId } = req.body;
  if (userId === req.user.id) return res.status(400).json({ error: '不能移除自己' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: '成员不存在' });
  // Reassign ownership
  db.prepare('UPDATE talents SET owner_id = ? WHERE owner_id = ?').run(req.user.id, userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
});

// ====== Companies ======
app.get('/api/companies', authMiddleware, (req, res) => {
  const companies = db.prepare("SELECT * FROM companies WHERE deleted_at IS NULL ORDER BY priority = '高' DESC, updated_at DESC").all();
  const data = companies.map(c => {
    const positions = db.prepare('SELECT id FROM positions WHERE company_id = ? AND deleted_at IS NULL').all(c.id);
    const posIds = positions.map(p => p.id);
    let talents = [];
    if (posIds.length > 0) {
      const placeholders = posIds.map(() => '?').join(',');
      talents = db.prepare(`SELECT DISTINCT t.id FROM talents t
        JOIN talent_positions tp ON t.id = tp.talent_id
        WHERE tp.position_id IN (${placeholders}) AND t.status = 'active'`).all(...posIds);
    }
    const ratings = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
    if (posIds.length > 0) {
      const placeholders = posIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT tp.rating FROM talent_positions tp
        JOIN talents t ON t.id = tp.talent_id
        WHERE tp.position_id IN (${placeholders}) AND t.status = 'active'`).all(...posIds);
      rows.forEach(r => { const key = r.rating || '未评级'; ratings[key] = (ratings[key] || 0) + 1; });
    }
    return { ...c, positionCount: positions.length, talentCount: talents.length, ratings };
  });
  res.json(data);
});

app.post('/api/companies', authMiddleware, (req, res) => {
  const { name, industry, scale, city, priority, note } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入公司名称' });
  const normalized = name.trim();
  const existing = db.prepare('SELECT id FROM companies WHERE name = ? AND deleted_at IS NULL').get(normalized);
  if (existing) return res.status(400).json({ error: '该公司已存在' });
  const id = 'comp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO companies (id, name, industry, scale, city, priority, note) VALUES (?,?,?,?,?,?,?)')
    .run(id, normalized, industry || '', scale || '未知', city || '', priority || '中', note || '');
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  res.json(company);
});

app.put('/api/companies/:id', authMiddleware, (req, res) => {
  const { name, industry, scale, city, priority, note } = req.body;
  db.prepare("UPDATE companies SET name=?, industry=?, scale=?, city=?, priority=?, note=?, updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL")
    .run(name || '', industry || '', scale || '未知', city || '', priority || '中', note || '', req.params.id);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  res.json(company);
});

app.delete('/api/companies/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可删除公司' });
  const positions = db.prepare('SELECT id FROM positions WHERE company_id = ? AND deleted_at IS NULL').all(req.params.id);
  if (positions.length > 0) {
    db.prepare("UPDATE positions SET deleted_at = datetime('now') WHERE company_id = ?").run(req.params.id);
  }
  db.prepare("UPDATE companies SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/companies/:id/restore', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare("UPDATE companies SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/companies/:id/permanent', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ====== Positions ======
app.get('/api/companies/:companyId/positions', authMiddleware, (req, res) => {
  const positions = db.prepare('SELECT * FROM positions WHERE company_id = ? AND deleted_at IS NULL ORDER BY (status = "盘点中") DESC, updated_at DESC').all(req.params.companyId);
  const data = positions.map(p => {
    const rows = db.prepare(`SELECT tp.rating, t.status FROM talent_positions tp JOIN talents t ON t.id = tp.talent_id WHERE tp.position_id = ?`).all(p.id);
    const ratings = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
    rows.filter(r => r.status === 'active').forEach(r => { const key = r.rating || '未评级'; ratings[key] = (ratings[key] || 0) + 1; });
    const talentCount = rows.filter(r => r.status === 'active').length;
    return { ...p, ratings, talentCount };
  });
  res.json(data);
});

app.post('/api/companies/:companyId/positions', authMiddleware, (req, res) => {
  const { name, func, level, city, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入职位名称' });
  const existing = db.prepare('SELECT id FROM positions WHERE company_id = ? AND name = ? AND deleted_at IS NULL').get(req.params.companyId, name.trim());
  if (existing) return res.status(400).json({ error: '该职位已存在' });
  const id = 'pos_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO positions (id, company_id, name, func, level, city, status) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.params.companyId, name.trim(), func || '其他', level || '不限', city || '', status || '盘点中');
  res.json(db.prepare('SELECT * FROM positions WHERE id = ?').get(id));
});

app.put('/api/positions/:id', authMiddleware, (req, res) => {
  const { name, func, level, city, status } = req.body;
  db.prepare("UPDATE positions SET name=?, func=?, level=?, city=?, status=?, updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL")
    .run(name || '', func || '其他', level || '不限', city || '', status || '盘点中', req.params.id);
  res.json(db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id));
});

app.delete('/api/positions/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可删除职位' });
  db.prepare("UPDATE positions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/positions/:id/restore', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare("UPDATE positions SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ====== Talents ======
function mapTalent(row) {
  if (!row) return null;
  const tags = (() => { try { return JSON.parse(row.tags || '[]'); } catch { return []; } })();
  const positions = db.prepare('SELECT tp.position_id as positionId, tp.rating, tp.associated_at as associatedAt, p.name as positionName, p.company_id as companyId, c.name as companyName FROM talent_positions tp LEFT JOIN positions p ON tp.position_id = p.id LEFT JOIN companies c ON p.company_id = c.id WHERE tp.talent_id = ?').all(row.id);
  const workExperiences = db.prepare('SELECT id, company, position, start_date as startDate, end_date as endDate, content FROM work_experiences WHERE talent_id = ? ORDER BY sort_order, id').all(row.id);
  const resumeFiles = db.prepare('SELECT id, name, size FROM resume_files WHERE talent_id = ? ORDER BY created_at').all(row.id);
  const communicationRecords = db.prepare('SELECT * FROM communication_records WHERE talent_id = ? ORDER BY created_at DESC').all(row.id);
  const reminders = db.prepare('SELECT * FROM reminders WHERE talent_id = ? ORDER BY date').all(row.id);
  const activityLogs = db.prepare('SELECT * FROM activity_logs WHERE talent_id = ? ORDER BY time DESC LIMIT 20').all(row.id);
  return {
    id: row.id, name: row.name, currentCompany: row.current_company, currentPosition: row.current_position,
    level: row.level, city: row.city, phone: row.phone, email: row.email, workYears: row.work_years,
    tags, ownerId: row.owner_id, contactStatus: row.contact_status, lastContactDate: row.last_contact_date,
    onboardDate: row.onboard_date, giveupReason: row.giveup_reason, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, version: row.version, createdBy: row.created_by,
    mergedToId: row.merged_to_id, note: row.note,
    positions, workExperiences, resumeFiles,
    communicationRecords: communicationRecords.map(c => ({ id: c.id, date: c.date, method: c.method, content: c.content, createdBy: c.created_by, createdAt: c.created_at, deletedAt: c.deleted_at, deletedBy: c.deleted_by })),
    reminders: reminders.map(r => ({ id: r.id, date: r.date, note: r.note, status: r.status, createdBy: r.created_by })),
    activityLogs: activityLogs.map(a => ({ id: a.id, type: a.type, actor: a.actor, actorId: a.actor_id, time: a.time, summary: a.summary, changes: a.changes }))
  };
}

app.get('/api/talents', authMiddleware, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM talents WHERE status = ? ORDER BY updated_at DESC').all(status);
  } else {
    rows = db.prepare("SELECT * FROM talents WHERE status != 'trash' ORDER BY updated_at DESC").all();
  }
  res.json(rows.map(mapTalent));
});

app.get('/api/talents/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM talents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '人才不存在' });
  res.json(mapTalent(row));
});

app.post('/api/talents', authMiddleware, (req, res) => {
  const t = req.body;
  const id = 'talent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  db.prepare(`INSERT INTO talents (id, name, current_company, current_position, level, city, phone, email, work_years, tags, owner_id, contact_status, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, t.name || '待确认', t.currentCompany || '', t.currentPosition || '', t.level || '', t.city || '',
      t.phone || '', t.email || '', t.workYears || '', JSON.stringify(t.tags || []),
      t.ownerId || req.user.id, t.contactStatus || '未接触', t.status || 'active', t.createdBy || req.user.name);
  if (t.positions && t.positions.length > 0) {
    const insertPos = db.prepare('INSERT OR IGNORE INTO talent_positions (talent_id, position_id, rating) VALUES (?,?,?)');
    t.positions.forEach(p => insertPos.run(id, p.positionId, p.rating || '未评级'));
  }
  if (t.workExperiences && t.workExperiences.length > 0) {
    const insertWe = db.prepare('INSERT INTO work_experiences (talent_id, company, position, start_date, end_date, content) VALUES (?,?,?,?,?,?)');
    t.workExperiences.forEach(w => insertWe.run(id, w.company || '', w.position || '', w.startDate || '', w.endDate || '', w.content || ''));
  }
  res.json(mapTalent(db.prepare('SELECT * FROM talents WHERE id = ?').get(id)));
});

app.put('/api/talents/:id', authMiddleware, (req, res) => {
  const t = req.body;
  db.prepare(`UPDATE talents SET name=?, current_company=?, current_position=?, level=?, city=?, phone=?, email=?, work_years=?, tags=?, owner_id=?, contact_status=?, last_contact_date=?, onboard_date=?, giveup_reason=?, status=?, updated_at=datetime('now'), version=version+1 WHERE id=?`)
    .run(t.name || '待确认', t.currentCompany || '', t.currentPosition || '', t.level || '', t.city || '',
      t.phone || '', t.email || '', t.workYears || '', JSON.stringify(t.tags || []),
      t.ownerId || req.user.id, t.contactStatus || '未接触', t.lastContactDate || '', t.onboardDate || '', t.giveupReason || '',
      t.status || 'active', req.params.id);
  if (t.positions) {
    db.prepare('DELETE FROM talent_positions WHERE talent_id = ?').run(req.params.id);
    const insertPos = db.prepare('INSERT OR IGNORE INTO talent_positions (talent_id, position_id, rating) VALUES (?,?,?)');
    t.positions.forEach(p => insertPos.run(req.params.id, p.positionId, p.rating || '未评级'));
  }
  res.json(mapTalent(db.prepare('SELECT * FROM talents WHERE id = ?').get(req.params.id)));
});

app.delete('/api/talents/:id', authMiddleware, (req, res) => {
  db.prepare("UPDATE talents SET status = 'trash', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  db.prepare("UPDATE reminders SET status = 'closed' WHERE talent_id = ? AND status = 'pending'").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/talents/:id/restore', authMiddleware, (req, res) => {
  db.prepare("UPDATE talents SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/talents/:id/permanent', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM work_experiences WHERE talent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM talent_positions WHERE talent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM communication_records WHERE talent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reminders WHERE talent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM activity_logs WHERE talent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM resume_files WHERE talent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM talents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ====== Talent Positions (ratings) ======
app.post('/api/talents/:id/rating', authMiddleware, (req, res) => {
  const { positionId, rating } = req.body;
  db.prepare('INSERT INTO talent_positions (talent_id, position_id, rating) VALUES (?,?,?) ON CONFLICT(talent_id, position_id) DO UPDATE SET rating = ?')
    .run(req.params.id, positionId, rating, rating);
  res.json({ ok: true });
});

// ====== Work Experiences ======
app.post('/api/talents/:id/work-experiences', authMiddleware, (req, res) => {
  const { company, position, startDate, endDate, content } = req.body;
  db.prepare('INSERT INTO work_experiences (talent_id, company, position, start_date, end_date, content) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, company || '', position || '', startDate || '', endDate || '', content || '');
  res.json({ ok: true });
});

app.delete('/api/work-experiences/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM work_experiences WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ====== Communication Records ======
app.post('/api/talents/:id/communications', authMiddleware, (req, res) => {
  const { date, method, content } = req.body;
  const id = 'comm_' + Date.now().toString(36);
  db.prepare('INSERT INTO communication_records (id, talent_id, date, method, content, created_by) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, date, method || '其他', content || '', req.user.name);
  const t = db.prepare('SELECT contact_status FROM talents WHERE id = ?').get(req.params.id);
  if (t && t.contact_status === '未接触') {
    db.prepare("UPDATE talents SET contact_status = '已联系', last_contact_date = ?, updated_at = datetime('now') WHERE id = ?").run(date, req.params.id);
  } else {
    db.prepare("UPDATE talents SET last_contact_date = ?, updated_at = datetime('now') WHERE id = ?").run(date, req.params.id);
  }
  res.json({ ok: true });
});

app.delete('/api/communications/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可删除沟通记录' });
  db.prepare("UPDATE communication_records SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?").run(req.user.name, req.params.id);
  res.json({ ok: true });
});

// ====== Reminders ======
app.post('/api/talents/:id/reminders', authMiddleware, (req, res) => {
  const { date, note } = req.body;
  const id = 'rem_' + Date.now().toString(36);
  db.prepare("UPDATE reminders SET status = 'closed' WHERE talent_id = ? AND status = 'pending'").run(req.params.id);
  db.prepare('INSERT INTO reminders (id, talent_id, date, note, status, created_by) VALUES (?,?,?,?,"pending",?)')
    .run(id, req.params.id, date, note || '', req.user.name);
  res.json({ ok: true });
});

app.put('/api/reminders/:id', authMiddleware, (req, res) => {
  const { status, date } = req.body;
  if (date) {
    db.prepare('UPDATE reminders SET date = ? WHERE id = ?').run(date, req.params.id);
  } else if (status) {
    db.prepare('UPDATE reminders SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  res.json({ ok: true });
});

// ====== Activity Logs ======
app.post('/api/activity-logs', authMiddleware, (req, res) => {
  const { talentId, type, summary, changes } = req.body;
  const id = 'log_' + Date.now().toString(36);
  db.prepare('INSERT INTO activity_logs (id, talent_id, type, actor, actor_id, summary, changes) VALUES (?,?,?,?,?,?,?)')
    .run(id, talentId, type || '', req.user.name, req.user.id, summary || '', changes || null);
  res.json({ ok: true });
});

// ====== Export ======
app.get('/api/export/talents', authMiddleware, (req, res) => {
  const rows = db.prepare("SELECT * FROM talents WHERE status = 'active' ORDER BY updated_at DESC").all();
  const header = '姓名,当前公司,当前职位,级别,城市,手机,邮箱,接触状态,标签,归属人,最近更新时间';
  const lines = rows.map(t => {
    const tags = (() => { try { return JSON.parse(t.tags || '[]').join(';'); } catch { return ''; } })();
    return [t.name, t.current_company, t.current_position, t.level, t.city, t.phone, t.email, t.contact_status, tags, t.created_by, t.updated_at]
      .map(v => '"' + (v || '') + '"').join(',');
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="talents.csv"');
  res.send('\uFEFF' + header + '\n' + lines.join('\n'));
});

// ====== SPA fallback ======
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('人才地图服务器已启动');
  console.log(`本地访问: http://localhost:${PORT}`);
  console.log(`默认管理员: admin@talentmap.com / admin123`);
  console.log('');
});

