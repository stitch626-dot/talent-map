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
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
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
    const seen = new Set();

    // Date pattern: matches various formats like 2020.01-2023.06, 2020年1月-至今, etc.
    const datePattern = /(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?|(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(至今|现在|present|now)/gi;

    // Step 1: Find all date ranges
    let dateMatches = [];
    let dm;
    while ((dm = datePattern.exec(text)) !== null) {
      dateMatches.push({
        text: dm[0].trim(),
        index: dm.index,
        startYear: dm[1] || dm[5],
        startMonth: dm[2] || dm[6] || '',
        endYear: dm[3] || '',
        endMonth: dm[4] || '',
        isPresent: !!dm[7]
      });
    }
    if (dateMatches.length === 0) return experiences;

    // Step 2: Process each date block
    for (let i = 0; i < dateMatches.length; i++) {
      const cur = dateMatches[i];

      // Block boundaries: from end of previous date to next date
      const prevEnd = i > 0 ? dateMatches[i - 1].index + dateMatches[i - 1].text.length : Math.max(0, cur.index - 120);
      const nextStart = i + 1 < dateMatches.length ? dateMatches[i + 1].index : Math.min(text.length, cur.index + 600);
      
      const afterStart = cur.index + cur.text.length;
      const afterText = text.substring(afterStart, nextStart).trim();
      const beforeText = text.substring(Math.max(prevEnd, cur.index - 80), cur.index).trim();

      let company = '';
      let position = '';
      let content = '';

      // Try company AFTER date first
      const companyAfter = afterText.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|云|智能|数字|通信|电子|半导体|银行|保险|证券|基金|投资|控股|事务所|研究院|学院|大学|医院|中心|平台|实验室|工作室))/);
      
      if (companyAfter && !/^(?:工作|职责|负责|参与|任职|主要|项目|时间|地址|电话|邮箱|学历|教育|技能|自我|证书|联系|个人|求职|应聘|期望|意向|语言|专业|学校|毕业|出生|高级|资深|初级|中级|工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力|前端|后端|全栈|算法|数据|技术|Java|Python|C\\+\\+|Golang|Go|PHP|iOS|Android|Web|UI|UX|IT|SRE|DevOps)/.test(companyAfter[1])) {
        company = companyAfter[1].trim();
      } else {
        // Fallback: bare company name without standard suffix
        const bareCompany = afterText.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,15})/);
        if (bareCompany && !/^(?:工作|职责|负责|参与|任职|主要|项目|时间|地址|电话|邮箱|学历|教育|技能|自我|证书|联系|个人|求职|应聘|期望|意向|语言|专业|学校|毕业|出生|高级|资深|初级|中级|工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力|前端|后端|全栈|算法|数据|技术|Java|Python|C\\+\\+|Golang|Go|PHP|iOS|Android|Web|UI|UX|IT|SRE|DevOps)/.test(bareCompany[1])) {
          company = bareCompany[1].trim();
        }
      }
      if (!company) {
        // Try company BEFORE date (but only after previous date)
        const beforeLines = beforeText.split(/[\r\n]+/);
        for (let j = beforeLines.length - 1; j >= 0; j--) {
          const line = beforeLines[j].trim();
          if (!line || /^\d{4}/.test(line)) continue;
          const namedMatch = line.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|银行|保险|证券|基金|投资|控股|事务所|研究院|学院|大学|医院|中心|平台|实验室|工作室))/);
          if (namedMatch) { company = namedMatch[1]; break; }
        }
      }

      // Find position
      if (company) {
        let posText = afterText;
        if (posText.startsWith(company)) {
          posText = posText.substring(company.length).trim();
        }
        const posMatch = posText.match(/^([\u4e00-\u9fa5A-Za-z0-9/（）()+·]{2,25}?)(?:[\s\n]|$)/);
        if (posMatch && posMatch[1].trim().length >= 2) {
          const candidate = posMatch[1].trim();
          if (!/^(?:公司|集团|科技|网络|信息|有限|股份|技术|软件|数据)/.test(candidate) &&
              !/^(?:工作|职责|负责|参与|任职|主要|项目|时间|地址|电话|邮箱|学历|教育|技能|自我|证书|联系|个人|求职)/.test(candidate)) {
            position = candidate;
          }
        }
      }
      
      if (!position) {
        const pMatch = afterText.match(/(高级|资深|初级|中级)?\s*([\u4e00-\u9fa5]{2,10}(?:工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力))/);
        if (pMatch) position = pMatch[0].trim();
      }

      // Extract content
      content = afterText
        .replace(/^[\s\n\r]+/, '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 300)
        .trim();

      const startDate = cur.startYear + (cur.startMonth ? '.' + cur.startMonth : '');
      const endDate = cur.isPresent ? '至今' : (cur.endYear ? cur.endYear + (cur.endMonth ? '.' + cur.endMonth : '') : '');
      
      const key = (company || '') + '|' + startDate + '|' + endDate;
      if (!seen.has(key) && (company || position)) {
        seen.add(key);
        experiences.push({
          company: company || '',
          position: position || '',
          startDate: startDate,
          endDate: endDate,
          content: content || ''
        });
      }
    }

    return experiences.slice(0, 15);
  },
};