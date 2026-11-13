const fs = require("fs");
const path = "C:/Users/Administrator/Documents/Codex/2026-11-05/new-chat/work/talent-map-server/data.json";
const excel = require("./excel_data.json");
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const now = () => new Date().toISOString();

// Reset
data.talents = [];
data.companies = [];
data.positions = [];
data.talentPositions = [];
data.workExperiences = [];

let idC = 1;

excel.rows.forEach((row, i) => {
  const name = (row["候选人姓名"] || "").trim();
  if (!name) return;

  let companyName = (row["公司"] || "").trim();
  let positionName = (row["岗位"] || "").trim();

  // Rows 7-15 have swapped columns (公司 column has position, 岗位 column has company)
  // Known companies: 多比特, 乐信圣文, 乐元素, 麦吉太文
  const knownCompanies = ["多比特", "乐信圣文", "乐元素", "麦吉太文"];
  const isSwapRow = i >= 5 && i < 14; // rows 7-15 (0-based: 6-14)

  if (isSwapRow) {
    // 岗位 column actually has company name, 公司 column has position name
    [companyName, positionName] = [positionName, companyName];
  }

  // For row 6 (i=5, 王崇懿): already correct, no swap needed
  // For rows without company, just use as-is

  const phone = (row["联系方式"] || "").trim();
  const source = (row["渠道"] || "").trim();
  const status = (row["寻访状态"] || "未联系").trim();
  const notes = (row["备注"] || "").trim();
  const dateStr = (row["寻访日期"] || "").trim();

  // Create company
  let companyId = null;
  if (companyName) {
    let comp = data.companies.find(c => c.name === companyName);
    if (!comp) {
      comp = { id: "comp_" + idC++, name: companyName, industry: "", city: "", notes: "", created_at: now(), updated_at: now() };
      data.companies.push(comp);
    }
    companyId = comp.id;
  }

  // Create position
  let positionId = null;
  if (positionName && companyId) {
    let pos = data.positions.find(p => p.name === positionName && p.company_id === companyId);
    if (!pos) {
      pos = { id: "pos_" + idC++, name: positionName, company_id: companyId, func: "其他", level: "不限", city: "", status: "盘点中", created_at: now(), updated_at: now() };
      data.positions.push(pos);
    }
    positionId = pos.id;
  }

  const t = {
    id: "talent_" + idC++,
    name,
    current_company: companyName || "",
    current_position: positionName || "",
    level: "",
    city: "",
    phone: phone,
    email: "",
    work_years: "",
    tags: "[]",
    owner_id: "u_admin",
    contact_status: status === "未联系" ? "未接触" : status,
    last_contact_date: "",
    onboard_date: dateStr ? dateStr.split(" ")[0] : "",
    giveup_reason: "",
    status: "active",
    created_at: now(),
    updated_at: now(),
    version: 1,
    created_by: "贾洪爽",
    merged_to_id: null,
    note: notes || "",
    source: source || ""
  };
  data.talents.push(t);

  if (positionId) {
    data.talentPositions.push({ talent_id: t.id, position_id: positionId, rating: "未评级", associated_at: now() });
  }
});

fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
console.log("=== 导入完成 ===");
console.log("人选:", data.talents.length);
console.log("公司:", data.companies.map(c => c.name).join(", "));
console.log("岗位:", data.positions.map(p => p.name).join(", "));
console.log("");
data.talents.forEach(t => {
  console.log(t.name + " | " + t.current_company + " | " + t.current_position + " | " + (t.phone || "无电话") + " | " + t.note);
});
