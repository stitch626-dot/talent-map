/* ==========================================================================
   人才地图 Talent Mapping - MVP 应用
   纯前端 SPA，使用 localStorage 持久化数据
   ========================================================================== */

/* ---------- 常量与枚举 ---------- */
const CONTACT_STATUSES = ['未接触', '已联系', '沟通中', '已推荐', '已入职', '已放弃'];
const POSITION_STATUSES = ['盘点中', '已暂停', '已完成'];
const POSITION_FUNCTIONS = ['技术', '产品', '设计', '数据', '运营', '市场', '销售', '职能', '其他'];
const LEVELS = ['初级', '中级', '高级', '专家', '不限'];
const COMPANY_SCALES = ['少于 100 人', '100–500', '500–2000', '2000 人以上', '未知'];
const PRIORITIES = ['高', '中', '低'];
const RATINGS = ['S', 'A', 'B', 'C', '未评级'];
const COMMUNICATION_METHODS = ['电话', '微信', '邮件', '面谈', '其他'];
const GIVEUP_REASONS = ['不考虑', '失联', '拒绝', '其他'];
const RATING_COLORS = { 'S': '#f59e0b', 'A': '#3b82f6', 'B': '#10b981', 'C': '#6b7280', '未评级': '#d1d5db' };
const RATING_RANK = { 'S': 0, 'A': 1, 'B': 2, 'C': 3, '未评级': 4 };
const ROLES = { admin: '管理员', member: 'HR 成员' };

const STORAGE_KEY = 'talent_map_data_v2';
/* ---------- 服务器模式检测 ---------- */
const IS_API_MODE = typeof ApiClient !== 'undefined' && window.location.protocol !== 'file:';

if (IS_API_MODE) {
  // Override saveData to sync to server
  const _origSaveData = saveData;
  saveData = function() {
    // Still save locally for instant updates
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); } catch(e) {}
  };
}


/* ---------- 工具函数 ---------- */
function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function daysBetween(dateStr) {
  const now = new Date(todayStr());
  const then = new Date(dateStr);
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function normPhone(p) {
  if (!p) return '';
  let s = String(p).replace(/[\s\-]/g, '');
  if (s.startsWith('+86')) s = s.slice(3);
  if (s.startsWith('86') && s.length === 13) s = s.slice(2);
  return s;
}

function normEmail(e) {
  return e ? String(e).trim().toLowerCase() : '';
}

function normName(s) {
  if (!s) return '';
  let t = String(s).trim();
  // 全角转半角
  t = t.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  return t;
}

function display(val) {
  return (val == null || val === '') ? '—' : String(val);
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
/* ---------- 数据层 ---------- */
function defaultData() {
  const adminId = 'u_admin';
  return {
    currentUserId: null,
    users: [
      { id: adminId, name: '贾洪爽', email: 'admin@example.com', role: 'admin', avatarColor: '#1f5eff' }
    ],
    space: { name: '贾洪爽 的团队空间' },
    companies: [],
    positions: [],
    talents: [],
    communicationRecords: [],
    reminders: [],
    tags: [],
    settings: { feishuWebhook: '' },
    activityLogs: [],
    invites: [],
    exportLogs: []
  };
}

function loadData() {
  // 1. Try current version
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.users && Array.isArray(data.users) && data.users.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Data load failed, resetting:', e.message);
  }

  // 2. Migration: check old v1 data and migrate it
  try {
    const oldRaw = localStorage.getItem('talent_map_data_v1');
    if (oldRaw) {
      const oldData = JSON.parse(oldRaw);
      if (oldData && oldData.users && Array.isArray(oldData.users) && oldData.users.length > 0) {
        console.log('Migrating v1 data to v2...');
        // Update admin name to 贾洪爽 while preserving all other data
        if (oldData.users && oldData.users[0]) {
          oldData.users[0].name = '贾洪爽';
        }
        if (oldData.space) {
          oldData.space.name = '贾洪爽 的团队空间';
        }
        // Save migrated data to v2
        localStorage.setItem(STORAGE_KEY, JSON.stringify(oldData));
        return oldData;
      }
    }
  } catch (e) {
    console.warn('Migration failed:', e.message);
  }

  // 3. Clear corrupted data
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  return null;
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (e) {
    console.error('Failed to save data:', e.message);
    showToast('数据保存失败，请检查浏览器存储空间', 'error');
  }
}

let DB = loadData() || defaultData();
if (!DB.currentUserId) DB.currentUserId = DB.users[0].id;

function currentUser() {
  return DB.users.find(u => u.id === DB.currentUserId) || DB.users[0];
}

function isAdmin() {
  return currentUser().role === 'admin';
}

function getCompany(id) { return DB.companies.find(c => c.id === id); }
function getPosition(id) { return DB.positions.find(p => p.id === id); }
function getTalent(id) { return DB.talents.find(t => t.id === id); }

function activeCompanies() { return DB.companies.filter(c => !c.deletedAt); }
function activePositions() { return DB.positions.filter(p => !p.deletedAt); }
function activeTalents() { return DB.talents.filter(t => t.status === 'active'); }

function positionsOfCompany(companyId) {
  return activePositions().filter(p => p.companyId === companyId);
}

function talentsOfPosition(positionId) {
  return activeTalents().filter(t => t.positions.some(ap => ap.positionId === positionId));
}

function countCompanyTalents(companyId) {
  const posIds = new Set(positionsOfCompany(companyId).map(p => p.id));
  let count = 0;
  for (const t of activeTalents()) {
    if (t.positions.some(ap => posIds.has(ap.positionId))) count++;
  }
  return count;
}

function logActivity(type, talentId, summary, changes) {
  DB.activityLogs.unshift({
    id: uid('log'),
    type,
    talentId,
    actor: currentUser().name,
    actorId: currentUser().id,
    time: nowStr(),
    summary,
    changes: changes || null
  });
}

/* ---------- 导航 ---------- */
const NAV_ITEMS = [
  { id: 'dashboard', label: '工作台', icon: '▦' },
  { id: 'companies', label: '公司地图', icon: '◈' },
  { id: 'talents', label: '人才列表', icon: '👤' },
  { id: 'settings', label: '设置', icon: '⚙' }
];

function renderSidebar() {
  const cur = currentUser();
  const el = document.getElementById('sidebar');
  el.innerHTML = `
    <div class="sidebar-logo">
      <div class="sidebar-logo-mark">TM</div>
      <div class="nav-item-label" style="font-size:15px;font-weight:700;color:#e2e8f0">人才地图</div>
    </div>
    <div class="space-name">${escapeHtml(DB.space.name)}</div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(item => `
        <a class="nav-item ${Route.page === item.id ? 'active' : ''}" data-route="${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-item-label">${item.label}</span>
        </a>`).join('')}
    </nav>
    <div class="sidebar-footer">
      <div class="user-chip">
        <div class="user-avatar" style="background:${cur.avatarColor}">${escapeHtml(cur.name.charAt(0))}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(cur.name)}</div>
          <div class="user-role">${ROLES[cur.role]}</div>
        </div>
      </div>
    </div>`;
}

function renderTopbar() {
  const el = document.getElementById('topbar');
  const crumb = Route.breadcrumb || [];
  el.innerHTML = `
    <div class="breadcrumb">
      ${crumb.map((c, i) => {
        if (c.clickable) {
          const params = c.params ? encodeURIComponent(JSON.stringify(c.params)) : '';
          return `<span class="crumb clickable" data-route="${c.route}" data-params="${params}">${escapeHtml(c.label)}</span><span class="breadcrumb-separator">/</span>`;
        }
        return `<span class="crumb ${i === crumb.length - 1 ? 'current' : ''}">${escapeHtml(c.label)}</span>${i < crumb.length - 1 ? '<span class="breadcrumb-separator">/</span>' : ''}`;
      }).join('')}
    </div>
    <div class="topbar-right">
      <div class="search-box"><input class="form-input" type="text" id="globalSearchInput" placeholder="搜索人才、公司、职位..." style="width:240px"></div>
      <button class="btn btn-secondary btn-sm" onclick="App.logout()">退出登录</button>
    </div>`;

  const input = document.getElementById('globalSearchInput');
  input.addEventListener('input', debounce((e) => {
    const kw = e.target.value.trim();
    if (kw) App.navigate('talents', { kw });
  }, 500));

  document.querySelectorAll('.crumb.clickable').forEach(el => {
    el.addEventListener('click', () => {
      const route = el.dataset.route;
      let params = {};
      if (el.dataset.params) {
        try { params = JSON.parse(decodeURIComponent(el.dataset.params)); } catch(e) {}
      }
      navigateTo(route, params);
    });
  });
}
/* ---------- 路由 ---------- */
const Route = { page: 'dashboard', params: {}, breadcrumb: [] };

function navigateTo(pageId, params = {}) {
  Route.page = pageId;
  Route.params = params;
  Route.breadcrumb = [];
  render();
}

const App = {
  navigate: navigateTo,
  logout() {
    if (confirm('确定要退出登录吗？')) {
      DB.currentUserId = null;
      saveData();
      location.reload();
    }
  }
};

function render() {
  try {
    renderSidebar();
    renderTopbar();
    renderPage();
    bindSidebarEvents();
  } catch (e) {
    console.error('Render failed:', e.message, e.stack);
    document.getElementById('pageContent').innerHTML =
      '<div class="page"><div class="empty-state" style="padding:60px">⚠ 页面渲染出错，请刷新重试<br><small>' + e.message + '</small></div></div>';
  }
}

function bindSidebarEvents() {
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.route));
  });
}
/* ---------- Toast 通知 ---------- */
function showToast(msg, type = 'info') {
  const id = uid('toast');
  const container = document.getElementById('toastContainer');
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.id = id;
  div.innerHTML = `<span>${msg}</span><button class="toast-close" onclick="closeToast('${id}')">&times;</button>`;
  container.appendChild(div);
  setTimeout(() => closeToast(id), 3500);
}

function closeToast(id) {
  const el = document.getElementById(id);
  if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }
}

