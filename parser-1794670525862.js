/* ==========================================================================
   人才地图 - 简历解析引擎 v4
   PDF(v2 CDN+OCR双引擎) / DOCX / 图片OCR / 字段识别
   ========================================================================== */

const ResumeParser = {
  _pdfjsReady: false,

  initPdf() {
    if (this._pdfjsReady) return;
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      this._pdfjsReady = true;
    }
  },

  getFileType(file) {
    const n = file.name.toLowerCase();
    if (n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.docx') || n.endsWith('.doc')) return 'docx';
    if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(n)) return 'image';
    return 'unknown';
  },

  /* PDF 双引擎解析：先纯文本提取，失败则OCR */
  async extractPdfText(file) {
    // Strategy 1: Pure JS text extraction (fast, for text-based PDFs)
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const raw = new TextDecoder('utf-8').decode(bytes);
    let result = '';

    const btRe = /BT([\s\S]*?)ET/g;
    let m;
    while ((m = btRe.exec(raw)) !== null) {
      const strs = m[1].match(/\(([^)]*)\)/g);
      if (strs) for (const s of strs) {
        const t = s.slice(1, -1).trim();
        if (t) result += t + ' ';
      }
    }
    if (!result.trim()) {
      const all = raw.match(/\(([^)]{2,300})\)/g);
      if (all) result = all.map(s => s.slice(1, -1))
        .filter(s => /[\u4e00-\u9fa5]/.test(s) || /[a-zA-Z]{3,}/.test(s))
        .join(' ');
    }
    if (!result.trim()) {
      const strRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let sm;
      while ((sm = strRe.exec(raw)) !== null) {
        const strs2 = sm[1].match(/\(([^)]{2,200})\)/g);
        if (strs2) for (const s of strs2) {
          const t = s.slice(1, -1).trim();
          if (t && /[\u4e00-\u9fa5]/.test(t)) result += t + ' ';
        }
      }
    }

    if (result.trim().length >= 10) return result.trim();

    // Strategy 2: PDF.js render to canvas + OCR (for scanned/image PDFs)
    this.initPdf();
    if (typeof pdfjsLib === 'undefined') return result.trim();
    
    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const maxPages = Math.min(pdf.numPages, 5);
      let ocrText = '';
      for (let page = 1; page <= maxPages; page++) {
        const pg = await pdf.getPage(page);
        const vp = pg.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d');
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        
        const imgData = canvas.toDataURL('image/png');
        if (typeof Tesseract !== 'undefined') {
          try {
            const r = await Tesseract.recognize(imgData, 'chi_sim+eng');
            ocrText += r.data.text + '\n';
          } catch(e) {}
        }
      }
      result = (result + ' ' + ocrText).trim();
    } catch(e) {}
    
    return result.trim();
  },

  async extractImageText(file) {
    if (typeof Tesseract === 'undefined') throw new Error('OCR库加载失败');
    const url = URL.createObjectURL(file);
    try { const r = await Tesseract.recognize(url, 'chi_sim+eng'); return r.data.text; }
    finally { URL.revokeObjectURL(url); }
  },

  async extractDocxText(file) {
    if (typeof mammoth === 'undefined') throw new Error('DOCX库加载失败');
    const ab = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: ab });
    return r.value;
  },

  async parseFile(file) {
    const type = this.getFileType(file);
    let text = '';
    if (type === 'pdf') text = await this.extractPdfText(file);
    else if (type === 'image') text = await this.extractImageText(file);
    else if (type === 'docx') text = await this.extractDocxText(file);
    else throw new Error('不支持的文件格式');
    if (!text || text.trim().length < 5)
      throw new Error('未能从文件中提取到文字。扫描件PDF已尝试OCR识别，如仍失败请将PDF转为图片后上传。');
    return this.extractFields(text);
  },

  extractFields(text) {
    const f = { name:'',phone:'',email:'',company:'',position:'',city:'',workYears:'',level:'' };
    const nm=text.match(/(?:姓名|名字)[:：\s]*([\u4e00-\u9fa5]{2,4})/)||text.match(/^([\u4e00-\u9fa5]{2,4})\s*$/m);
    if(nm)f.name=nm[1].trim();
    const pm=text.match(/1[3-9]\d{9}/);
    if(pm)f.phone=pm[0];
    const em=text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if(em)f.email=em[0];
    const cities=['北京','上海','广州','深圳','杭州','南京','成都','武汉','西安','苏州','天津','重庆','长沙','郑州','青岛','大连','宁波','厦门','福州','济南','合肥','无锡','东莞','佛山'];
    for(const c of cities){if(text.includes(c)){f.city=c;break;}}
    if(/高级|资深|专家|总监|经理|架构师|负责人/.test(text))f.level='高级';
    else if(/中级|工程师|主管/.test(text))f.level='中级';
    else if(/初级|助理|实习生|应届/.test(text))f.level='初级';
    const ym=text.match(/(\d{1,2})\s*年/);
    if(ym)f.workYears=ym[1];
    f.workExperiences=this.extractWorkExperiences(text);
    return f;
  },

  extractWorkExperiences(text) {
    const exps=[],seen=new Set();
    const dp=/(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?|(\d{4})\s*[年.\/\-]?\s*(\d{1,2})?\s*[月]?\s*[\-–—~至到]\s*(至今|现在|present|now)/gi;
    let dms=[],dm;
    while((dm=dp.exec(text))!==null)dms.push({text:dm[0].trim(),index:dm.index,startYear:dm[1]||dm[5],startMonth:dm[2]||dm[6]||'',endYear:dm[3]||'',endMonth:dm[4]||'',isPresent:!!dm[7]});
    for(let i=0;i<dms.length;i++){
      const cur=dms[i];
      const pe=i>0?dms[i-1].index+dms[i-1].text.length:Math.max(0,cur.index-120);
      const ns=i+1<dms.length?dms[i+1].index:Math.min(text.length,cur.index+600);
      const at=text.substring(cur.index+cur.text.length,ns).trim();
      const bt=text.substring(Math.max(pe,cur.index-80),cur.index).trim();
      let co='',po='',cn='';
      const ca=at.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|银行|保险|证券|投资|控股|事务所|研究院|学院|大学|医院|中心|平台|实验室|工作室))/);
      if(ca)co=ca[1].trim();else{const ba=at.match(/^\s*([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,15})/);if(ba&&!/^(?:工作|职责|负责|参与|任职|主要|项目|时间|地址|电话|邮箱|学历|教育|技能|自我|证书|联系|个人|求职|应聘|期望|意向|语言|专业|学校|毕业|出生|高级|资深|初级|中级|工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力|前端|后端|全栈|算法|数据)/.test(ba[1]))co=ba[1].trim();}
      if(!co){const bl=bt.split(/[\r\n]+/);for(let j=bl.length-1;j>=0;j--){const l=bl[j].trim();if(!l||/^\d{4}/.test(l))continue;const nm=l.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:公司|集团|科技|网络|信息|有限公司|股份公司|技术|软件|数据|传媒|咨询|教育|医疗|金融|地产|汽车|制造|互联网|电子商务|银行|保险|证券|投资|控股|事务所|研究院|学院|大学|医院|中心|平台|实验室|工作室))/);if(nm){co=nm[1];break;}}}
      if(co){let pt=at;if(pt.startsWith(co))pt=pt.substring(co.length).trim();const pmm=pt.match(/^([\u4e00-\u9fa5A-Za-z0-9/（）()+·]{2,25}?)(?:[\s\n]|$)/);if(pmm){const c2=pmm[1].trim();if(c2.length>=2&&!/^(?:公司|集团|科技|网络|信息|有限|股份|技术|软件|数据|工作|职责)/.test(c2))po=c2;}}
      if(!po){const pmm2=at.match(/(高级|资深|初级|中级)?\s*([\u4e00-\u9fa5]{2,10}(?:工程师|经理|主管|专员|总监|设计师|分析师|架构师|专家|顾问|负责人|代表|助理|实习生|运营|编辑|策划|产品|研发|开发|测试|运维|市场|销售|财务|人力))/);if(pmm2)po=pmm2[0].trim();}
      cn=at.replace(/^[\s\n\r]+/,'').replace(/\n/g,' ').replace(/\s+/g,' ').substring(0,300).trim();
      const sd=cur.startYear+(cur.startMonth?'.'+cur.startMonth:''),ed=cur.isPresent?'至今':(cur.endYear?cur.endYear+(cur.endMonth?'.'+cur.endMonth:''):'');
      const key=(co||'')+'|'+sd+'|'+ed;
      if(!seen.has(key)&&(co||po)){seen.add(key);exps.push({company:co||'',position:po||'',startDate:sd,endDate:ed,content:cn||''});}
    }
    return exps.slice(0,15);
  }
};
