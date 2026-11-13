const fs = require("fs");
const path = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/public/app.js";
let src = fs.readFileSync(path, "utf8");

// 1. Fix handleResumeUpload to sync to server in API mode
const oldBlock = `      t.updatedAt = nowStr();
      saveData(); render();
      showToast('简历已解析，工作经历已自动提取', 'success');
    } catch (err) {`;

const newBlock = `      t.updatedAt = nowStr();
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
    } catch (err) {`;

if (!src.includes(oldBlock)) {
  console.error("ERROR: oldBlock not found");
  process.exit(1);
}
src = src.replace(oldBlock, newBlock);

// 2. Add a global auto-import function after the handleResumeUpload method
const methodEnd = `      showToast('简历已添加，但自动识别失败: ' + err.message, 'warn');
    }
  }
};`;
if (!src.includes(methodEnd)) {
  console.error("ERROR: methodEnd not found");
  process.exit(1);
}

const newMethodEnd = `      showToast('简历已添加，但自动识别失败: ' + err.message, 'warn');
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
};`;

src = src.replace(methodEnd, newMethodEnd);

fs.writeFileSync(path, src, "utf8");
console.log("Patched app.js successfully");