/* ---------- 模态框 ---------- */
function showModal(title, bodyHTML, footerHTML = '', opts = {}) {
  const mc = document.getElementById('modalContainer');
  mc.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal-content" style="max-width:${opts.width || '600px'}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn btn-ghost" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
      </div>
    </div>`;

  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  if (opts.onReady) opts.onReady();
}

function closeModal() {
  document.getElementById('modalContainer').innerHTML = '';
}

function modalSubmit(fn) {
  return function(e) { e.preventDefault(); try { fn(e); } finally { closeModal(); } };
}

/* ---------- 辅助 HTML 生成 ---------- */
function badgeRating(r) {
  if (!r || r === '未评级') return '<span class="badge badge-未评级">—</span>';
  return `<span class="badge badge-${r}">${r}</span>`;
}

function statusTag(s) {
  const map = { '未接触': 'tag-gray', '已联系': 'tag-blue', '沟通中': 'tag-green', '已推荐': 'tag-orange', '已入职': 'tag-blue', '已放弃': 'tag-red' };
  return `<span class="tag ${map[s] || 'tag-gray'}">${s}</span>`;
}

function positionStatusTag(s) {
  const map = { '盘点中': 'tag-green', '已暂停': 'tag-orange', '已完成': 'tag-gray' };
  return `<span class="tag ${map[s] || 'tag-gray'}">${s}</span>`;
}

function distributionBar(stats) {
  const total = stats.S + stats.A + stats.B + stats.C + stats.unrated;
  if (total === 0) return '<div class="distribution-bar"><div class="dist-item dist-empty" style="flex:1">尚未评级</div></div>';

  const segs = [
    { key: 'S', count: stats.S, color: '#f59e0b' },
    { key: 'A', count: stats.A, color: '#3b82f6' },
    { key: 'B', count: stats.B, color: '#10b981' },
    { key: 'C', count: stats.C, color: '#6b7280' },
    { key: 'unrated', count: stats.unrated, color: '#d1d5db', label: '未评级' }
  ];

  let bars = segs.filter(s => s.count > 0).map(s => {
    const pct = Math.round(s.count / total * 100);
    return `<div class="dist-item" style="flex:${s.count};background:${s.color}" title="${s.label || s.key}: ${s.count}人 (${pct}%)">
      <span class="dist-label">${s.label || s.key} ${s.count}</span>
    </div>`;
  }).join('');

  return `<div class="distribution-bar">${bars}</div>`;
}

function distributionLabel(stats) {
  const total = stats.S + stats.A + stats.B + stats.C + stats.unrated;
  if (total === 0) return '<span class="note">尚未评级</span>';
  const parts = [];
  if (stats.S > 0) parts.push(`<b>S</b> ${stats.S}`);
  if (stats.A > 0) parts.push(`<b>A</b> ${stats.A}`);
  if (stats.B > 0) parts.push(`<b>B</b> ${stats.B}`);
  if (stats.C > 0) parts.push(`<b>C</b> ${stats.C}`);
  if (stats.unrated > 0) parts.push(`<b>—</b> ${stats.unrated}`);
  return parts.join(' · ');
}

/* ---------- 路由到页面 ---------- */
function renderPage() {
  const pc = document.getElementById('pageContent');
  const p = Route.page;
  const params = Route.params;

  if (p === 'dashboard') Dashboard.render(pc);
  else if (p === 'companies') Companies.render(pc);
  else if (p === 'company-detail') CompanyDetail.render(pc, params);
  else if (p === 'position-detail') PositionDetail.render(pc, params);
  else if (p === 'confirm') ConfirmPage.render(pc, params);
  else if (p === 'talents') TalentList.render(pc, params);
  else if (p === 'talent-detail') TalentDetail.render(pc, params);
  else if (p === 'settings') Settings.render(pc);
  else Dashboard.render(pc);
}
/* ==========================================================================
   页面 1: 工作台 (Dashboard)
   ========================================================================== */
const Dashboard = {
  render(container) {
    Route.breadcrumb = [{ label: '工作台' }];
    const drafts = DB.talents.filter(t => t.status === 'draft');
    const pendingReminders = DB.reminders.filter(r => r.status === 'pending' && r.date <= todayStr());
    const myTalents = activeTalents().filter(t => t.ownerId === currentUser().id);
    const recentLogs = DB.activityLogs.slice(0, 8);
    const recentTalents = activeTalents().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>工作台</h1>
          <div class="page-header-actions">
            <button class="btn btn-primary" onclick="Companies.openCreateModal()">+ 新建公司</button>
            <button class="btn btn-secondary" onclick="App.navigate('talents', {action:'upload'})">📄 导入简历</button>
            <button class="btn btn-primary" onclick="TalentDetail.uploadResumeAuto()">🤖 上传简历自动录入</button>
          </div>
        </div>

        <div class="stats-grid">
          <div class="card" onclick="App.navigate('companies')">
            <div class="stat-num">${activeCompanies().length}</div>
            <div class="stat-label">目标公司</div>
          </div>
          <div class="card" onclick="App.navigate('confirm')">
            <div class="stat-num ${drafts.length > 0 ? 'accent' : ''}">${drafts.length}</div>
            <div class="stat-label">待确认草稿</div>
          </div>
          <div class="card" onclick="App.navigate('talents')">
            <div class="stat-num">${activeTalents().length}</div>
            <div class="stat-label">人才档案</div>
          </div>
          <div class="card">
            <div class="stat-num ${pendingReminders.length > 0 ? 'warn' : ''}">${pendingReminders.length}</div>
            <div class="stat-label">到期提醒</div>
          </div>
        </div>

        <div class="dash-grid">
          <div class="card">
            <div class="card-header">
              <h3>待确认草稿 ${drafts.length > 0 ? `<span class="badge badge-count">${drafts.length}</span>` : ''}</h3>
              <a class="link" onclick="App.navigate('confirm')">全部 ›</a>
            </div>
            <div class="card-body">
              ${drafts.length === 0 ? '<div class="empty-state">暂无待确认草稿</div>' : `
                <table class="table">
                  <thead><tr><th>人才</th><th>目标职位</th><th>上传人</th><th>日期</th></tr></thead>
                  <tbody>
                    ${drafts.slice(0, 5).map(t => {
                      const pos = t.positions[0] ? getPosition(t.positions[0].positionId) : null;
                      const comp = pos ? getCompany(pos.companyId) : null;
                      return `<tr class="clickable" onclick="App.navigate('confirm', {tid:'${t.id}'})">
                        <td>${escapeHtml(t.name || '待确认')}</td>
                        <td class="muted">${escapeHtml(comp ? comp.name + ' / ' + pos.name : '—')}</td>
                        <td>${escapeHtml(t.createdBy)}</td>
                        <td class="muted">${escapeHtml(t.createdAt.slice(0, 10))}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>`}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>待跟进提醒 ${pendingReminders.length > 0 ? `<span class="badge badge-count warn-bg">${pendingReminders.length}</span>` : ''}</h3>
            </div>
            <div class="card-body">
              ${pendingReminders.length === 0 ? '<div class="empty-state">暂无到期提醒</div>' : `
                <table class="table">
                  <thead><tr><th>人才</th><th>提醒说明</th><th>操作</th></tr></thead>
                  <tbody>
                    ${pendingReminders.map(r => {
                      const t = getTalent(r.talentId);
                      if (!t || t.status !== 'active') return '';
                      return `<tr>
                        <td><a onclick="App.navigate('talent-detail',{tid:'${t.id}'})">${escapeHtml(t.name)}</a></td>
                        <td>${escapeHtml(r.note || '跟进')} <span class="note">到期 ${r.date}</span></td>
                        <td>
                          <button class="btn btn-sm btn-primary" onclick="Dashboard.handleReminder('${r.id}','done')">完成</button>
                          <button class="btn btn-sm btn-secondary" onclick="Dashboard.handleReminder('${r.id}','delay3')">延期3天</button>
                          <button class="btn btn-sm btn-ghost" onclick="Dashboard.handleReminder('${r.id}','close')">关闭</button>
                        </td>
                      </tr>`;
                    }).filter(Boolean).join('')}
                  </tbody>
                </table>`}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>最近更新</h3>
            </div>
            <div class="card-body">
              ${recentTalents.length === 0 ? '<div class="empty-state">暂无数据</div>' : `
                <table class="table">
                  <thead><tr><th>姓名</th><th>公司/职位</th><th>状态</th><th>更新时间</th></tr></thead>
                  <tbody>
                    ${recentTalents.map(t => {
                      const ap = t.positions[0];
                      const pos = ap ? getPosition(ap.positionId) : null;
                      const comp = pos ? getCompany(pos.companyId) : null;
                      return `<tr class="clickable" onclick="App.navigate('talent-detail',{tid:'${t.id}'})">
                        <td>${escapeHtml(t.name)}</td>
                        <td class="muted">${escapeHtml(comp ? comp.name + ' / ' + pos.name : t.currentCompany)}</td>
                        <td>${statusTag(t.contactStatus)}</td>
                        <td class="muted">${escapeHtml(t.updatedAt.slice(0, 10))}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>`}
            </div>
          </div>
        </div>
      </div>`;
  },

  handleReminder(rid, action) {
    const r = DB.reminders.find(r => r.id === rid);
    if (!r) return;
    if (action === 'done') r.status = 'done';
    else if (action === 'delay3') { r.date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10); }
    else if (action === 'delay7') { r.date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10); }
    else if (action === 'close') r.status = 'closed';
    saveData();
    render();
    showToast(action === 'done' ? '提醒已标记完成' : action === 'close' ? '提醒已关闭' : '提醒已延期');
  }
};
/* ==========================================================================
   页面 2: 公司地图 (Companies)
   ========================================================================== */
