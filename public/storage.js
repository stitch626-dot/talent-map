/* ==========================================================================
   简历文件存储 — IndexedDB 持久化
   ========================================================================== */
const ResumeStorage = {
  DB_NAME: 'talent_map_files',
  DB_VERSION: 1,
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async saveFile(id, name, blob, mimeType) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.put({ id, name, blob, mimeType, savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getFile(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteFile(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteAllForTalent(prefix) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = req.result.filter(k => k.startsWith(prefix));
        keys.forEach(k => store.delete(k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  /* 查看文件 — 在新标签打开 */
  async viewFile(fileId) {
    const f = await this.getFile(fileId);
    if (!f) { showToast('文件不存在', 'error'); return; }
    const url = URL.createObjectURL(f.blob);
    window.open(url, '_blank');
  },

  /* 下载文件 */
  async downloadFile(fileId) {
    const f = await this.getFile(fileId);
    if (!f) { showToast('文件不存在', 'error'); return; }
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
