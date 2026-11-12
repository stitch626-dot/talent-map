/* ==========================================================================
   API 客户端 — 连接后端服务器
   ========================================================================== */
const ApiClient = {
  base: '/api',
  token: null,
  user: null,

  getToken() {
    return this.token || localStorage.getItem('tm_token');
  },

  setToken(token) {
    this.token = token;
    localStorage.setItem('tm_token', token);
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('tm_token');
  },

  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json'   async getSettings(){return this.request('GET','/settings')}
  async updateSettings(d){return this.request('PUT','/settings',d)}
  async testFeishu(){return this.request('POST','/feishu/test')}
};
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  },

  // ====== Auth ======
  async login(email, password) {
    const data = await this.request('POST', '/auth/login', { email, password });
    this.setToken(data.token);
    this.user = data.user;
    return data.user;
  },

  async register(name, email, password) {
    const data = await this.request('POST', '/auth/register', { name, email, password });
    this.setToken(data.token);
    this.user = data.user;
    return data.user;
  },

  async me() {
    try {
      this.user = await this.request('GET', '/auth/me');
      return this.user;
    } catch {
      this.clearToken();
      return null;
    }
  },

  // ====== Space ======
  async getSpace() { return this.request('GET', '/space'); },

  async loadAll() {
    const [space, companies, talents] = await Promise.all([
      this.request('GET', '/space'),
      this.request('GET', '/companies'),
      this.request('GET', '/talents')
    ]);

    // Build positions list from companies
    let positions = [];
    for (const c of companies) {
      const companyPositions = await this.request('GET', `/companies/${c.id}/positions`);
      positions = positions.concat(companyPositions.map(p => ({
        id: p.id, companyId: c.id, name: p.name, function: p.func, level: p.level,
        city: p.city, status: p.status, deletedAt: p.deleted_at, createdAt: p.created_at, updatedAt: p.updated_at
      })));
    }

    // Fetch full talent details
    let fullTalents = [];
    for (const t of talents) {
      fullTalents.push(await this.request('GET', `/talents/${t.id}`));
    }

    // Also fetch talents with status draft/archived
    const archivedTalents = await this.request('GET', '/talents?status=archived');
    const draftTalents = await this.request('GET', '/talents?status=draft');
    const trashTalents = await this.request('GET', '/talents?status=trash');
    for (const t of [...archivedTalents, ...draftTalents, ...trashTalents]) {
      if (!fullTalents.find(x => x.id === t.id)) {
        fullTalents.push(t);
      }
    }

    return {
      space: { name: space.space.name },
      users: space.members.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role, avatarColor: m.avatarColor })),
      companies: companies.map(c => ({
        id: c.id, name: c.name, industry: c.industry, scale: c.scale, city: c.city,
        priority: c.priority, note: c.note, deletedAt: c.deleted_at, createdAt: c.created_at, updatedAt: c.updated_at
      })),
      positions,
      talents: fullTalents,
      communicationRecords: fullTalents.flatMap(t => t.communicationRecords || []).map(c => ({ ...c, talentId: t.id })),
      reminders: fullTalents.flatMap(t => t.reminders || []).map(r => ({ ...r, talentId: t.id })),
      activityLogs: fullTalents.flatMap(t => t.activityLogs || []).map(a => ({ ...a, talentId: t.id })),
      tags: space.tags || []
    };
  },

  // ====== Companies ======
  async createCompany(data) { return this.request('POST', '/companies', data); },
  async updateCompany(id, data) { return this.request('PUT', `/companies/${id}`, data); },
  async deleteCompany(id) { return this.request('DELETE', `/companies/${id}`); },

  // ====== Positions ======
  async createPosition(companyId, data) { return this.request('POST', `/companies/${companyId}/positions`, data); },
  async updatePosition(id, data) { return this.request('PUT', `/positions/${id}`, data); },
  async deletePosition(id) { return this.request('DELETE', `/positions/${id}`); },

  // ====== Talents ======
  async createTalent(data) { return this.request('POST', '/talents', data); },
  async updateTalent(id, data) { return this.request('PUT', `/talents/${id}`, data); },
  async deleteTalent(id) { return this.request('DELETE', `/talents/${id}`); },
  async restoreTalent(id) { return this.request('POST', `/talents/${id}/restore`); },

  // ====== Work experiences ======
  async addWorkExperience(talentId, data) { return this.request('POST', `/talents/${talentId}/work-experiences`, data); },
  async deleteWorkExperience(id) { return this.request('DELETE', `/work-experiences/${id}`); },

  // ====== Communications ======
  async addCommunication(talentId, data) { return this.request('POST', `/talents/${talentId}/communications`, data); },
  async deleteCommunication(id) { return this.request('DELETE', `/communications/${id}`); },

  // ====== Reminders ======
  async addReminder(talentId, data) { return this.request('POST', `/talents/${talentId}/reminders`, data); },
  async updateReminder(id, data) { return this.request('PUT', `/reminders/${id}`, data); }
};