const Companies = {
  render(container) {
    Route.breadcrumb = [{ label: '公司地图' }];
    const filterPri = Route.params.priority || '';
    const kw = Route.params.kw || '';
    let list = activeCompanies();
    if (filterPri) list = list.filter(c => c.priority === filterPri);
    if (kw) list = list.filter(c => c.name.toLowerCase().includes(kw.toLowerCase()));

    // Compute stats for each company
    const data = list.map(c => {
      const positions = positionsOfCompany(c.id);
      const posIds = new Set(positions.map(p => p.id));
      const talents = activeTalents().filter(t => t.positions.some(ap => posIds.has(ap.positionId)));
      const ratings = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
      talents.forEach(t => {
        t.positions.filter(ap => posIds.has(ap.positionId)).forEach(ap => {
          const r = ap.rating || '未评级';
          if (ratings.hasOwnProperty(r)) ratings[r]++;
          else ratings.unrated++;
        });
      });
      const lastUpdate = [...talents.map(t => t.updatedAt), c.updatedAt || ''].sort().reverse()[0] || '';
      return { c, positions, talents, ratings, lastUpdate };
    });

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>公司地图</h1>
          <div class="page-header-actions">
            <button class="btn btn-primary" onclick="Companies.openCreateModal()">+ 新建公司</button>
          </div>
        </div>
        <div class="filter-bar">
          <select class="form-select" style="width:140px" onchange="Companies.filterByPriority(this.value)">
            <option value="">全部优先级</option>
            <option value="高" ${filterPri==='高'?'selected':''}>高</option>
            <option value="中" ${filterPri==='中'?'selected':''}>中</option>
            <option value="低" ${filterPri==='低'?'selected':''}>低</option>
          </select>
          <input class="form-input" placeholder="搜索公司..." value="${escapeHtml(kw)}" style="width:220px"
                 oninput="Companies.search(this.value)">
          <span class="note">共 ${data.length} 家公司</span>
        </div>

        ${data.length === 0 ? '<div class="empty-state">暂无公司，点击右上角新建</div>' : `
          <table class="table">
            <thead>
              <tr><th>公司名称</th><th>行业</th><th>城市</th><th>优先级</th><th>职位数</th><th>S+A</th><th>人才数</th><th>最近更新</th></tr>
            </thead>
            <tbody>
              ${data.map(({c, positions, ratings, lastUpdate}) => `
                <tr class="clickable" onclick="App.navigate('company-detail',{cid:'${c.id}'})">
                  <td><b>${escapeHtml(c.name)}</b></td>
                  <td class="muted">${escapeHtml(c.industry) || '—'}</td>
                  <td>${escapeHtml(c.city) || '—'}</td>
                  <td><span class="tag ${c.priority==='高'?'tag-red':c.priority==='中'?'tag-orange':'tag-gray'}">${c.priority}</span></td>
                  <td>${positions.length}</td>
                  <td><b>${ratings.S + ratings.A}</b></td>
                  <td>${ratings.S + ratings.A + ratings.B + ratings.C + ratings.unrated}</td>
                  <td class="muted">${lastUpdate ? lastUpdate.slice(0,10) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>`}
      </div>`;
  },

  filterByPriority(v) { navigateTo('companies', { priority: v }); },
  search(kw) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => navigateTo('companies', { kw }), 300);
  },

  openCreateModal() {
    showModal('新建目标公司', `
      <div class="form-group"><label class="form-label">公司名称 *</label><input class="form-input" id="mcName"></div>
      <div class="form-group"><label class="form-label">行业</label><input class="form-input" id="mcIndustry"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">城市</label><input class="form-input" id="mcCity"></div>
        <div class="form-group"><label class="form-label">规模</label><select class="form-select" id="mcScale">${COMPANY_SCALES.map(s => `<option>${s}</option>`).join('')}<option selected>未知</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">优先级</label><select class="form-select" id="mcPriority"><option>高</option><option selected>中</option><option>低</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="mcNote" rows="3"></textarea></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="Companies.create()">创建</button>`
    );
  },

  create() {
    const name = normName(document.getElementById('mcName').value);
    if (!name) return showToast('请输入公司名称', 'error');
    if (activeCompanies().some(c => normName(c.name) === name)) return showToast('该公司已存在', 'error');
    const now = nowStr();
    DB.companies.push({
      id: uid('comp'), name: document.getElementById('mcName').value.trim(),
      industry: document.getElementById('mcIndustry').value, scale: document.getElementById('mcScale').value,
      city: document.getElementById('mcCity').value, priority: document.getElementById('mcPriority').value,
      note: document.getElementById('mcNote').value, deletedAt: null, createdAt: now, updatedAt: now
    });
    closeModal(); saveData(); render(); showToast('公司已创建');
  },

  openEditModal(cid) {
    const c = getCompany(cid); if (!c) return;
    showModal('编辑公司', `
      <div class="form-group"><label class="form-label">公司名称 *</label><input class="form-input" id="eName" value="${escapeHtml(c.name)}"></div>
      <div class="form-group"><label class="form-label">行业</label><input class="form-input" id="eIndustry" value="${escapeHtml(c.industry || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">城市</label><input class="form-input" id="eCity" value="${escapeHtml(c.city || '')}"></div>
        <div class="form-group"><label class="form-label">规模</label><select class="form-select" id="eScale">${COMPANY_SCALES.map(s => `<option ${c.scale===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">优先级</label><select class="form-select" id="ePriority"><option ${c.priority==='高'?'selected':''}>高</option><option ${c.priority==='中'?'selected':''}>中</option><option ${c.priority==='低'?'selected':''}>低</option></select></div>
      <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="eNote" rows="3">${escapeHtml(c.note || '')}</textarea></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="Companies.saveEdit('${cid}')">保存</button>`
    );
  },

  saveEdit(cid) {
    const c = getCompany(cid); if (!c) return;
    const name = normName(document.getElementById('eName').value);
    if (!name) return showToast('请输入公司名称', 'error');
    if (activeCompanies().some(co => co.id !== cid && normName(co.name) === name)) return showToast('该公司名已存在', 'error');
    c.name = document.getElementById('eName').value.trim();
    c.industry = document.getElementById('eIndustry').value;
    c.city = document.getElementById('eCity').value;
    c.scale = document.getElementById('eScale').value;
    c.priority = document.getElementById('ePriority').value;
    c.note = document.getElementById('eNote').value;
    c.updatedAt = nowStr();
    closeModal(); saveData(); render(); showToast('公司已更新');
  },

  deleteCompany(cid) {
    if (!isAdmin()) return showToast('仅管理员可删除公司', 'error');
    const c = getCompany(cid); if (!c) return;
    const posCount = positionsOfCompany(cid).length;
    const confirmMsg = posCount > 0
      ? `删除「${c.name}」将解除 ${posCount} 个职位的关联，确定删除？`
      : `确定删除「${c.name}」？`;
    if (!confirm(confirmMsg)) return;
    c.deletedAt = nowStr();
    c.updatedAt = nowStr();
    // Soft-delete positions
    positionsOfCompany(cid).forEach(p => { p.deletedAt = c.deletedAt; });
    saveData(); navigateTo('companies'); showToast('公司已移至回收站');
  }
};
/* ==========================================================================
   页面 3: 公司详情 (CompanyDetail)
   ========================================================================== */
const CompanyDetail = {
  render(container, params) {
    const c = getCompany(params.cid);
    if (!c || c.deletedAt) { container.innerHTML = '<div class="page"><div class="empty-state">公司不存在或已删除</div></div>'; return; }
    Route.breadcrumb = [
      { label: '公司地图', clickable: true, route: 'companies' },
      { label: c.name }
    ];

    const positions = positionsOfCompany(c.id);
    const posIds = new Set(positions.map(p => p.id));
    const talents = activeTalents().filter(t => t.positions.some(ap => posIds.has(ap.positionId)));
    const talentIds = new Set(talents.map(t => t.id));

    const ratingsAll = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
    const contactDist = { '未接触': 0, '已联系': 0, '沟通中': 0, '已推荐': 0, '已入职': 0, '已放弃': 0 };
    talents.forEach(t => {
      contactDist[t.contactStatus] = (contactDist[t.contactStatus] || 0) + 1;
      t.positions.filter(ap => posIds.has(ap.positionId)).forEach(ap => {
        const r = ap.rating || '未评级';
        if (ratingsAll.hasOwnProperty(r)) ratingsAll[r]++;
        else ratingsAll.unrated++;
      });
    });

    const posData = positions.sort((a, b) => {
      if (a.status !== b.status) return a.status === '盘点中' ? -1 : b.status === '盘点中' ? 1 : 0;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    }).map(pos => {
      const posTalents = activeTalents().filter(t => t.positions.some(ap => ap.positionId === pos.id));
      const pr = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
      posTalents.forEach(t => {
        t.positions.filter(ap => ap.positionId === pos.id).forEach(ap => {
          const r = ap.rating || '未评级';
          if (pr.hasOwnProperty(r)) pr[r]++;
          else pr.unrated++;
        });
      });
      return { pos, talents: posTalents, ratings: pr };
    });

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <h1>${escapeHtml(c.name)}</h1>
            <span class="note">${escapeHtml(c.industry || '—')} · ${escapeHtml(c.city || '—')} · ${c.scale}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="Companies.openEditModal('${c.id}')">编辑</button>
            ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="Companies.deleteCompany('${c.id}')">删除</button>` : ''}
          </div>
        </div>

        <div class="card" style="margin-bottom:20px">
          <div class="card-body">
            <b>等级分布</b> ${distributionLabel(ratingsAll)}
            ${distributionBar(ratingsAll)}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>目标职位 (${positions.length})</h3>
            <button class="btn btn-primary btn-sm" onclick="CompanyDetail.openCreatePosition('${c.id}')">+ 新增职位</button>
          </div>
          <div class="card-body">
            ${posData.length === 0 ? '<div class="empty-state">暂无职位，点击右上角新增</div>' : `
              <table class="table">
                <thead>
                  <tr><th>职位名称</th><th>职能</th><th>级别</th><th>城市</th><th>状态</th><th>等级分布</th><th>人才</th></tr>
                </thead>
                <tbody>
                  ${posData.map(({pos, talents: pt, ratings: pr}) => {
                    const total = pr.S + pr.A + pr.B + pr.C + pr.unrated;
                    return `<tr>
                      <td><a onclick="App.navigate('position-detail',{pid:'${pos.id}'})"><b>${escapeHtml(pos.name)}</b></a></td>
                      <td>${escapeHtml(pos.function)}</td>
                      <td>${escapeHtml(pos.level || '—')}</td>
                      <td>${escapeHtml(pos.city || '—')}</td>
                      <td>${positionStatusTag(pos.status)}</td>
                      <td>
                        <div class="mini-dist">${distributionBar(pr)}</div>
                        <span class="note">${distributionLabel(pr)}</span>
                      </td>
                      <td>${total}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
          </div>
        </div>
      </div>`;
  },

  openCreatePosition(cid) {
    showModal('新增职位', `
      <input type="hidden" id="pcCid" value="${cid}">
      <div class="form-group"><label class="form-label">职位名称 *</label><input class="form-input" id="pcName"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">职能 *</label><select class="form-select" id="pcFunc">${POSITION_FUNCTIONS.map(f => `<option>${f}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">级别</label><select class="form-select" id="pcLevel">${LEVELS.map(l => `<option>${l}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">城市</label><input class="form-input" id="pcCity" value="${escapeHtml(getCompany(cid)?.city || '')}"></div>
        <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="pcStatus"><option selected>盘点中</option><option>已暂停</option><option>已完成</option></select></div>
      </div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="CompanyDetail.createPosition()">创建</button>`
    );
  },

  createPosition() {
    const cid = document.getElementById('pcCid').value;
    const name = normName(document.getElementById('pcName').value);
    if (!name) return showToast('请输入职位名称', 'error');
    if (positionsOfCompany(cid).some(p => normName(p.name) === name)) return showToast('该职位已存在', 'error');
    const now = nowStr();
    DB.positions.push({
      id: uid('pos'), companyId: cid,
      name: document.getElementById('pcName').value.trim(),
      function: document.getElementById('pcFunc').value,
      level: document.getElementById('pcLevel').value,
      city: document.getElementById('pcCity').value,
      status: document.getElementById('pcStatus').value,
      deletedAt: null, createdAt: now, updatedAt: now
    });
    closeModal(); saveData(); render(); showToast('职位已创建');
  }
};
/* ==========================================================================
   页面 4: 职位详情 (PositionDetail)
   ========================================================================== */
const PositionDetail = {
  render(container, params) {
    const pos = getPosition(params.pid);
    if (!pos || pos.deletedAt) { container.innerHTML = '<div class="page"><div class="empty-state">职位不存在或已删除</div></div>'; return; }
    const comp = getCompany(pos.companyId);
    if (!comp) { container.innerHTML = '<div class="page"><div class="empty-state">关联公司不存在</div></div>'; return; }
    Route.breadcrumb = [
      { label: '公司地图', clickable: true, route: 'companies' },
      { label: comp.name, clickable: true, route: `company-detail`, params: { cid: comp.id } },
      { label: pos.name }
    ];

    const filterRating = params.ratingFilter || '';
    const filterStatus = params.statusFilter || '';
    const filterKw = params.kw || '';

    let talents = activeTalents().filter(t => t.positions.some(ap => ap.positionId === pos.id));

    const ratings = { S: 0, A: 0, B: 0, C: 0, unrated: 0 };
    talents.forEach(t => {
      t.positions.filter(ap => ap.positionId === pos.id).forEach(ap => {
        const r = ap.rating || '未评级';
        if (ratings.hasOwnProperty(r)) ratings[r]++;
        else ratings.unrated++;
      });
    });

    // Apply filters
    if (filterRating) talents = talents.filter(t =>
      t.positions.some(ap => ap.positionId === pos.id && (ap.rating || '未评级') === filterRating));
    if (filterStatus) talents = talents.filter(t => t.contactStatus === filterStatus);
    if (filterKw) {
      const kw = filterKw.toLowerCase();
      talents = talents.filter(t =>
        t.name.toLowerCase().includes(kw) ||
        (t.currentCompany && t.currentCompany.toLowerCase().includes(kw)) ||
        (t.currentPosition && t.currentPosition.toLowerCase().includes(kw)));
    }

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <h1>${escapeHtml(pos.name)}</h1>
            <span class="note">${escapeHtml(comp.name)} · ${escapeHtml(pos.function)} · ${positionStatusTag(pos.status)}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-primary btn-sm" onclick="PositionDetail.uploadResume('${pos.id}')">📄 上传简历</button>
            <button class="btn btn-secondary btn-sm" onclick="PositionDetail.exportCSV('${pos.id}')">📥 导出</button>
            ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="PositionDetail.deletePosition('${pos.id}')">删除</button>` : ''}
          </div>
        </div>

        <div class="card" style="margin-bottom:20px">
          <div class="card-body">
            <b>等级分布</b> <span class="note">${distributionLabel(ratings)}</span>
            ${distributionBar(ratings)}
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
              ${['S','A','B','C','未评级'].map(r => {
                const cnt = ratings[r] || ratings.hasOwnProperty(r) ? (ratings[r] || 0) : (ratings.unrated || 0);
                return `<span class="tag ${filterRating===r ? 'tag-blue dist-clickable' : 'tag-gray'}" style="cursor:pointer"
                  onclick="PositionDetail.filterRating('${pos.id}','${filterRating===r ? '' : r}')">
                  ${r === '未评级' ? '未评级' : r} ${cnt}
                </span>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>人才列表</h3>
            <div style="display:flex;gap:8px;align-items:center">
              <input class="form-input" placeholder="搜索..." value="${escapeHtml(filterKw)}" style="width:200px"
                     oninput="PositionDetail.search('${pos.id}', this.value)">
              <select class="form-select" onchange="PositionDetail.filterStatus('${pos.id}', this.value)">
                <option value="">接触状态</option>
                ${CONTACT_STATUSES.map(s => `<option ${filterStatus===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <span class="note">共 ${talents.length} 人</span>
            </div>
          </div>
          <div class="card-body">
            ${talents.length === 0 ? '<div class="empty-state">暂无人才，请上传简历</div>' : `
              <table class="table">
                <thead>
                  <tr><th>姓名</th><th>等级</th><th>当前公司/职位</th><th>城市</th><th>标签</th><th>状态</th><th>归属人</th></tr>
                </thead>
                <tbody>
                  ${talents.map(t => {
                    const ap = t.positions.find(a => a.positionId === pos.id);
                    const rating = ap ? (ap.rating || '未评级') : '未评级';
                    return `<tr class="clickable" onclick="App.navigate('talent-detail',{tid:'${t.id}'})">
                      <td><b>${escapeHtml(t.name)}</b></td>
                      <td>${badgeRating(rating)}</td>
                      <td class="muted">${escapeHtml(t.currentCompany)}${t.currentPosition ? ' / ' + escapeHtml(t.currentPosition) : ''}</td>
                      <td>${escapeHtml(t.city) || '—'}</td>
                      <td>${(t.tags || []).slice(0,3).map(tg => `<span class="tag tag-blue">${escapeHtml(tg)}</span>`).join(' ') || '—'}</td>
                      <td>${statusTag(t.contactStatus)}</td>
                      <td class="muted">${escapeHtml(t.ownerId === currentUser().id ? t.createdBy + ' (我)' : (t.createdBy || '—'))}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
          </div>
        </div>
      </div>`;
  },

  filterRating(pid, val) { const params = { ...Route.params, pid, ratingFilter: val || undefined }; navigateTo('position-detail', params); },
  filterStatus(pid, val) { const params = { ...Route.params, pid, statusFilter: val || undefined }; navigateTo('position-detail', params); },
  search(pid, val) {
    if (this._st) clearTimeout(this._st);
    this._st = setTimeout(() => navigateTo('position-detail', { pid, kw: val }), 300);
  },

    _uploadedFiles: [],
  uploadResume(posId) {
    PositionDetail._uploadedFiles = [];
    PositionDetail._uploadPosId = posId;
    showModal('上传简历', `
      <div class="upload-zone" id="uploadZone" style="border:2px dashed var(--color-line);border-radius:8px;padding:32px;text-align:center;cursor:pointer">
        <p>📄 拖拽简历文件到此处，或点击选择</p>
        <p class="note">支持 PDF、DOCX、JPG、PNG — 单文件 ≤ 10 MB，最多 20 份</p>
        <p class="note">🖼 图片文件将自动 OCR 识别文字内容</p>
        <input type="file" id="fileInput" multiple accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.bmp,.webp" style="display:none">
      </div>
      <div id="uploadProgress" class="upload-progress" style="display:none;margin-top:12px;padding:10px;background:#f0f6ff;border-radius:6px;text-align:center"></div>
      <div id="uploadList"></div>
      <div style="margin-top:12px">
        <button class="btn btn-ghost btn-sm" onclick="PositionDetail.createManual('''${posId}''')">或手工新建档案</button>
      </div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>`,
      { width: '580px', onReady() {
        const zone = document.getElementById('uploadZone');
        const input = document.getElementById('fileInput');
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--color-primary)'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--color-line)'; });
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.style.borderColor = 'var(--color-line)';
          PositionDetail.handleFiles(e.dataTransfer.files, PositionDetail._uploadPosId);
        });
        input.addEventListener('change', () => PositionDetail.handleFiles(input.files, PositionDetail._uploadPosId));
      }}
    );
  },

  handleFiles(files, posId) {
    const validFiles = Array.from(files).slice(0, 20).filter(f => {
      return f.size <= 10 * 1024 * 1024;
    });
    const oversized = Array.from(files).filter(f => f.size > 10 * 1024 * 1024);

    PositionDetail._uploadedFiles = validFiles;

    const list = document.getElementById('uploadList');
    let html = '<p><b>已选择文件：</b></p><ul>';
    validFiles.forEach(f => {
      const icon = ResumeParser.getFileType(f) === 'image' ? '🖼' : '📄';
      html += `<li>${icon} ${f.name} (${(f.size/1024).toFixed(0)} KB)</li>`;
    });
    oversized.forEach(f => {
      html += `<li class="text-danger">⚠ ${f.name} — 超过 10 MB 限制，已跳过</li>`;
    });
    html += '</ul>';
    if (validFiles.length > 0) {
      html += `<button class="btn btn-primary" onclick="PositionDetail.realParse(\`\${PositionDetail._uploadPosId}\`)">🔍 确认上传并智能解析 (${validFiles.length} 份)</button>`;
    } else {
      html += '<p class="text-danger">没有有效的文件可以解析</p>';
    }
    list.innerHTML = html;
  },

  async realParse(posId) {
    const files = PositionDetail._uploadedFiles;
    if (!files || files.length === 0) return;

    const progressDiv = document.getElementById('uploadProgress');
    progressDiv.style.display = 'block';

    const now = nowStr();
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      progressDiv.innerHTML = `⏳ 正在解析: ${f.name} (${i + 1}/${files.length})...`;

      try {
        const result = await ResumeParser.parseFile(f);

        const tid = uid('talent');
        
        // Save file to IndexedDB
        const fileId = tid + '_resume_0';
        try {
          await ResumeStorage.saveFile(fileId, f.name, new Blob([f], { type: f.type }), f.type);
        } catch (e) { console.warn('IndexedDB save failed:', e.message); }

        DB.talents.push({
          id: tid, name: result.name || '待确认',
          currentCompany: result.company || '', currentPosition: result.position || '',
          level: result.level || '', city: result.city || '',
          phone: result.phone || '', email: result.email || '',
          workYears: result.workYears || '', tags: [],
          ownerId: currentUser().id, contactStatus: '未接触',
          lastContactDate: '', onboardDate: '', giveupReason: '',
          positions: [{ positionId: posId, rating: '未评级', associatedAt: now }],
          resumeFiles: [{ name: f.name, size: (f.size / 1024).toFixed(0) + ' KB', fileId }],
          status: 'draft',
          workExperiences: result.workExperiences || [],
          workContent: result.workContent || '',
          createdAt: now, updatedAt: now, version: 1,
          createdBy: currentUser().name, mergedToId: null, note: '',
          parseConfidence: result.confidence || {}
        });

        successCount++;
      } catch (err) {
        console.error('Parse error:', f.name, err);
        failCount++;
        // Still create a draft for manual entry
        const tid = uid('talent');
        DB.talents.push({
          id: tid, name: '', currentCompany: '', currentPosition: '', level: '', city: '',
          phone: '', email: '', workYears: '', tags: [],
          ownerId: currentUser().id, contactStatus: '未接触',
          lastContactDate: '', onboardDate: '', giveupReason: '',
          positions: [{ positionId: posId, rating: '未评级', associatedAt: now }],
          resumeFiles: [{ name: f.name, size: (f.size / 1024).toFixed(0) + ' KB', fileId: tid + '_resume_0' }],
          status: 'draft', parseError: err.message,
          workExperiences: [], workContent: '',
          createdAt: now, updatedAt: now, version: 1,
          createdBy: currentUser().name, mergedToId: null, note: ''
        });
      }
    }

    saveData();
    closeModal();

    if (failCount === 0) {
      showToast(`✅ ${successCount} 份简历解析完成，请确认入池`, 'success');
    } else {
      showToast(`✅ ${successCount} 份成功，⚠ ${failCount} 份需手工补录`, 'warn');
    }

    App.navigate('confirm');
  },  createManual(posId) {
    closeModal();
    const tid = uid('talent');
    const now = nowStr();
    DB.talents.push({
      id: tid, name: '', currentCompany: '', currentPosition: '', level: '', city: '',
      phone: '', email: '', workYears: '', tags: [],
      ownerId: currentUser().id, contactStatus: '未接触', lastContactDate: '', onboardDate: '', giveupReason: '',
      positions: [{ positionId: posId, rating: '未评级', associatedAt: now }],
      resumeFiles: [],
      workExperiences: [],
      status: 'draft',
      createdAt: now, updatedAt: now, version: 1,
      createdBy: currentUser().name, mergedToId: null, note: ''
    });
    saveData();
    App.navigate('confirm', { tid });
    showToast('已创建手工建档草稿');
  },

  exportCSV(posId) {
    const pos = getPosition(posId); if (!pos) return;
    const talents = activeTalents().filter(t => t.positions.some(ap => ap.positionId === posId));
    if (talents.length === 0) return showToast('无可导出数据', 'error');
    if (talents.length > 5000) return showToast('超过导出上限5000条，请缩小范围', 'error');

    const comp = getCompany(pos.companyId);
    const header = '姓名,当前公司,当前职位,级别,城市,手机,邮箱,接触状态,标签,归属人,关联职位,含金量等级,最近更新时间';
    const rows = talents.map(t => {
      const ap = t.positions.find(a => a.positionId === posId);
      return [
        t.name, t.currentCompany, t.currentPosition, t.level, t.city,
        t.phone, t.email, t.contactStatus, (t.tags || []).join(';'),
        t.createdBy, `${comp ? comp.name : ''} / ${pos.name}`,
        ap ? (ap.rating || '未评级') : '未评级',
        t.updatedAt.slice(0, 10)
      ].map(v => '"' + (v || '') + '"').join(',');
    });

    const BOM = '\uFEFF';
    const csv = BOM + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `人才导出_${comp?comp.name:'export'}_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${talents.length} 条记录`);
  },

  deletePosition(pid) {
    if (!isAdmin()) return showToast('仅管理员可删除职位', 'error');
    const pos = getPosition(pid); if (!pos) return;
    const talents = activeTalents().filter(t => t.positions.some(ap => ap.positionId === pid));
    if (!confirm(`删除「${pos.name}」将解除 ${talents.length} 条人才关联，确定删除？`)) return;
    pos.deletedAt = nowStr();
    pos.updatedAt = nowStr();
    saveData();
    navigateTo('company-detail', { cid: pos.companyId });
    showToast('职位已移至回收站');
  }
};

/* ==========================================================================
   页面 5: 人才列表 (TalentList) - 全局搜索与筛选
   ========================================================================== */
const TalentList = {
  render(container, params) {
    Route.breadcrumb = [{ label: '人才列表' }];
    const kw = params.kw || '';
    const filterCompany = params.filterCompany || '';
    const filterStatus = params.filterStatus || '';
    const filterRating = params.filterRating || '';
    const filterOwner = params.filterOwner || '';

    let talents = activeTalents();
    if (kw) {
      const k = kw.toLowerCase();
      talents = talents.filter(t =>
        t.name.toLowerCase().includes(k) ||
        (t.currentCompany && t.currentCompany.toLowerCase().includes(k)) ||
        (t.currentPosition && t.currentPosition.toLowerCase().includes(k)) ||
        (t.city && t.city.toLowerCase().includes(k)));
    }
    if (filterCompany) talents = talents.filter(t => t.currentCompany === filterCompany);
    if (filterStatus) talents = talents.filter(t => t.contactStatus === filterStatus);
    if (filterRating) talents = talents.filter(t =>
      t.positions.some(ap => (ap.rating || '未评级') === filterRating));
    if (filterOwner) talents = talents.filter(t => t.ownerId === filterOwner);

    talents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <h1>人才列表</h1>
          <div class="page-header-actions">
            <button class="btn btn-primary" onclick="TalentList.openCreateModal()">+ 新建人才</button>
            <button class="btn btn-secondary" onclick="TalentList.exportAll()">📥 导出</button>
          </div>
        </div>
        <div class="filter-bar" style="flex-wrap:wrap">
          <input class="form-input" placeholder="搜索姓名、公司、职位、城市..." value="${escapeHtml(kw)}" style="width:260px"
                 oninput="TalentList.search(this.value)">
          <select class="form-select" onchange="TalentList.applyFilter('filterStatus', this.value)">
            <option value="">接触状态</option>
            ${CONTACT_STATUSES.map(s => `<option ${filterStatus===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <select class="form-select" onchange="TalentList.applyFilter('filterRating', this.value)">
            <option value="">含金量等级</option>
            ${RATINGS.map(r => `<option ${filterRating===r?'selected':''}>${r}</option>`).join('')}
          </select>
          <select class="form-select" onchange="TalentList.applyFilter('filterOwner', this.value)">
            <option value="">归属人</option>
            ${DB.users.map(u => `<option ${filterOwner===u.id?'selected':''} value="${u.id}">${u.name}</option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="TalentList.clearFilters()">清除筛选</button>
          <span class="note">共 ${talents.length} 人</span>
        </div>

        ${talents.length === 0 ? '<div class="empty-state">没有匹配的人才记录</div>' : `
          <table class="table">
            <thead>
              <tr><th>姓名</th><th>等级</th><th>当前公司</th><th>当前职位</th><th>城市</th><th>标签</th><th>接触状态</th><th>归属人</th><th>更新时间</th></tr>
            </thead>
            <tbody>
              ${talents.map(t => {
                const ap = t.positions[0];
                const rating = ap ? (ap.rating || '未评级') : '未评级';
                const pos = ap ? getPosition(ap.positionId) : null;
                return `<tr class="clickable" onclick="App.navigate('talent-detail',{tid:'${t.id}'})">
                  <td><b>${escapeHtml(t.name)}</b></td>
                  <td>${badgeRating(rating)}</td>
                  <td>${escapeHtml(t.currentCompany) || '—'}</td>
                  <td class="muted">${escapeHtml(t.currentPosition) || '—'}</td>
                  <td>${escapeHtml(t.city) || '—'}</td>
                  <td>${(t.tags || []).slice(0,2).map(tg => `<span class="tag tag-blue">${escapeHtml(tg)}</span>`).join(' ') || '—'}</td>
                  <td>${statusTag(t.contactStatus)}</td>
                  <td class="muted">${escapeHtml(t.createdBy || '—')}</td>
                  <td class="muted">${escapeHtml(t.updatedAt.slice(0, 10))}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
      </div>`;
  },

  search(val) {
    if (this._ts) clearTimeout(this._ts);
    this._ts = setTimeout(() => navigateTo('talents', { kw: val }), 300);
  },
  applyFilter(key, val) {
    const p = { ...Route.params, [key]: val || undefined };
    navigateTo('talents', p);
  },
  clearFilters() { navigateTo('talents'); },

  openCreateModal() {
    showModal('手工新建人才档案', `
      <div class="form-group"><label class="form-label">姓名 *</label><input class="form-input" id="ntName"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">当前公司</label><input class="form-input" id="ntCompany"></div>
        <div class="form-group"><label class="form-label">当前职位</label><input class="form-input" id="ntPosition"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">手机号</label><input class="form-input" id="ntPhone"></div>
        <div class="form-group"><label class="form-label">邮箱</label><input class="form-input" id="ntEmail"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">城市</label><input class="form-input" id="ntCity"></div>
        <div class="form-group"><label class="form-label">级别</label><select class="form-select" id="ntLevel">${LEVELS.map(l => `<option>${l}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">关联职位</label><select class="form-select" id="ntPosId"><option value="">选择职位</option>
        ${activePositions().map(p => { const c = getCompany(p.companyId); return `<option value="${p.id}">${escapeHtml(c?c.name:'')} / ${escapeHtml(p.name)}</option>`; }).join('')}
      </select></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="TalentList.create()">创建</button>`,
      { width: '560px' }
    );
  },

  create() {
    const name = document.getElementById('ntName').value.trim();
    const phone = normPhone(document.getElementById('ntPhone').value);
    const email = normEmail(document.getElementById('ntEmail').value);
    if (!name) return showToast('请输入姓名', 'error');
    if (!phone && !email) return showToast('手机号和邮箱至少填一项', 'error');

    // Check dedup
    if (phone) {
      const dup = activeTalents().find(t => normPhone(t.phone) === phone);
      if (dup) return showToast(`与已有人才「${dup.name}」重复（手机号一致）`, 'error');
    }
    if (email) {
      const dup = activeTalents().find(t => normEmail(t.email) === email);
      if (dup) return showToast(`与已有人才「${dup.name}」重复（邮箱一致）`, 'error');
    }

    const now = nowStr();
    const posId = document.getElementById('ntPosId').value;
    const tid = uid('talent');
    DB.talents.push({
      id: tid, name, currentCompany: document.getElementById('ntCompany').value,
      currentPosition: document.getElementById('ntPosition').value,
      level: document.getElementById('ntLevel').value || '不限',
      city: document.getElementById('ntCity').value,
      phone: document.getElementById('ntPhone').value,
      email: document.getElementById('ntEmail').value,
      workYears: '', tags: [],
      ownerId: currentUser().id, contactStatus: '未接触',
      lastContactDate: '', onboardDate: '', giveupReason: '',
      positions: posId ? [{ positionId: posId, rating: '未评级', associatedAt: now }] : [],
      resumeFiles: [],
      workExperiences: [],
      status: 'active',
      createdAt: now, updatedAt: now, version: 1,
      createdBy: currentUser().name, mergedToId: null, note: ''
    });
    logActivity('create', tid, '新建人才档案');
    closeModal(); saveData(); render(); showToast('人才档案已创建');
  },

  exportAll() {
    const talents = activeTalents();
    if (talents.length === 0) return showToast('无可导出数据', 'error');
    const header = '姓名,当前公司,当前职位,级别,城市,手机,邮箱,接触状态,标签,归属人,最近更新时间';
    const rows = talents.map(t => [
      t.name, t.currentCompany, t.currentPosition, t.level, t.city,
      t.phone, t.email, t.contactStatus, (t.tags || []).join(';'),
      t.createdBy, t.updatedAt.slice(0, 10)
    ].map(v => '"' + (v || '') + '"').join(','));
    const BOM = '\uFEFF';
    const csv = BOM + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `人才列表_${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${talents.length} 条记录`);
  }
};
/* ==========================================================================
   页面 6: 解析确认页 (ConfirmPage)
   ========================================================================== */
const ConfirmPage = {
  confBadge(level) {
    const map = { '高': 'tag-green', '中': 'tag-orange', '低': 'tag-red' };
    const label = { '高': '✓', '中': '?', '低': '!' };
    return `<span class="tag ${map[level] || 'tag-gray'}" style="font-size:10px;padding:1px 5px;margin-left:4px">${label[level] || ''} ${level || ''}</span>`;
  },
  render(container, params) {
    const tid = params.tid;
    const drafts = DB.talents.filter(t => t.status === 'draft');
    const current = tid ? getTalent(tid) : drafts[0];
    Route.breadcrumb = [{ label: '工作台', clickable: true, route: 'dashboard' }, { label: '待确认队列' }];

    if (drafts.length === 0) {
      container.innerHTML = `
        <div class="page">
          <div class="page-header"><h1>待确认队列</h1></div>
          <div class="empty-state">暂无待确认草稿</div>
        </div>`;
      return;
    }

    const t = current || drafts[0];
    const pos = t.positions[0] ? getPosition(t.positions[0].positionId) : null;
    const comp = pos ? getCompany(pos.companyId) : null;

    // Simulated parsed fields
    const parsed = {
      name: t.name || '（需补录）', company: t.currentCompany || '（解析未识别）',
      position: t.currentPosition || '', level: t.level || '', city: t.city || '',
      phone: t.phone || '', email: t.email || '', workYears: t.workYears || ''
    };

    container.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <h1>解析确认</h1>
            <span class="note">草稿队列 ${drafts.length} 条</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="App.navigate('dashboard')">返回工作台</button>
          </div>
        </div>

        <div class="confirm-layout">
          <div class="confirm-left card">
            <div class="card-header"><h3>草稿队列</h3></div>
            <div class="card-body">
              ${drafts.map(d => {
                const dp = d.positions[0] ? getPosition(d.positions[0].positionId) : null;
                const dc = dp ? getCompany(dp.companyId) : null;
                return `<div class="draft-item ${d.id === t.id ? 'active' : ''}" onclick="App.navigate('confirm',{tid:'${d.id}'})">
                  <b>${escapeHtml(d.name || '待确认')}</b>
                  <div class="note">${escapeHtml(dc ? dc.name + ' / ' + dp.name : '—')}</div>
                  <div class="note">${escapeHtml(d.createdAt.slice(0,10))}</div>
                </div>`;
              }).join('')}
            </div>
          </div>

          <div class="confirm-right card">
            <div class="card-header">
              <h3>简历原文预览</h3>
              <span class="note">${escapeHtml(t.resumeFiles && t.resumeFiles[0] ? t.resumeFiles[0].name : '无附件')}</span>
            </div>
            <div class="card-body resume-preview">
              <p><b>简历内容模拟预览</b></p>
              <p>姓名：${escapeHtml(t.name || '未知')}</p>
              <p>最近工作：${escapeHtml(t.currentCompany || '未知公司')} ${escapeHtml(t.currentPosition || '')}</p>
              <p>联系方式：${escapeHtml(t.phone || '未提供')} ${escapeHtml(t.email || '')}</p>
              <p class="note">系统已从简历中智能提取以下字段，请核对后确认入池</p>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-header"><h3>解析字段校对</h3>${t.parseError ? '<span class="tag tag-red">解析失败，需手工补录</span>' : ''}</div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label class="form-label">姓名 *</label><input class="form-input" id="cfName" value="${escapeHtml(t.name)}"></div>
              <div class="form-group"><label class="form-label">当前公司</label><input class="form-input" id="cfCompany" value="${escapeHtml(t.currentCompany)}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">当前职位</label><input class="form-input" id="cfPosition" value="${escapeHtml(t.currentPosition)}"></div>
              <div class="form-group"><label class="form-label">级别</label><select class="form-select" id="cfLevel">${LEVELS.map(l => `<option ${t.level===l?'selected':''}>${l}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">城市</label><input class="form-input" id="cfCity" value="${escapeHtml(t.city)}"></div>
              <div class="form-group"><label class="form-label">工作年限</label><input class="form-input" id="cfYears" value="${escapeHtml(t.workYears)}" type="number" min="0" max="60"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">手机号</label><input class="form-input" id="cfPhone" value="${escapeHtml(t.phone)}"></div>
              <div class="form-group"><label class="form-label">邮箱</label><input class="form-input" id="cfEmail" value="${escapeHtml(t.email)}"></div>
            </div>
            <div class="form-group"><label class="form-label">关联职位 *</label>
              <select class="form-select" id="cfPos">${activePositions().map(p => { const c = getCompany(p.companyId); return `<option value="${p.id}" ${t.positions[0] && t.positions[0].positionId===p.id?'selected':''}>${escapeHtml(c?c.name:'')} / ${escapeHtml(p.name)}</option>`; }).join('')}</select>
            </div>
          </div>
          <div class="card-footer" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-top:1px solid var(--color-line)">
            <span class="note">确认后人才将进入地图并参与检索</span>
            <div>
              <button class="btn btn-ghost" onclick="ConfirmPage.discard('${t.id}')">放弃草稿</button>
              <button class="btn btn-primary" onclick="ConfirmPage.confirm('${t.id}')">✓ 确认入池</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  confirm(tid) {
    const t = getTalent(tid); if (!t || t.status !== 'draft') return;
    const name = document.getElementById('cfName').value.trim();
    const phone = normPhone(document.getElementById('cfPhone').value);
    const email = normEmail(document.getElementById('cfEmail').value);
    if (!name) return showToast('请输入姓名', 'error');
    if (!phone && !email) return showToast('手机号和邮箱至少填一项', 'error');

    // Dedup check
    const dup = activeTalents().find(c =>
      c.id !== t.id && ((phone && normPhone(c.phone) === phone) || (email && normEmail(c.email) === email)));
    if (dup) {
      if (!confirm(`发现已有人才「${dup.name}」与当前信息重复（手机号/邮箱一致）。\n点击确定合并到已有档案，取消则仍新建。`)) {
        // 仍然新建
        this.finishConfirm(t, { phone, email, name, asNew: true });
      } else {
        // 合并
        this.mergeTo(dup.id, t);
      }
    } else {
      this.finishConfirm(t, { phone, email, name });
    }
  },

  finishConfirm(t, { name, phone, email, asNew }) {
    t.name = name;
    t.currentCompany = document.getElementById('cfCompany').value;
    t.currentPosition = document.getElementById('cfPosition').value;
    t.level = document.getElementById('cfLevel').value;
    t.city = document.getElementById('cfCity').value;
    t.workYears = document.getElementById('cfYears').value;
    t.phone = document.getElementById('cfPhone').value;
    t.email = document.getElementById('cfEmail').value;
    const posId = document.getElementById('cfPos').value;
    t.positions = [{ positionId: posId, rating: '未评级', associatedAt: t.positions[0] ? t.positions[0].associatedAt : nowStr() }];
    t.status = 'active';
    t.updatedAt = nowStr();
    logActivity('create', t.id, '确认入池', { name: t.name });
    saveData(); render(); showToast('人才已确认入池');
  },

  mergeTo(targetId, draft) {
    const target = getTalent(targetId); if (!target) return;
    // Merge: keep earliest created as main
    let main = target;
    let minor = draft;
    if (draft.createdAt < target.createdAt) { main = draft; minor = target; }

    // Merge tags, positions, resume files
    main.tags = [...new Set([...(main.tags || []), ...(minor.tags || [])])];
    main.positions = [...new Set([...(main.positions || []), ...(minor.positions || [])])];
    main.resumeFiles = [...(main.resumeFiles || []), ...(minor.resumeFiles || [])];

    // Mark minor as merged
    minor.status = 'trash';
    minor.mergedToId = main.id;
    minor.updatedAt = nowStr();
    if (main.id !== target.id) {
      // main was draft, target becomes minor
      main.status = 'active';
      main.name = document.getElementById('cfName').value.trim() || main.name;
    }
    logActivity('merge', main.id, `合并档案 ${minor.name} → ${main.name}`);
    saveData(); render(); showToast('已合并到已有档案');
  },

  discard(tid) {
    const t = getTalent(tid); if (!t) return;
    if (!confirm('确定放弃该草稿？草稿将不保留。')) return;
    DB.talents = DB.talents.filter(x => x.id !== tid);
    saveData(); render(); showToast('草稿已放弃');
  }
};
/* ==========================================================================
   页面 7: 人才详情 (TalentDetail)
   ========================================================================== */
const TalentDetail = {
  render(container, params) {
    const t = getTalent(params.tid);
    if (!t || t.status === 'trash') { container.innerHTML = '<div class="page"><div class="empty-state">该人才不存在或已被删除</div></div>'; return; }
    Route.breadcrumb = [
      { label: '人才列表', clickable: true, route: 'talents' },
      { label: t.name }
    ];

    if (t.status === 'draft') {
      App.navigate('confirm', { tid: t.id });
      return;
    }

    const isArchived = t.status === 'archived';
    const comms = DB.communicationRecords.filter(c => c.talentId === t.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reminder = DB.reminders.find(r => r.talentId === t.id && r.status === 'pending');
    const logs = DB.activityLogs.filter(l => l.talentId === t.id).slice(0, 8);
    const lastComm = comms.find(c => !c.deletedAt);
    const daysSinceLastComm = lastComm ? daysBetween(lastComm.date) : null;

    container.innerHTML = `
      <div class="page">
        ${isArchived ? '<div class="callout" style="margin-bottom:16px">⚠ 该人才已归档，不参与默认检索。 <button class="btn btn-sm btn-primary" onclick="TalentDetail.restore(\'' + t.id + '\')">恢复</button></div>' : ''}

        <div class="page-header">
          <div>
            <h1>${escapeHtml(t.name)} ${isArchived ? '<span class="tag tag-gray">已归档</span>' : ''}</h1>
            <span class="note">${escapeHtml(t.currentCompany)} · ${escapeHtml(t.currentPosition || '—')}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="TalentDetail.editTalent('${t.id}')">编辑</button>
            ${!isArchived ? `<button class="btn btn-ghost" onclick="TalentDetail.archive('${t.id}')">归档</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="TalentDetail.deleteTalent('${t.id}')">删除</button>
          </div>
        </div>

        <div class="detail-layout">
          <!-- 主体 -->
          <div class="detail-main">
            <div class="card">
              <div class="card-header"><h3>基本信息</h3></div>
              <div class="card-body">
                <dl class="info-grid editable-grid">
                  <dt>姓名</dt><dd data-field="name" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'name')">${escapeHtml(t.name)}</dd>
                  <dt>当前公司</dt><dd data-field="currentCompany" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'currentCompany')">${escapeHtml(t.currentCompany) || '—'}</dd>
                  <dt>当前职位</dt><dd data-field="currentPosition" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'currentPosition')">${escapeHtml(t.currentPosition) || '—'}</dd>
                  <dt>级别</dt><dd data-field="level" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'level')">${escapeHtml(t.level || '—')}</dd>
                  <dt>城市</dt><dd data-field="city" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'city')">${escapeHtml(t.city) || '—'}</dd>
                  <dt>工作年限</dt><dd data-field="workYears" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'workYears')">${t.workYears ? t.workYears + '年' : '—'}</dd>
                </dl>
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>联系方式</h3></div>
              <div class="card-body">
                <dl class="info-grid editable-grid">
                  <dt>手机</dt><dd data-field="phone" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'phone')">${escapeHtml(t.phone) || '—'}</dd>
                  <dt>邮箱</dt><dd data-field="email" onclick="TalentDetail.inlineEdit(this, '${t.id}', 'email')">${escapeHtml(t.email) || '—'}</dd>
                </dl>
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>关联职位</h3></div>
              <div class="card-body">
                ${t.positions.length === 0 ? '<div class="empty-state">暂无关联职位</div>' : `
                  <table class="table">
                    <thead><tr><th>公司 / 职位</th><th>含金量等级</th><th>关联时间</th></tr></thead>
                    <tbody>
                      ${t.positions.map(ap => {
                        const p = getPosition(ap.positionId);
                        const c = p ? getCompany(p.companyId) : null;
                        return `<tr>
                          <td>${c ? `<a onclick="App.navigate('company-detail',{cid:'${c.id}'})">${escapeHtml(c.name)}</a> / ` : ''}
                              ${p ? `<a onclick="App.navigate('position-detail',{pid:'${p.id}'})">${escapeHtml(p.name)}</a>` : '<span class="note">职位已删除</span>'}</td>
                          <td>
                            <select class="form-select" style="width:100px" onchange="TalentDetail.setRating('${t.id}','${ap.positionId}',this.value)" ${isArchived?'disabled':''}>
                              ${RATINGS.map(r => `<option value="${r}" ${(ap.rating||'未评级')===r?'selected':''}>${r}</option>`).join('')}
                            </select>
                          </td>
                          <td class="note">${ap.associatedAt ? ap.associatedAt.slice(0,10) : '—'}</td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>`}
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>标签</h3></div>
              <div class="card-body">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                  ${(t.tags || []).map(tg => `<span class="tag tag-blue">${escapeHtml(tg)} <button class="tag-close" onclick="TalentDetail.removeTag('${t.id}','${escapeHtml(tg)}')">&times;</button></span>`).join('')}
                  ${(t.tags||[]).length === 0 ? '<span class="note">—</span>' : ''}
                  ${!isArchived ? `<button class="btn btn-ghost btn-sm" onclick="TalentDetail.addTag('${t.id}')">+ 添加</button>` : ''}
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>工作经历</h3>${!isArchived ? '<button class="btn btn-sm btn-primary" onclick="TalentDetail.addWorkExp(\'' + t.id + '\')">+ 添加</button>' : ''}</div>
              <div class="card-body">
                ${(t.workExperiences && t.workExperiences.length > 0) ? '<div class="timeline">' +
                  t.workExperiences.map((exp, idx) =>
                    '<div class="timeline-item">' +
                      '<div class="timeline-date">' + escapeHtml(exp.startDate || '—') + ' ~ ' + escapeHtml(exp.endDate || '至今') + '</div>' +
                      '<div class="timeline-content">' +
                        '<b>' + escapeHtml(exp.company || '—') + '</b>' +
                        (exp.position ? ' · ' + escapeHtml(exp.position) : '') +
                      '</div>' +
                      (exp.content ? '<div class="note" style="margin-top:4px">' + escapeHtml(exp.content).slice(0, 200) + (exp.content.length > 200 ? '...' : '') + '</div>' : '') +
                      (!isArchived ? '<button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="TalentDetail.removeWorkExp(\'' + t.id + '\',' + idx + ')">删除</button>' : '') +
                    '</div>'
                  ).join('')
                  + '</div>' : '<div class="empty-state">暂无工作经历记录</div>'}
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>简历文件</h3><div style="display:flex;gap:6px"><input type="file" id="resumeFileInput_${t.id}" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.bmp,.webp" style="display:none" onchange="TalentDetail.handleResumeUpload('${t.id}', this)"><button class="btn btn-sm btn-primary" onclick="document.getElementById('resumeFileInput_${t.id}').click()">📄 上传简历识别</button></div></div>
              <div class="card-body">
                ${(t.resumeFiles || []).length === 0 ? '<span class="note">—</span>' : `
                  <ul style="list-style:none;padding:0;margin:0">${t.resumeFiles.map((f, idx) => `
  <li style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5">
    <span>📄</span>
    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
    <span class="note">${escapeHtml(f.size)}</span>
    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();ResumeStorage.viewFile('${f.fileId || ''}')" ${!f.fileId ? 'disabled' : ''} title="查看">👁</button>
    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();ResumeStorage.downloadFile('${f.fileId || ''}')" ${!f.fileId ? 'disabled' : ''} title="下载">⬇</button>
    ${!isArchived ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();TalentDetail.removeResumeFile('${t.id}',${idx})" title="删除">✖</button>` : ''}
  </li>
`).join('')}</ul>`}
              </div>
            </div>
          </div>

          <!-- 右侧栏 -->
          <div class="detail-sidebar">
            <div class="card">
              <div class="card-header"><h3>沟通记录</h3>${!isArchived ? `<button class="btn btn-sm btn-primary" onclick="TalentDetail.addCommunication('${t.id}')">+ 新增</button>` : ''}</div>
              <div class="card-body">
                ${comms.length === 0 ? '<div class="empty-state">暂无沟通记录</div>' : `
                  <div class="timeline">
                    ${comms.map(c => {
                      if (c.deletedAt) return `<div class="timeline-item deleted"><span class="note">该记录已删除（${c.deletedBy || ''}，${c.deletedAt ? c.deletedAt.slice(0,10) : ''}）</span></div>`;
                      return `<div class="timeline-item">
                        <div class="timeline-date">${c.date} · ${c.method}</div>
                        <div class="timeline-content">${escapeHtml(c.content)}</div>
                        <div class="timeline-author note">— ${c.createdBy} ${c.createdAt.slice(0,10)}</div>
                        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="TalentDetail.deleteCommunication('${c.id}')">删除</button>` : ''}
                      </div>`;
                    }).join('')}
                  </div>`}
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>阶段提醒</h3></div>
              <div class="card-body">
                ${reminder ? `
                  <div class="reminder-active">
                    <p><b>到期：</b>${reminder.date}</p>
                    <p>${escapeHtml(reminder.note || '')}</p>
                    <div style="display:flex;gap:4px;margin-top:8px">
                      <button class="btn btn-sm btn-primary" onclick="Dashboard.handleReminder('${reminder.id}','done')">完成</button>
                      <button class="btn btn-sm btn-secondary" onclick="Dashboard.handleReminder('${reminder.id}','delay3')">延期3天</button>
                      <button class="btn btn-sm btn-ghost" onclick="Dashboard.handleReminder('${reminder.id}','close')">关闭</button>
                    </div>
                  </div>` : (isArchived ? '<span class="note">—</span>' : `
                  <button class="btn btn-sm btn-primary" onclick="TalentDetail.setReminder('${t.id}')">设置提醒</button>`)}
                ${daysSinceLastComm !== null && daysSinceLastComm > 14 && !reminder && !isArchived ? '<div class="callout" style="margin-top:8px">💡 最后沟通距今 ' + daysSinceLastComm + ' 天，建议设置跟进提醒</div>' : ''}
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3>操作记录</h3></div>
              <div class="card-body">
                ${logs.length === 0 ? '<div class="empty-state">暂无操作记录</div>' : `
                  <div class="timeline">
                    ${logs.map(l => `<div class="timeline-item">
                      <div class="timeline-date">${l.time}</div>
                      <div>${escapeHtml(l.summary)}</div>
                      <div class="note">— ${escapeHtml(l.actor)}</div>
                    </div>`).join('')}
                  </div>`}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  setRating(tid, posId, val) {
    const t = getTalent(tid); if (!t) return;
    const ap = t.positions.find(a => a.positionId === posId);
    if (ap) {
      const old = ap.rating || '未评级';
      ap.rating = val;
      logActivity('rating', tid, `含金量等级: ${old} → ${val}`);
      saveData(); render(); showToast(`等级已设为 ${val}`);
    }
  },

  // Inline editing - click any field to edit directly
  inlineEdit(el, tid, field) {
    // Prevent double-edit
    if (el.querySelector('input')) return;
    
    const t = getTalent(tid); if (!t || t.status === 'archived') return;
    
    let currentValue = '';
    if (field === 'workYears') {
      currentValue = t.workYears || '';
    } else {
      currentValue = t[field] || '';
    }
    
    const originalHTML = el.innerHTML;
    el.innerHTML = '<input class="form-input inline-input" value="' + escapeHtml(currentValue) + '" style="padding:4px 6px;width:100%">';
    const input = el.querySelector('input');
    input.focus();
    input.select();
    
    const save = () => {
      const newVal = input.value.trim();
      if (field === 'workYears') {
        t.workYears = newVal;
      } else {
        t[field] = newVal;
      }
      t.updatedAt = nowStr();
      logActivity('edit', tid, t.name + ' - ' + field + ': ' + (currentValue || '空') + ' → ' + (newVal || '空'));
      saveData();
      // Update display
      if (field === 'workYears') {
        el.innerHTML = newVal ? newVal + '年' : '—';
      } else {
        el.innerHTML = escapeHtml(newVal) || '—';
      }
      showToast('已保存');
    };
    
    const cancel = () => {
      el.innerHTML = originalHTML;
    };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { cancel(); }
    });
  },

  editTalent(tid) {
    const t = getTalent(tid); if (!t) return;
    showModal('编辑人才档案', `
      <div class="form-group"><label class="form-label">姓名 *</label><input class="form-input" id="etName" value="${escapeHtml(t.name)}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">当前公司</label><input class="form-input" id="etCompany" value="${escapeHtml(t.currentCompany)}"></div>
        <div class="form-group"><label class="form-label">当前职位</label><input class="form-input" id="etPosition" value="${escapeHtml(t.currentPosition)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">手机号</label><input class="form-input" id="etPhone" value="${escapeHtml(t.phone)}"></div>
        <div class="form-group"><label class="form-label">邮箱</label><input class="form-input" id="etEmail" value="${escapeHtml(t.email)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">城市</label><input class="form-input" id="etCity" value="${escapeHtml(t.city)}"></div>
        <div class="form-group"><label class="form-label">级别</label><select class="form-select" id="etLevel">${LEVELS.map(l => `<option ${t.level===l?'selected':''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">接触状态</label><select class="form-select" id="etStatus">${CONTACT_STATUSES.map(s => `<option ${t.contactStatus===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">归属人</label><select class="form-select" id="etOwner">${DB.users.map(u => `<option value="${u.id}" ${t.ownerId===u.id?'selected':''}>${u.name}</option>`).join('')}</select></div>
      </div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="TalentDetail.saveEdit('${tid}')">保存</button>`,
      { width: '560px' }
    );
  },

  saveEdit(tid) {
    const t = getTalent(tid); if (!t) return;
    const name = document.getElementById('etName').value.trim();
    if (!name) return showToast('请输入姓名', 'error');
    const changes = [];
    if (t.name !== name) changes.push(`姓名: ${t.name} → ${name}`);
    t.name = name;
    t.currentCompany = document.getElementById('etCompany').value;
    t.currentPosition = document.getElementById('etPosition').value;
    t.phone = document.getElementById('etPhone').value;
    t.email = document.getElementById('etEmail').value;
    t.city = document.getElementById('etCity').value;
    t.level = document.getElementById('etLevel').value;
    const oldStatus = t.contactStatus;
    t.contactStatus = document.getElementById('etStatus').value;
    if (oldStatus !== t.contactStatus) changes.push(`接触状态: ${oldStatus} → ${t.contactStatus}`);
    t.ownerId = document.getElementById('etOwner').value;
    t.updatedAt = nowStr();
    logActivity('edit', tid, '编辑人才档案', changes.join('; '));
    closeModal(); saveData(); render(); showToast('已保存');
  },

  addTag(tid) {
    const tag = prompt('输入新标签（≤10字）：');
    if (!tag || tag.trim().length > 10) return showToast('标签不能超过10字', 'error');
    const t = getTalent(tid); if (!t) return;
    if ((t.tags || []).length >= 10) return showToast('最多10个标签', 'error');
    if (!t.tags) t.tags = [];
    if (t.tags.includes(tag.trim())) return showToast('标签已存在', 'error');
    t.tags.push(tag.trim());
    t.updatedAt = nowStr();
    logActivity('tag', tid, `添加标签: ${tag.trim()}`);
    saveData(); render(); showToast('标签已添加');
  },

  removeTag(tid, tag) {
    const t = getTalent(tid); if (!t) return;
    t.tags = (t.tags || []).filter(tg => tg !== tag);
    t.updatedAt = nowStr();
    logActivity('tag', tid, `移除标签: ${tag}`);
    saveData(); render(); showToast('标签已移除');
  },

  addCommunication(tid) {
    showModal('新增沟通记录', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">沟通日期 *</label><input class="form-input" type="date" id="acDate" value="${todayStr()}" max="${todayStr()}"></div>
        <div class="form-group"><label class="form-label">方式</label><select class="form-select" id="acMethod">${COMMUNICATION_METHODS.map(m => `<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">沟通内容 * (≤500字)</label><textarea class="form-textarea" id="acContent" rows="4" maxlength="500"></textarea></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="TalentDetail.saveCommunication('${tid}')">保存</button>`,
      { width: '500px' }
    );
  },

  saveCommunication(tid) {
    const date = document.getElementById('acDate').value;
    const content = document.getElementById('acContent').value.trim();
    if (!date) return showToast('请选择沟通日期', 'error');
    if (!content) return showToast('请输入沟通内容', 'error');
    DB.communicationRecords.push({
      id: uid('comm'), talentId: tid,
      date, method: document.getElementById('acMethod').value,
      content, createdBy: currentUser().name,
      createdAt: nowStr(),
      deletedAt: null, deletedBy: null
    });
    // Auto-update contact status if still 未接触
    const t = getTalent(tid);
    if (t && t.contactStatus === '未接触') {
      t.contactStatus = '已联系';
      t.lastContactDate = date;
    } else if (t) {
      t.lastContactDate = date;
    }
    logActivity('communication', tid, `新增沟通记录 (${date})`);
    closeModal(); saveData(); render(); showToast('沟通记录已保存');
  },

  deleteCommunication(cid) {
    if (!isAdmin()) return showToast('仅管理员可删除沟通记录', 'error');
    const c = DB.communicationRecords.find(x => x.id === cid);
    if (!c || !confirm('确定删除该沟通记录？')) return;
    c.deletedAt = nowStr();
    c.deletedBy = currentUser().name;
    logActivity('communication_delete', c.talentId, `删除沟通记录 (${c.date})`);
    saveData(); render(); showToast('沟通记录已删除');
  },

  setReminder(tid) {
    const t = getTalent(tid); if (!t) return;
    if (t.contactStatus === '未接触') return showToast('请先新增至少一条沟通记录', 'error');
    showModal('设置阶段提醒', `
      <div class="form-group"><label class="form-label">提醒日期 *</label><input class="form-input" type="date" id="srDate" min="${todayStr()}" value="${todayStr()}"></div>
      <div class="form-group"><label class="form-label">提醒说明 (≤200字)</label><textarea class="form-textarea" id="srNote" rows="3" maxlength="200" placeholder="例如：跟进候选人薪资期望"></textarea></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="TalentDetail.saveReminder('${tid}')">保存</button>`
    );
  },

  saveReminder(tid) {
    const date = document.getElementById('srDate').value;
    const note = document.getElementById('srNote').value.trim();
    if (!date) return showToast('请选择日期', 'error');
    // Close any existing pending reminder
    const existing = DB.reminders.find(r => r.talentId === tid && r.status === 'pending');
    if (existing) existing.status = 'closed';
    DB.reminders.push({
      id: uid('rem'), talentId: tid,
      date, note, status: 'pending',
      createdBy: currentUser().name
    });
    logActivity('reminder', tid, `设置阶段提醒: ${date}`);
    closeModal(); saveData(); render(); showToast('提醒已设置');
  },

  archive(tid) {
    if (!confirm('归档后该人才不参与默认检索，确定归档？')) return;
    const t = getTalent(tid); if (!t) return;
    t.status = 'archived';
    t.updatedAt = nowStr();
    // Close pending reminders
    DB.reminders.filter(r => r.talentId === tid && r.status === 'pending').forEach(r => r.status = 'closed');
    logActivity('archive', tid, '归档人才');
    saveData(); render(); showToast('人才已归档');
  },

  restore(tid) {
    const t = getTalent(tid); if (!t) return;
    t.status = 'active';
    t.updatedAt = nowStr();
    logActivity('restore', tid, '恢复归档人才');
    saveData(); render(); showToast('人才已恢复');
  },

  deleteTalent(tid) {
    const t = getTalent(tid); if (!t || !confirm('确定删除该人才？将移入回收站，30天内可恢复')) return;
    t.status = 'trash';
    t.updatedAt = nowStr();
    DB.reminders.filter(r => r.talentId === tid && r.status === 'pending').forEach(r => r.status = 'closed');
    logActivity('delete', tid, '删除人才（移入回收站）');
    saveData();
    App.navigate('talents');
    showToast('人才已移入回收站');
  },

  addWorkExp(tid) {
    const t = getTalent(tid); if (!t) return;
    showModal('添加工作经历', `
      <div class="form-group"><label class="form-label">公司名称 *</label><input class="form-input" id="weCompany"></div>
      <div class="form-group"><label class="form-label">职位</label><input class="form-input" id="wePosition"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">开始时间</label><input class="form-input" id="weStart" type="month"></div>
        <div class="form-group"><label class="form-label">结束时间</label><input class="form-input" id="weEnd" type="month" placeholder="留空表示至今"></div>
      </div>
      <div class="form-group"><label class="form-label">工作内容</label><textarea class="form-textarea" id="weContent" rows="4" placeholder="工作职责、项目经历、主要成就"></textarea></div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
       <button class="btn btn-primary" onclick="TalentDetail.saveWorkExp('${tid}')">保存</button>`
    );
  },

  saveWorkExp(tid) {
    const t = getTalent(tid); if (!t) return;
    const company = document.getElementById('weCompany').value.trim();
    if (!company) return showToast('请输入公司名称', 'error');
    if (!t.workExperiences) t.workExperiences = [];
    t.workExperiences.push({
      company: company,
      position: document.getElementById('wePosition').value.trim(),
      startDate: document.getElementById('weStart').value,
      endDate: document.getElementById('weEnd').value || '至今',
      content: document.getElementById('weContent').value.trim()
    });
    t.updatedAt = nowStr();
    logActivity('edit', tid, '添加工作经历: ' + company);
    closeModal(); saveData(); render(); showToast('工作经历已添加');
  },

  removeResumeFile(tid, idx) {
    const t = getTalent(tid); if (!t || !t.resumeFiles) return;
    const f = t.resumeFiles[idx];
    if (!confirm('确定删除简历文件: ' + (f.name || '') + ' ？')) return;
    // Delete from IndexedDB
    if (f.fileId) {
      ResumeStorage.deleteFile(f.fileId).catch(e => console.warn('Delete file failed:', e.message));
    }
    t.resumeFiles.splice(idx, 1);
    t.updatedAt = nowStr();
    logActivity('edit', tid, '删除简历文件: ' + (f.name || ''));
    saveData(); render(); showToast('简历文件已删除');
  },

  removeWorkExp(tid, idx) {
    const t = getTalent(tid); if (!t || !t.workExperiences) return;
    if (!confirm('确定删除该条工作经历？')) return;
    t.workExperiences.splice(idx, 1);
    t.updatedAt = nowStr();
    logActivity('edit', tid, '删除工作经历');
    saveData(); render(); showToast('工作经历已删除');
  },

  async handleResumeUpload(tid, inputEl) {
    const t = getTalent(tid); if (!t) return;
    const file = inputEl.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('文件超过 10 MB 限制', 'error');
      return;
    }

    showToast('正在解析简历...', 'info');
    try {
      const result = await ResumeParser.parseFile(file);

      // Save file blob to IndexedDB
      const fileId = tid + '_resume_' + Date.now();
      try {
        await ResumeStorage.saveFile(fileId, file.name, new Blob([file], { type: file.type }), file.type);
      } catch (e) { console.warn('IndexedDB save failed:', e.message); }

      // Add to resume files
      if (!t.resumeFiles) t.resumeFiles = [];
      t.resumeFiles.push({ name: file.name, size: (file.size / 1024).toFixed(0) + ' KB', fileId });

      // Extract work experiences from parsed result
      if (result.workExperiences && result.workExperiences.length > 0) {
        if (!t.workExperiences) t.workExperiences = [];
        let added = 0;
        for (const exp of result.workExperiences) {
          // Avoid duplicates - check if similar company+time already exists
          const dup = t.workExperiences.some(e =>
            e.company === exp.company &&
            e.startDate === exp.startDate &&
            e.endDate === exp.endDate
          );
          if (!dup) {
            t.workExperiences.push(exp);
            added++;
          }
        }
        if (added > 0) {
          logActivity('edit', tid, '从简历自动提取 ' + added + ' 条工作经历');
        }
      }

      // Also update basic fields if empty
      if (!t.currentCompany && result.company) t.currentCompany = result.company;
      if (!t.currentPosition && result.position) t.currentPosition = result.position;
      if (!t.phone && result.phone) t.phone = result.phone;
      if (!t.email && result.email) t.email = result.email;
      if (!t.city && result.city) t.city = result.city;
      if (!t.level && result.level) t.level = result.level;

      t.updatedAt = nowStr();
      saveData(); render();

      // Sync to server in API mode
      if (IS_API_MODE) {
        try {
          await ApiClient.updateTalent(tid, {
            currentCompany: t.currentCompany || '',
            currentPosition: t.currentPosition || '',
            phone: t.phone || '',
            email: t.email || '',
            city: t.city || '',
            level: t.level || ''
          });
          // Sync new work experiences
          const newExps = (t.workExperiences || []).slice();
          for (const exp of newExps) {
            await ApiClient.addWorkExperience(tid, {
              company: exp.company || '',
              position: exp.position || '',
              startDate: exp.startDate || '',
              endDate: exp.endDate || '',
              content: exp.content || ''
            });
          }
        } catch (e) {
          console.warn('API sync failed:', e.message);
        }
      }

      showToast('简历已解析，工作经历已自动提取', 'success');
    } catch (err) {
      console.error('Resume parse error:', err);
      // Save file blob to IndexedDB
      const fileId = tid + '_resume_' + Date.now();
      try {
        await ResumeStorage.saveFile(fileId, file.name, new Blob([file], { type: file.type }), file.type);
      } catch (e) { console.warn('IndexedDB save failed:', e.message); }

      // Still add the file even if parsing fails
      if (!t.resumeFiles) t.resumeFiles = [];
      t.resumeFiles.push({ name: file.name, size: (file.size / 1024).toFixed(0) + ' KB', fileId });
      t.updatedAt = nowStr();
      saveData(); render();
      showToast('简历已添加，但自动识别失败: ' + err.message, 'warn');
    }
  },

  /* 上传简历直接自动录入新人才 */
  async uploadResumeAuto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.doc,.jpg,.jpeg,.png,.bmp,.webp';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showToast('文件超过 10 MB 限制', 'error');
        return;
      }
      showToast('正在解析简历...', 'info');
      try {
        const result = await ResumeParser.parseFile(file);

        // Build parsed data
        const parsed = {
          name: result.name || '待确认',
          currentCompany: result.company || '',
          currentPosition: result.position || '',
          phone: result.phone || '',
          email: result.email || '',
          city: result.city || '',
          level: result.level || '',
          workYears: result.workYears || '',
          workExperiences: result.workExperiences || [],
          resumeName: file.name,
          resumeSize: (file.size / 1024).toFixed(0) + ' KB'
        };

        if (IS_API_MODE) {
          // Create talent in server
          const created = await ApiClient.createTalent({
            name: parsed.name,
            currentCompany: parsed.currentCompany,
            currentPosition: parsed.currentPosition,
            phone: parsed.phone,
            email: parsed.email,
            city: parsed.city,
            level: parsed.level,
            positions: []
          });
          // Add work experiences to server
          for (const exp of parsed.workExperiences) {
            await ApiClient.addWorkExperience(created.id, {
              company: exp.company || '',
              position: exp.position || '',
              startDate: exp.startDate || '',
              endDate: exp.endDate || '',
              content: exp.content || ''
            });
          }
          App.navigate('talent-detail', { tid: created.id });
          showToast('✅ 简历已识别并自动录入', 'success');
        } else {
          // Local mode: add to in-memory DB
          const tid = uid('talent');
          DB.talents.push({
            id: tid, name: parsed.name,
            currentCompany: parsed.currentCompany, currentPosition: parsed.currentPosition,
            level: parsed.level, city: parsed.city,
            phone: parsed.phone, email: parsed.email,
            workYears: parsed.workYears, tags: [],
            ownerId: currentUser().id, contactStatus: '未接触',
            lastContactDate: '', onboardDate: '', giveupReason: '',
            positions: [],
            resumeFiles: [{ name: parsed.resumeName, size: parsed.resumeSize }],
            status: 'active',
            workExperiences: parsed.workExperiences,
            createdAt: nowStr(), updatedAt: nowStr(), version: 1,
            createdBy: currentUser().name, mergedToId: null, note: ''
          });
          saveData();
          App.navigate('talent-detail', { tid });
          showToast('✅ 简历已识别并自动录入', 'success');
        }
      } catch (err) {
        console.error('Auto import error:', err);
        showToast('识别失败: ' + err.message, 'error');
      }
    };
    input.click();
  }
};
/* ==========================================================================
   页面 8: 设置 (Settings)
   ========================================================================== */
const Settings = {
  render(container) {
    Route.breadcrumb = [{ label: '设置' }];
    const trash = DB.talents.filter(t => t.status === 'trash');
    const trashCompanies = DB.companies.filter(c => c.deletedAt);
    const trashPositions = DB.positions.filter(p => p.deletedAt);

    container.innerHTML = `
      <div class="page">
        <div class="page-header"><h1>设置</h1></div>

        <div class="tabs" style="margin-bottom:20px">
          <button class="tab active" onclick="Settings.switchTab('space')">空间信息</button>
          <button class="tab" onclick="Settings.switchTab('members')">成员管理</button>
          <button class="tab" onclick="Settings.switchTab('tags')">标签字典</button>
          <button class="tab" onclick="Settings.switchTab('recycle')">回收站 ${trash.length + trashCompanies.length + trashPositions.length > 0 ? '<span class="badge badge-count warn-bg">' + (trash.length + trashCompanies.length + trashPositions.length) + '</span>' : ''}</button>
          <button class="tab" onclick="Settings.switchTab('feishu')">飞书配置</button>
        </div>

        <div id="settingsTabContent">
          ${Settings.renderSpaceTab()}
        </div>
      </div>`;

    this.currentTab = 'space';
    this.bindTabClicks();
  },

  bindTabClicks() {
    document.querySelectorAll('.tab').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
      });
    });
  },

  switchTab(tab) {
    const ct = document.getElementById('settingsTabContent');
    if (tab === 'space') ct.innerHTML = Settings.renderSpaceTab();
    else if (tab === 'members') ct.innerHTML = Settings.renderMembersTab();
    else if (tab === 'tags') ct.innerHTML = Settings.renderTagsTab();
    else if (tab === 'recycle') ct.innerHTML = Settings.renderRecycleTab();
    else if (tab === 'feishu') ct.innerHTML = Settings.renderFeishuTab();
    this.currentTab = tab;
    this.bindTabClicks();
  },

  renderSpaceTab() {
    return `
      <div class="card">
        <div class="card-header"><h3>空间信息</h3></div>
        <div class="card-body">
          <div class="form-group"><label class="form-label">空间名称</label><input class="form-input" id="ssName" value="${escapeHtml(DB.space.name)}"></div>
          <div class="form-group"><label class="form-label">成员数量</label><p>${DB.users.length} 人</p></div>
          <div class="form-group"><label class="form-label">人才总数</label><p>${activeTalents().length} 条</p></div>
          <div class="form-group"><label class="form-label">公司总数</label><p>${activeCompanies().length} 家</p></div>
          <button class="btn btn-primary" onclick="Settings.saveSpace()">保存</button>
        </div>
      </div>`;
  },

  saveSpace() {
    DB.space.name = document.getElementById('ssName').value.trim();
    saveData(); render(); showToast('空间信息已更新');
  },

    renderFeishuTab() {
    if (!isAdmin()) return '<div class="card"><div class="card-body"><div class="empty-state">仅管理员可配置</div></div></div>';
    const url = (DB.settings && DB.settings.feishuWebhook) || '';
    return '<div class="card"><div class="card-header"><h3>飞书集成配置</h3></div><div class="card-body"><div class="form-group"><label class="form-label">飞书机器人 Webhook 地址</label><input class="form-input" id="fsWebhook" value="' + escapeHtml(url) + '" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."><small style="color:var(--color-secondary)">在飞书群聊中添加自定义机器人，复制 Webhook 地址粘贴到这里</small></div><div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="Settings.saveFeishu()">保存配置</button><button class="btn btn-secondary" onclick="Settings.testFeishu()">发送测试消息</button></div></div></div>';
  },
  async saveFeishu() {
    const url = document.getElementById('fsWebhook').value.trim();
    if (IS_API_MODE) {
      const r = await ApiClient.updateSettings({ feishuWebhook: url });
      if (r.error) { showToast(r.error, 'error'); return; }
      showToast('飞书配置已保存');
    } else {
      if (!DB.settings) DB.settings = {};
      DB.settings.feishuWebhook = url;
      saveData();
      showToast('飞书配置已保存（仅本地，需服务器模式才能推送）');
    }
  },
  async testFeishu() {
    const url = document.getElementById('fsWebhook').value.trim();
    if (!url) { showToast('请先填写 Webhook 地址', 'warn'); return; }
    if (IS_API_MODE) {
      showToast('正在发送...');
      const r = await ApiClient.testFeishu();
      if (r.ok) showToast(r.msg || '发送成功');
      else showToast(r.error || '发送失败', 'error');
    } else {
      showToast('请使用服务器版本（非本地文件打开）测试', 'warn');
    }
  },

  renderMembersTab() {
    if (!isAdmin()) return '<div class="card"><div class="card-body"><div class="empty-state">仅管理员可管理成员</div></div></div>';
    return `
      <div class="card">
        <div class="card-header">
          <h3>团队成员</h3>
          <button class="btn btn-primary btn-sm" onclick="Settings.inviteMember()">+ 邀请成员</button>
        </div>
        <div class="card-body">
          <table class="table">
            <thead><tr><th>姓名</th><th>邮箱</th><th>角色</th><th>操作</th></tr></thead>
            <tbody>
              ${DB.users.map(u => `
                <tr>
                  <td><b>${escapeHtml(u.name)}</b>${u.id === currentUser().id ? ' <span class="tag tag-green">我</span>' : ''}</td>
                  <td>${escapeHtml(u.email)}</td>
                  <td>
                    <select class="form-select" style="width:120px" onchange="Settings.changeRole('${u.id}',this.value)" ${u.id === currentUser().id ? 'disabled' : ''}>
                      <option value="admin" ${u.role==='admin'?'selected':''}>管理员</option>
                      <option value="member" ${u.role==='member'?'selected':''}>HR 成员</option>
                    </select>
                  </td>
                  <td>
                    ${u.id !== currentUser().id ? `<button class="btn btn-danger btn-sm" onclick="Settings.removeMember('${u.id}')">移除</button>` : '<span class="note">—</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
          ${DB.users.length < 2 ? '<div class="note">邀请团队成员一起使用</div>' : ''}
        </div>
      </div>`;
  },

  inviteMember() {
    const email = prompt('输入被邀请人邮箱：');
    if (!email) return;
    if (DB.users.some(u => u.email === email)) return showToast('该邮箱已属于当前空间', 'error');
    const token = uid('inv');
    const expires = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10) + ' 23:59';
    DB.invites.push({ id: token, email, token, expiresAt: expires, used: false });
    saveData();
    showToast(`邀请链接已生成（模拟）：/join?token=${token}`);
    render();
  },

  changeRole(uid, role) {
    const u = DB.users.find(u => u.id === uid);
    if (!u) return;
    if (role === 'member' && DB.users.filter(u => u.role === 'admin').length <= 1 && u.role === 'admin')
      return showToast('至少保留1名管理员', 'error');
    u.role = role;
    saveData();
    showToast('角色已更新');
  },

  removeMember(uid) {
    const u = DB.users.find(u => u.id === uid);
    if (!u || !confirm(`确定移除「${u.name}」？其数据归属将转交给管理员。`)) return;
    // Reassign ownership to current admin
    DB.talents.forEach(t => { if (t.ownerId === uid) t.ownerId = currentUser().id; });
    DB.users = DB.users.filter(u => u.id !== uid);
    saveData(); render(); showToast('成员已移除');
  },

  renderTagsTab() {
    const allTags = [...new Set(activeTalents().flatMap(t => t.tags || []))];
    return `
      <div class="card">
        <div class="card-header"><h3>标签字典</h3></div>
        <div class="card-body">
          ${allTags.length === 0 ? '<div class="empty-state">暂无标签</div>' : `
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${allTags.map(tg => `<span class="tag tag-blue">${escapeHtml(tg)}</span>`).join('')}
            </div>`}
          <div class="note" style="margin-top:8px">标签在录入人才时自动创建。管理员可在此查看。</div>
        </div>
      </div>`;
  },

  renderRecycleTab() {
    const trash = DB.talents.filter(t => t.status === 'trash');
    const trashCompanies = DB.companies.filter(c => c.deletedAt);
    const trashPositions = DB.positions.filter(p => p.deletedAt);

    return `
      <div class="card">
        <div class="card-header">
          <h3>回收站</h3>
          <span class="note">（30天后自动清除）</span>
        </div>
        <div class="card-body">
          ${trashCompanies.length > 0 ? `<h4>公司 (${trashCompanies.length})</h4>
            <table class="table">
              ${trashCompanies.map(c => `<tr>
                <td>${escapeHtml(c.name)}</td>
                <td class="note">删除时间: ${c.deletedAt ? c.deletedAt.slice(0,10) : ''}</td>
                <td>${isAdmin() ? `<button class="btn btn-sm btn-primary" onclick="Settings.restoreCompany('${c.id}')">恢复</button>
                  <button class="btn btn-sm btn-danger" onclick="Settings.permanentDelete('company','${c.id}')">彻底删除</button>` : '<span class="note">仅管理员可操作</span>'}</td>
              </tr>`).join('')}
            </table>` : ''}

          ${trashPositions.length > 0 ? `<h4>职位 (${trashPositions.length})</h4>
            <table class="table">
              ${trashPositions.map(p => `<tr>
                <td>${escapeHtml(p.name)}</td>
                <td class="note">删除时间: ${p.deletedAt ? p.deletedAt.slice(0,10) : ''}</td>
                <td>${isAdmin() ? `<button class="btn btn-sm btn-primary" onclick="Settings.restorePosition('${p.id}')">恢复</button>
                  <button class="btn btn-sm btn-danger" onclick="Settings.permanentDelete('position','${p.id}')">彻底删除</button>` : '<span class="note">仅管理员可操作</span>'}</td>
              </tr>`).join('')}
            </table>` : ''}

          ${trash.length > 0 ? `<h4>人才 (${trash.length})</h4>
            <table class="table">
              <thead><tr><th>姓名</th><th>当前公司</th><th>删除时间</th><th>操作</th></tr></thead>
              <tbody>
                ${trash.map(t => `<tr>
                  <td>${escapeHtml(t.name)}</td>
                  <td class="muted">${escapeHtml(t.currentCompany) || '—'}</td>
                  <td class="note">${t.updatedAt.slice(0,10)}</td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="Settings.restoreTalent('${t.id}')">恢复</button>
                    ${isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="Settings.permanentDelete('talent','${t.id}')">彻底删除</button>` : ''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>` : ''}

          ${trash.length + trashCompanies.length + trashPositions.length === 0 ? '<div class="empty-state">回收站为空</div>' : ''}
        </div>
      </div>`;
  },

  restoreCompany(cid) {
    if (!isAdmin()) return showToast('仅管理员可操作', 'error');
    const c = DB.companies.find(c => c.id === cid);
    if (c) { c.deletedAt = null; c.updatedAt = nowStr(); }
    saveData(); render(); showToast('公司已恢复');
  },

  restorePosition(pid) {
    if (!isAdmin()) return showToast('仅管理员可操作', 'error');
    const p = DB.positions.find(p => p.id === pid);
    if (p) { p.deletedAt = null; p.updatedAt = nowStr(); }
    saveData(); render(); showToast('职位已恢复');
  },

  restoreTalent(tid) {
    const t = getTalent(tid); if (!t) return;
    // Check if duplicate phone/email exists
    const phone = normPhone(t.phone);
    const email = normEmail(t.email);
    const dup = activeTalents().find(x => x.id !== tid && ((phone && normPhone(x.phone) === phone) || (email && normEmail(x.email) === email)));
    if (dup) return showToast(`与已有人才「${dup.name}」重复，请先处理`, 'error');
    t.status = 'active';
    t.updatedAt = nowStr();
    logActivity('restore', tid, '从回收站恢复');
    saveData(); render(); showToast('人才已恢复');
  },

  permanentDelete(type, id) {
    if (!isAdmin()) return showToast('仅管理员可操作', 'error');
    if (!confirm('彻底删除后不可恢复，确定？')) return;
    if (type === 'talent') DB.talents = DB.talents.filter(t => t.id !== id);
    else if (type === 'company') DB.companies = DB.companies.filter(c => c.id !== id);
    else if (type === 'position') DB.positions = DB.positions.filter(p => p.id !== id);
    saveData(); render(); showToast('已彻底删除');
  }
};

/* ---------- 初始化 ---------- */
function init() {
  // Ensure there's at least one user and logged in
  if (!DB.currentUserId || !DB.users.find(u => u.id === DB.currentUserId)) {
    DB.currentUserId = DB.users[0].id;
  }
  saveData();
  render();
}

// Auto-start
document.addEventListener('DOMContentLoaded', init);
/* ---------- 种子数据（演示用） ---------- */
function seedDemoData() {
  if (DB.companies.length > 0) return; // 已有数据则跳过

  const now = nowStr();
  const admin = DB.users[0];

  // 示例公司
  const comp1 = { id: uid('comp'), name: '字节跳动', industry: '互联网', scale: '2000 人以上', city: '北京', priority: '高', note: '重点目标公司', deletedAt: null, createdAt: now, updatedAt: now };
  const comp2 = { id: uid('comp'), name: '阿里巴巴', industry: '互联网', scale: '2000 人以上', city: '杭州', priority: '高', note: '', deletedAt: null, createdAt: now, updatedAt: now };
  const comp3 = { id: uid('comp'), name: '美团', industry: '互联网', scale: '2000 人以上', city: '北京', priority: '中', note: '', deletedAt: null, createdAt: now, updatedAt: now };
  DB.companies = [comp1, comp2, comp3];

  // 示例职位
  const pos1 = { id: uid('pos'), companyId: comp1.id, name: '高级前端工程师', function: '技术', level: '高级', city: '北京', status: '盘点中', deletedAt: null, createdAt: now, updatedAt: now };
  const pos2 = { id: uid('pos'), companyId: comp1.id, name: '产品经理', function: '产品', level: '高级', city: '上海', status: '盘点中', deletedAt: null, createdAt: now, updatedAt: now };
  const pos3 = { id: uid('pos'), companyId: comp2.id, name: 'Java 技术专家', function: '技术', level: '专家', city: '杭州', status: '盘点中', deletedAt: null, createdAt: now, updatedAt: now };
  const pos4 = { id: uid('pos'), companyId: comp3.id, name: '数据分析师', function: '数据', level: '中级', city: '北京', status: '盘点中', deletedAt: null, createdAt: now, updatedAt: now };
  DB.positions = [pos1, pos2, pos3, pos4];

  // 示例人才
  const talents = [
    { name: '张伟', company: '字节跳动', position: '高级前端工程师', city: '北京', level: '高级', phone: '13800138001', email: 'zhangwei@example.com', rating: 'S', status: '已联系', tags: ['React', 'TypeScript'], posId: pos1.id },
    { name: '李娜', company: '阿里巴巴', position: '前端技术专家', city: '杭州', level: '专家', phone: '13800138002', email: 'lina@example.com', rating: 'A', status: '沟通中', tags: ['Vue', 'Node.js'], posId: pos1.id },
    { name: '王磊', company: '字节跳动', position: '产品经理', city: '北京', level: '高级', phone: '13800138003', email: 'wanglei@example.com', rating: 'S', status: '未接触', tags: ['B端'], posId: pos2.id },
    { name: '陈静', company: '美团', position: '高级产品经理', city: '北京', level: '高级', phone: '13800138004', email: 'chenjing@example.com', rating: 'A', status: '已推荐', tags: ['C端', '用户增长'], posId: pos2.id },
    { name: '赵明', company: '阿里巴巴', position: 'Java架构师', city: '杭州', level: '专家', phone: '13800138005', email: 'zhaoming@example.com', rating: 'A', status: '已联系', tags: ['Spring', '分布式'], posId: pos3.id },
    { name: '刘洋', company: '华为', position: 'Java高级工程师', city: '深圳', level: '高级', phone: '13800138006', email: 'liuyang@example.com', rating: 'B', status: '未接触', tags: [], posId: pos3.id },
    { name: '周敏', company: '字节跳动', position: '数据分析师', city: '上海', level: '中级', phone: '13800138007', email: 'zhoumin@example.com', rating: 'B', status: '已入职', tags: ['Python', 'SQL'], posId: pos4.id },
  ];

  const talentRecords = talents.map(t => ({
    id: uid('talent'),
    name: t.name, currentCompany: t.company, currentPosition: t.position,
    level: t.level, city: t.city,
    phone: t.phone, email: t.email, workYears: String(Math.floor(Math.random() * 10) + 3),
    tags: t.tags,
    ownerId: admin.id,
    contactStatus: t.status, lastContactDate: t.status === '未接触' ? '' : todayStr(),
    onboardDate: t.status === '已入职' ? todayStr() : '',
    giveupReason: '',
    positions: [{ positionId: t.posId, rating: t.rating, associatedAt: now }],
    resumeFiles: [{ name: t.name + '_简历.pdf', size: '245 KB' }],
    status: 'active',
    workExperiences: [
      { company: t.company, position: t.position, startDate: (2026 - parseInt(t.workYears || '5')) + '-01', endDate: '至今', content: t.tags.length > 0 ? '负责' + t.tags.join('、') + '相关项目的技术架构与研发' : '' }
    ],
    createdAt: now, updatedAt: now, version: 1,
    createdBy: admin.name, mergedToId: null, note: ''
  }));
  DB.talents = talentRecords;

  // 示例沟通记录
  DB.communicationRecords.push(
    { id: uid('comm'), talentId: talentRecords[0].id, date: '2026-10-25', method: '电话', content: '初步沟通，候选人对新机会持开放态度，目前在字节负责抖音电商前端架构', createdBy: admin.name, createdAt: now, deletedAt: null, deletedBy: null },
    { id: uid('comm'), talentId: talentRecords[0].id, date: '2026-11-01', method: '微信', content: '发送JD，候选人表示感兴趣，下周安排深入沟通', createdBy: admin.name, createdAt: now, deletedAt: null, deletedBy: null },
    { id: uid('comm'), talentId: talentRecords[4].id, date: '2026-10-20', method: '邮件', content: '通过LinkedIn联系的候选人，对方回复愿意了解', createdBy: admin.name, createdAt: now, deletedAt: null, deletedBy: null }
  );

  // 示例提醒
  DB.reminders.push(
    { id: uid('rem'), talentId: talentRecords[4].id, date: '2026-11-08', note: '候选人两周未更新，需跟进', status: 'pending', createdBy: admin.name }
  );

  // 示例操作记录
  talentRecords.forEach(t => {
    DB.activityLogs.push({
      id: uid('log'), type: 'create', talentId: t.id,
      actor: admin.name, actorId: admin.id,
      time: now, summary: '新建人才档案', changes: null
    });
  });

  saveData();
  console.log('Demo data seeded');
}

// Auto-seed on first load
if (!loadData() || DB.companies.length === 0) {
  DB = defaultData();
  seedDemoData();
}




/* ==========================================================================
   服务器同步层 — API 模式下自动推送变更到后端
   ========================================================================== */
if (IS_API_MODE) {
  // Wrap key mutation functions to sync to server
  const _origCompaniesCreate = Companies.create;
  const _origCompanyDetailCreate = CompanyDetail.createPosition;
  const _origTalentListCreate = TalentList.create;
  const _origTalentSaveEdit = TalentDetail.saveEdit;
  const _origTalentDel = TalentDetail.deleteTalent;
  const _origTalentArchive = TalentDetail.archive;
  const _origTalentRestore = TalentDetail.restore;
  const _origSetRating = TalentDetail.setRating;
  const _origAddWorkExp = TalentDetail.addWorkExp;
  const _origSaveWorkExp = TalentDetail.saveWorkExp;
  const _origRemoveWorkExp = TalentDetail.removeWorkExp;
  const _origSaveComm = TalentDetail.saveCommunication;
  const _origDelComm = TalentDetail.deleteCommunication;
  const _origSaveReminder = TalentDetail.saveReminder;

  // Company CRUD
  Companies.create = async function() {
    try {
      const name = document.getElementById('mcName').value.trim();
      if (!name) return showToast('请输入公司名称', 'error');
      await ApiClient.createCompany({
        name, industry: document.getElementById('mcIndustry').value,
        scale: document.getElementById('mcScale').value,
        city: document.getElementById('mcCity').value,
        priority: document.getElementById('mcPriority').value,
        note: document.getElementById('mcNote').value
      });
      closeModal();
      // Reload full data
      App.navigate('companies');
    } catch(e) { showToast(e.message, 'error'); }
  };

  Companies.saveEdit = async function(cid) {
    try {
      const name = document.getElementById('eName').value.trim();
      if (!name) return showToast('请输入公司名称', 'error');
      await ApiClient.updateCompany(cid, {
        name, industry: document.getElementById('eIndustry').value,
        scale: document.getElementById('eScale').value,
        city: document.getElementById('eCity').value,
        priority: document.getElementById('ePriority').value,
        note: document.getElementById('eNote').value
      });
      closeModal(); App.navigate('company-detail', { cid });
    } catch(e) { showToast(e.message, 'error'); }
  };

  Companies.deleteCompany = async function(cid) {
    if (!confirm('确定删除？')) return;
    try {
      await ApiClient.deleteCompany(cid);
      App.navigate('companies');
      showToast('公司已删除');
    } catch(e) { showToast(e.message, 'error'); }
  };

  // Position CRUD
  CompanyDetail.createPosition = async function() {
    try {
      const name = document.getElementById('pcName').value.trim();
      if (!name) return showToast('请输入职位名称', 'error');
      const cid = document.getElementById('pcCid').value;
      await ApiClient.createPosition(cid, {
        name, func: document.getElementById('pcFunc').value,
        level: document.getElementById('pcLevel').value,
        city: document.getElementById('pcCity').value,
        status: document.getElementById('pcStatus').value
      });
      closeModal(); App.navigate('company-detail', { cid });
    } catch(e) { showToast(e.message, 'error'); }
  };

  // Talent CRUD
  TalentList.create = async function() {
    try {
      const name = document.getElementById('ntName').value.trim();
      if (!name) return showToast('请输入姓名', 'error');
      await ApiClient.createTalent({
        name, currentCompany: document.getElementById('ntCompany').value,
        currentPosition: document.getElementById('ntPosition').value,
        phone: document.getElementById('ntPhone').value,
        email: document.getElementById('ntEmail').value,
        city: document.getElementById('ntCity').value,
        level: document.getElementById('ntLevel').value,
        positions: [{ positionId: document.getElementById('ntPosId').value, rating: '未评级' }]
      });
      closeModal(); App.navigate('talents');
    } catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.saveEdit = async function(tid) {
    try {
      const name = document.getElementById('etName').value.trim();
      if (!name) return showToast('请输入姓名', 'error');
      await ApiClient.updateTalent(tid, {
        name, currentCompany: document.getElementById('etCompany').value,
        currentPosition: document.getElementById('etPosition').value,
        phone: document.getElementById('etPhone').value,
        email: document.getElementById('etEmail').value,
        city: document.getElementById('etCity').value,
        level: document.getElementById('etLevel').value,
        contactStatus: document.getElementById('etStatus').value,
        ownerId: document.getElementById('etOwner').value
      });
      closeModal(); App.navigate('talent-detail', { tid });
    } catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.deleteTalent = async function(tid) {
    if (!confirm('确定删除？')) return;
    try { await ApiClient.deleteTalent(tid); App.navigate('talents'); showToast('已删除'); }
    catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.archive = async function(tid) {
    try { await ApiClient.updateTalent(tid, { status: 'archived' }); App.navigate('talent-detail', { tid }); }
    catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.restore = async function(tid) {
    try { await ApiClient.updateTalent(tid, { status: 'active' }); App.navigate('talent-detail', { tid }); }
    catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.setRating = async function(tid, posId, val) {
    try { await ApiClient.updateTalent(tid, { positions: [{ positionId: posId, rating: val }] }); App.navigate('talent-detail', { tid }); }
    catch(e) { showToast(e.message, 'error'); }
  };

  // Communications, Reminders, Work Experiences
  TalentDetail.saveCommunication = async function(tid) {
    try {
      await ApiClient.addCommunication(tid, {
        date: document.getElementById('acDate').value,
        method: document.getElementById('acMethod').value,
        content: document.getElementById('acContent').value.trim()
      });
      closeModal(); App.navigate('talent-detail', { tid });
    } catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.deleteCommunication = async function(cid) {
    try { await ApiClient.deleteCommunication(cid); render(); }
    catch(e) { showToast(e.message, 'error'); }
  };

  TalentDetail.saveReminder = async function(tid) {
    try {
      await ApiClient.addReminder(tid, {
        date: document.getElementById('srDate').value,
        note: document.getElementById('srNote').value.trim()
      });
      closeModal(); App.navigate('talent-detail', { tid });
    } catch(e) { showToast(e.message, 'error'); }
  };

  // Reload data after navigation for fresh server state
  const _origNavigate = navigateTo;
  navigateTo = async function(page, params) {
    Route.page = page;
    Route.params = params || {};
    Route.breadcrumb = [];
    try {
      const data = await ApiClient.loadAll();
      DB.users = data.users;
      DB.space = data.space;
      DB.companies = data.companies;
      DB.positions = data.positions;
      DB.talents = data.talents;
      DB.communicationRecords = data.communicationRecords;
      DB.reminders = data.reminders;
      DB.activityLogs = data.activityLogs;
      DB.tags = data.tags;
      if (data.settings) DB.settings = data.settings;
    } catch(e) { console.warn('Sync failed:', e.message); }
    render();
  };
}
