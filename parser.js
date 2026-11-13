/* ==========================================================================
   简历解析引擎 - PDF 文本提取 / 图片 OCR / DOCX 解析 / 字段识别
   ========================================================================== */

const ResumeParser = {
  /* 初始化 PDF.js worker */
  initPdf() {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'lib/pdf.worker.min.js';
    }
  },

  /* 判断文件类型 */
  getFileType(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') ||
        name.endsWith('.gif') || name.endsWith('.bmp') || name.endsWith('.webp')) return 'image';
    return 'unknown';
  },

  /* 从 PDF 提取文本 */
  async extractPdfText(file) {
    this.initPdf();
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF 解析库加载失败，请检查网络连接');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await pdf.getPage(page);
      const pageText = await content.getTextContent();
      text += pageText.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  },

  /* 图片 OCR */
  async extractImageText(file) {
    if (typeof Tesseract === 'undefined') {
      throw new Error('OCR 库加载失败，请检查网络连接');
    }
    const imageUrl = URL.createObjectURL(file);
    try {
      const result = await Tesseract.recognize(imageUrl, 'chi_sim+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            showToast(`图片识别中... ${progress}%`, 'info');
          }
        }
      });
      return result.data.text;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  },

  /* DOCX 提取文本 */
  async extractDocxText(file) {
    if (typeof mammoth === 'undefined') {
      throw new Error('DOCX 解析库加载失败，请检查网络连接');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  },

  /* 主解析入口 */
  async parseFile(file) {
    const type = this.getFileType(file);
    let text = '';

    if (type === 'pdf') {
      text = await this.extractPdfText(file);
    } else if (type === 'image') {
      text = await this.extractImageText(file);
    } else if (type === 'docx') {
      text = await this.extractDocxText(file);
    } else {
      throw new Error('不支持的文件格式，请上传 PDF、DOCX 或图片');
    }

    return this.extractFields(text);
  },

  /* 从纯文本中提取结构化字段 */
  extractFields(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('未能从文件中提取到文字，可能是扫描件或加密文件');
    }

    const fields = {
      name: '',
      phone: '',
      email: '',
      company: '',
      position: '',
      city: '',
      workYears: '',
      level: '',
      confidence: {}
    };

    // 1. 手机号 - 中国大陆 11 位
    const phonePatterns = [
      /1[3-9]\d{9}/,
      /(?:手机|电话|联系方式|mobile|phone|tel)[:：\s]*([0-9+\-\s]{11,18})/i
    ];
    for (const p of phonePatterns) {
      const m = text.match(p);
      if (m) {
        fields.phone = m[0].replace(/[^\d+]/g, '');
        fields.confidence.phone = '高';
        break;
      }
    }

    // 2. 邮箱
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      fields.email = emailMatch[0];
      fields.confidence.email = '高';
    }

    // 3. 姓名 - 常见模式
    const namePatterns = [
      /姓名[:：\s]*([\u4e00-\u9fa5]{2,4})/,
      /(?:name)[:：\s]*([\u4e00-\u9fa5]{2,4}|[a-zA-Z]{2,20})/i,
      /^([\u4e00-\u9fa5]{2,4})\s*$/m
    ];
    for (const p of namePatterns) {
      const m = text.match(p);
      if (m) {
        fields.name = m[1].trim();
        fields.confidence.name = '中';
        break;
      }
    }
    // 如果没匹配到，尝试第一行常见中文名
    if (!fields.name) {
      const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length >= 2 && l.length <= 4 && /^[\u4e00-\u9fa5]+$/.test(l));
      if (firstLine) {
        fields.name = firstLine;
        fields.confidence.name = '低';
      }
    }

    // 4. 城市
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉', '西安', '苏州', '天津', '重庆', '长沙', '郑州', '青岛', '大连', '宁波', '厦门', '福州', '济南', '合肥', '无锡'];
    for (const city of cities) {
      if (text.includes(city)) {
        fields.city = city;
        fields.confidence.city = '中';
        break;
      }
    }

    // 5. 公司 - 常见模式
    const companyPatterns = [
      /(?:公司|企业|单位)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()]+?)(?:[\s\n]|$)/,
      /(?:company)[:：\s]*([A-Za-z\u4e00-\u9fa5]+)/i,
      /在\s*([\u4e00-\u9fa5A-Za-z0-9]+?公司)[\s\n]/
    ];
    for (const p of companyPatterns) {
      const m = text.match(p);
      if (m) {
        let company = m[1].trim();
        if (company.length > 2 && company.length < 40) {
          fields.company = company;
          fields.confidence.company = '中';
          break;
        }
      }
    }
    // 从工作经历中提取最近公司
    if (!fields.company) {
      const expMatch = text.match(/(?:工作经历|工作经验|经历)[\s\S]*?([\u4e00-\u9fa5A-Za-z0-9]{2,30}?公司|[\u4e00-\u9fa5]{2,15}(?:科技|网络|信息|集团|有限|股份))/);
      if (expMatch) {
        fields.company = expMatch[1].trim();
        fields.confidence.company = '低';
      }
    }

    // 6. 职位
    const positionPatterns = [
      /(?:职位|岗位|职务)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9/（）()]+?)(?:[\s\n]|$)/,
      /(?:应聘|求职|意向|期望)[\s\S]{0,20}(?:职位|岗位)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9/（）()]+)/
    ];
    for (const p of positionPatterns) {
      const m = text.match(p);
      if (m) {
        let pos = m[1].trim();
        if (pos.length > 1 && pos.length < 30) {
          fields.position = pos;
          fields.confidence.position = '中';
          break;
        }
      }
    }

    // 7. 级别推断
    const levelPatterns = [
      { regex: /高级|资深|专家|总监|经理|架构师|负责人/, level: '高级' },
      { regex: /中级|工程师|主管/, level: '中级' },
      { regex: /初级|助理|实习生|应届/, level: '初级' }
    ];
    for (const lp of levelPatterns) {
      if (lp.regex.test(text)) {
        fields.level = lp.level;
        fields.confidence.level = '中';
        break;
      }
    }

    // 8. 工作年限
    const yearsMatch = text.match(/(\d{1,2})\s*年(?:工作|经验|以上)/);
    if (yearsMatch) {
      fields.workYears = yearsMatch[1];
      fields.confidence.workYears = '中';
    } else {
      const yearsMatch2 = text.match(/(\d{1,2})\s*\+?\s*年/);
      if (yearsMatch2) {
        fields.workYears = yearsMatch2[1];
        fields.confidence.workYears = '低';
      }
    }

    // 9. 工作经历提取（公司名称、时间、工作内容）
    fields.workExperiences = this.extractWorkExperiences(text);

    return fields;
  },

  /* 从文本中提取工作经历（公司名称 + 时间 + 工作内容） */
  extractWorkExperiences(text) {
    const experiences = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    // ====== SIMPLER, MORE ROBUST APPROACH ======
    // Step 1: Find all date ranges in the text
    // Matches: 2020.01-2023.06, 2020/01-2023/06, 2020.01 - 2023.06, 2020年1月-2023年6月, 2020.1-至今
    const datePattern = /(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?|(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(至今|现在|present|now)/gi;
    
    // Step 2: Find all potential company names
    const companyPattern = /([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,30}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造))/g;

    // Step 3: Split text into blocks by date markers
    let dateMatches = [];
    let match;
    while ((match = datePattern.exec(text)) !== null) {
      dateMatches.push({
        text: match[0],
        index: match.index,
        startYear: match[1] || match[5],
        startMonth: match[2] || match[6] || '',
        endYear: match[3],
        endMonth: match[4] || '',
        isPresent: !!match[7]
      });
    }

    // Step 4: For each date range, look backward/forward for company name and description
    for (let i = 0; i < dateMatches.length; i++) {
      const dm = dateMatches[i];
      const nextIdx = i + 1 < dateMatches.length ? dateMatches[i + 1].index : text.length;
      
      // Text slice: from 100 chars before this date to the next date (or 500 chars)
      const start = Math.max(0, dm.index - 120);
      const end = Math.min(text.length, dm.index + 500, nextIdx);
      const snippet = text.substring(start, end);
      
      // Find company name near this date
      let company = '';
      let position = '';
      let content = '';
      
      // Look for company name before the date in this snippet
      const beforeDate = text.substring(Math.max(0, dm.index - 120), dm.index);
      let cm;
      companyPattern.lastIndex = 0;
      while ((cm = companyPattern.exec(beforeDate)) !== null) {
        company = cm[1]; // Get the last/closest one
      }
      
      // If not found before, look after the date
      if (!company) {
        const afterDate = text.substring(dm.index + dm.text.length, Math.min(text.length, dm.index + dm.text.length + 200));
        
        // Try: [company name] [position]  structure
        // Company name is typically 2-20 chars right after the date
        const lineMatch = afterDate.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,30}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|云|智能|数字|通信|电子|半导体))/);
        if (lineMatch) {
          company = lineMatch[1];
        } else {
          // Fallback: take first 2-15 Chinese chars as company name
          const nameMatch = afterDate.match(/^\s*([\u4e00-\u9fa5]{2,15})/);
          if (nameMatch && !nameMatch[1].match(/(?:工作|职责|负责|参与|任职|主要|项目|时间|地址|电话|邮箱|学历|教育|技能|自我|证书)/)) {
            company = nameMatch[1];
          }
        }
      }

      // Look for position/job title
      if (!position) {
        const positionPatterns = [
          /(?:职位|岗位|职务)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9/（）()+·]{2,30})/,
          /(高级|资深|初级|中级)?\s*([\u4e00-\u9fa5]{2,10}(?:工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生))/,
          /([\u4e00-\u9fa5A-Za-z]{2,20}(?:工程师|经理|主管|专员|总监|设计师|分析师))/,
        ];
        for (const pp of positionPatterns) {
          const pm = snippet.match(pp);
          if (pm) { position = pm[0].trim(); break; }
        }
      }

      // Collect content after the date until next marker
      let afterText = text.substring(dm.index + dm.text.length, Math.min(text.length, dm.index + dm.text.length + 400));
      // Remove leading whitespace/punctuation
      afterText = afterText.replace(/^[\s|\/·:：,-]+/, '').trim();
      // Take first meaningful sentence(s)
      const contentMatch = afterText.match(/^([\s\S]{0,200}?)(?=\d{4}[年.\/\-]|$)/);
      if (contentMatch) {
        content = contentMatch[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
      }

      // Build the start/end date
      const startDate = dm.startYear + (dm.startMonth ? '.' + dm.startMonth : '');
      const endDate = dm.isPresent ? '至今' : (dm.endYear ? dm.endYear + (dm.endMonth ? '.' + dm.endMonth : '') : '');

      if (company || position) {
        experiences.push({
          company: company || '',
          position: position || '',
          startDate: startDate,
          endDate: endDate,
          content: content || ''
        });
      }
    }

    // Step 5: Fallback - look for "工作经历" or "工作经验" section and parse it
    if (experiences.length === 0) {
      const expSection = text.match(/(?:工作经历|工作经验|工作履历)[\s\S]{0,1500}/);
      if (expSection) {
        const section = expSection[0];
        // Try to find company + date patterns in the section
        const sectionDates = [];
        let sdm;
        datePattern.lastIndex = 0;
        while ((sdm = datePattern.exec(section)) !== null) {
          sectionDates.push({
            text: sdm[0], index: sdm.index,
            startYear: sdm[1] || sdm[5], startMonth: sdm[2] || sdm[6] || '',
            endYear: sdm[3], endMonth: sdm[4] || '', isPresent: !!sdm[7]
          });
        }
        
        for (let i = 0; i < sectionDates.length; i++) {
          const sd = sectionDates[i];
          const nextIdx = i + 1 < sectionDates.length ? sectionDates[i + 1].index : section.length;
          const chunk = section.substring(Math.max(0, sd.index - 60), Math.min(section.length, sd.index + 250, nextIdx));
          
          // Get company from chunk
          let comp = '';
          companyPattern.lastIndex = 0;
          let cm2;
          while ((cm2 = companyPattern.exec(chunk)) !== null) comp = cm2[1];
          
          const startDate = sd.startYear + (sd.startMonth ? '.' + sd.startMonth : '');
          const endDate = sd.isPresent ? '至今' : (sd.endYear ? sd.endYear + (sd.endMonth ? '.' + sd.endMonth : '') : '');
          
          if (comp) {
            experiences.push({
              company: comp,
              position: '',
              startDate: startDate,
              endDate: endDate,
              content: ''
            });
          }
        }
      }
    }

    // Step 6: Last resort - just find company names and guess
    if (experiences.length === 0) {
      companyPattern.lastIndex = 0;
      let cm3;
      const found = [];
      while ((cm3 = companyPattern.exec(text)) !== null) {
        if (!found.find(f => f === cm3[1])) {
          found.push(cm3[1]);
        }
      }
      // Also try bare company names (2-15 chars) before/after dates
      datePattern.lastIndex = 0;
      let dm4;
      while ((dm4 = datePattern.exec(text)) !== null) {
        // Company name before date
        const before = text.substring(Math.max(0, dm4.index - 40), dm4.index).trim();
        const beforeMatch = before.match(/([\u4e00-\u9fa5]{2,15})$/);
        if (beforeMatch && !found.includes(beforeMatch[1])) {
          found.push(beforeMatch[1]);
        }
        // Company name after date
        const after = text.substring(dm4.index + dm4[0].length, Math.min(text.length, dm4.index + dm4[0].length + 40)).trim();
        const afterMatch = after.match(/^([\u4e00-\u9fa5]{2,15})/);
        if (afterMatch && !found.includes(afterMatch[1])) {
          found.push(afterMatch[1]);
        }
      }

      // Try to find dates near each company
      for (const comp of found.slice(0, 8)) {
        const idx2 = text.indexOf(comp);
        if (idx2 === -1) continue;
        const nearby = text.substring(Math.max(0, idx2 - 60), Math.min(text.length, idx2 + comp.length + 200));
        datePattern.lastIndex = 0;
        const dm2 = datePattern.exec(nearby);
        const startDate = dm2 ? (dm2[1] || dm2[5]) + ((dm2[2] || dm2[6]) ? '.' + (dm2[2] || dm2[6]) : '') : '';
        const endDate = dm2 ? (dm2[7] ? '至今' : (dm2[3] ? dm2[3] + (dm2[4] ? '.' + dm2[4] : '') : '')) : '';
        experiences.push({
          company: comp,
          position: '',
          startDate: startDate,
          endDate: endDate,
          content: ''
        });
      }
    }

    return experiences.slice(0, 10);
  }
};