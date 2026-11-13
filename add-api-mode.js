const fs = require('fs');
const p = 'C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public/app.js';
let c = fs.readFileSync(p, 'utf8');

// Add API mode detection and init at the very top (after the header comment)
const apiInitBlock = `
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
`;

// Insert after "const STORAGE_KEY" line
c = c.replace(
  "const STORAGE_KEY = 'talent_map_data_v2';",
  "const STORAGE_KEY = 'talent_map_data_v2';" + apiInitBlock
);

// Replace the init function to support API mode
const oldInit = `function init() {
  try {
    // Ensure there is at least one user and logged in
    if (!DB.currentUserId || !DB.users.find(u => u.id === DB.currentUserId)) {
      DB.currentUserId = DB.users[0].id;
    }
    saveData();
    render();
  } catch (e) {
    console.error('Init failed:', e.message);
    // Reset and retry
    try { localStorage.removeItem(STORAGE_KEY); } catch (ex) {}
    DB = defaultData();
    DB.currentUserId = DB.users[0].id;
    seedDemoData();
    saveData();
    render();
  }
}`;

const newInit = `async function init() {
  try {
    if (IS_API_MODE) {
      // Check auth
      const user = await ApiClient.me();
      if (!user) {
        window.location.href = '/login.html';
        return;
      }
      // Load all data from server
      try {
        const data = await ApiClient.loadAll();
        DB = {
          currentUserId: user.id,
          users: data.users,
          space: data.space,
          companies: data.companies,
          positions: data.positions,
          talents: data.talents,
          communicationRecords: data.communicationRecords,
          reminders: data.reminders,
          tags: data.tags,
          activityLogs: data.activityLogs,
          invites: [],
          exportLogs: []
        };
      } catch (e) {
        console.error('Failed to load data:', e);
      }
      render();
    } else {
      // Local mode
      if (!DB.currentUserId || !DB.users.find(u => u.id === DB.currentUserId)) {
        DB.currentUserId = DB.users[0].id;
      }
      saveData();
      render();
    }
  } catch (e) {
    console.error('Init failed:', e.message);
    try { localStorage.removeItem(STORAGE_KEY); } catch (ex) {}
    DB = defaultData();
    DB.currentUserId = DB.users[0].id;
    if (!IS_API_MODE) seedDemoData();
    saveData();
    render();
  }
}`;

c = c.replace(oldInit, newInit);

// Override the data modification functions to sync to server in API mode
// Add async sync wrapper at the end of app.js
const syncCode = `

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
    } catch(e) { console.warn('Sync failed:', e.message); }
    render();
  };
}
`;

c += syncCode;

fs.writeFileSync(p, c, 'utf8');
console.log('API mode support added to app.js');
