/* ==========================================================================
   人才地图 - PDF简历解析引擎 v12
   使用 PDF.js 可靠提取 + DOCX/图片OCR
   ========================================================================== */

const ResumeParser = {
  getFileType(file) {
    const n = file.name.toLowerCase();
    if (n.endsWith(".pdf")) return "pdf";
    if (n.endsWith(".docx") || n.endsWith(".doc")) return "docx";
    if (/.(jpg|jpeg|png|gif|bmp|webp)$/i.test(n)) return "image";
    return "unknown";
  },

  /* PDF提取：使用PDF.js */
  async extractPdfText(file) {
    try {
      const ab = await file.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(it => it.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText.trim();
    } catch(e) {
      console.error("PDF.js parse error:", e.message);
      throw new Error("PDF解析失败: " + e.message);
    }
  },

  /* 图片OCR：使用Tesseract */
  async extractImageText(file) {
    if (typeof Tesseract === "undefined") throw new Error("OCR库加载失败");
    const url = URL.createObjectURL(file);
    try { const r = await Tesseract.recognize(url, "chi_sim+eng"); return r.data.text; }
    finally { URL.revokeObjectURL(url); }
  },

  /* DOCX提取：使用Mammoth */
  async extractDocxText(file) {
    if (typeof mammoth === "undefined") throw new Error("DOCX库加载失败");
    const ab = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: ab });
    return r.value;
  },

  /* 统一解析入口 */
  async parseFile(file) {
    const type = this.getFileType(file);
    let text = "";
    if (type === "pdf") text = await this.extractPdfText(file);
    else if (type === "image") text = await this.extractImageText(file);
    else if (type === "docx") text = await this.extractDocxText(file);
    else throw new Error("不支持的文件格式（支持 PDF、DOCX、图片）");
    if (!text || text.trim().length < 5) throw new Error("未能提取到有效文字，请检查文件是否可读");
    return this.extractFields(text);
  },

  /* 字段提取 */
  extractFields(text) {
    const f = { name:"", phone:"", email:"", company:"", position:"", city:"", workYears:"", level:"" };
    
    // 姓名
    const nm = text.match(/(?:姓名|名字|候选人)[:：\s]*([\u4e00-\u9fa5]{2,4})/) ||
               text.match(/^([\u4e00-\u9fa5]{2,4})\s*$/m);
    if (nm) f.name = nm[1].trim();
    
    // 手机
    const pm = text.match(/1[3-9]\d{9}/);
    if (pm) f.phone = pm[0];
    
    // 邮箱
    const em = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (em) f.email = em[0];
    
    // 城市
    const cities = ["北京","上海","广州","深圳","杭州","南京","成都","武汉","西安","苏州","天津","重庆","长沙","郑州","青岛","大连","宁波","厦门","福州","济南","合肥","无锡","东莞","佛山"];
    for (const c of cities) { if (text.includes(c)) { f.city = c; break; } }
    
    // 级别
    if (/高级|资深|专家|总监|经理|架构师|负责人|主管/.test(text)) f.level = "高级";
    else if (/中级|工程师/.test(text)) f.level = "中级";
    else if (/初级|助理|实习生|应届/.test(text)) f.level = "初级";
    
    // 工作年限
    const ym = text.match(/(\d{1,2})\s*年/);
    if (ym) f.workYears = ym[1];
    
    // 当前公司/职位
    const cl = text.match(/(?:目前|现在|当前).{0,20}(?:任职|就职|工作)于\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,20}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据)?)/);
    if (cl) f.company = cl[1].trim();
    const pl = text.match(/(?:担任|任职|职位|岗位|职务)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9/（）()+·]{2,20})/);
    if (pl) f.position = pl[1].trim();

    // 工作经历
    f.workExperiences = this.extractWorkExperiences(text);
    return f;
  },

  /* 工作经历提取 */
  extractWorkExperiences(text) {
    const exps = [], seen = new Set();
    const dp = /(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?|(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(至今|现在|present|now)/gi;
    let dms = [], dm;
    while ((dm = dp.exec(text)) !== null) dms.push({text:dm[0].trim(),index:dm.index,
      startYear:dm[1]||dm[5],startMonth:dm[2]||dm[6]||"",
      endYear:dm[3]||"",endMonth:dm[4]||"",isPresent:!!dm[7]});
    
    for (let i = 0; i < dms.length; i++) {
      const cur = dms[i];
      const ns = i+1<dms.length ? dms[i+1].index : Math.min(text.length, cur.index+600);
      const at = text.substring(cur.index+cur.text.length, ns).trim();
      const bt = text.substring(Math.max(0, cur.index-80), cur.index).trim();
      let co = "", po = "", cn = "";
      
      const ca = at.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|银行|保险|证券|投资|控股|事务所|研究院|学院|大学|医院|中心|平台|实验室|工作室))/);
      if (ca) co = ca[1].trim();
      else { const ba = at.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,15})/);
        if (ba && !/^(?:工作|职责|负责|参与|任职|主要|项目|时间|地址|电话|邮箱|学历|教育|技能|自我|证书|联系|个人|求职|应聘|期望|意向|语言|专业|学校|毕业|出生|高级|资深|初级|中级|工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力|前端|后端|全栈|算法|数据)/.test(ba[1])) co = ba[1].trim(); }
      
      if (!co) { const bl = bt.split(/[\r\n]+/);
        for (let j=bl.length-1;j>=0;j--) { const l=bl[j].trim();
          if (!l||/^\d{4}/.test(l)) continue;
          const nm=l.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|银行|保险|证券|投资|控股|事务所|研究院|学院|大学|医院|中心|平台|实验室|工作室))/);
          if (nm) { co=nm[1]; break; } } }
      
      if (co) { let pt=at; if(pt.startsWith(co)) pt=pt.substring(co.length).trim();
        const pmm=pt.match(/^([\u4e00-\u9fa5A-Za-z0-9/（）()+·]{2,25}?)(?:[\s\n]|$)/);
        if(pmm){ const c2=pmm[1].trim();
          if(c2.length>=2&&!/^(?:公司|集团|科技|网络|信息|有限|股份|技术|软件|数据|工作|职责)/.test(c2)) po=c2; } }
      
      if (!po) { const pmm2=at.match(/(高级|资深|初级|中级)?\s*([\u4e00-\u9fa5]{2,10}(?:工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力))/);
        if(pmm2) po=pmm2[0].trim(); }
      
      cn = at.replace(/^[\s\n\r]+/,"").replace(/\n/g," ").replace(/\s+/g," ").substring(0,300).trim();
      const sd = cur.startYear+(cur.startMonth?"."+cur.startMonth:""),
            ed = cur.isPresent?"至今":(cur.endYear?cur.endYear+(cur.endMonth?"."+cur.endMonth:""):"");
      const key = (co||"")+"|"+sd+"|"+ed;
      if (!seen.has(key) && (co||po)) { seen.add(key); exps.push({company:co||"",position:po||"",startDate:sd,endDate:ed,content:cn||""}); }
    }
    return exps.slice(0,15);
  }
};
