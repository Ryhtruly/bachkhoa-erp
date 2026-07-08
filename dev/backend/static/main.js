// ─── Global State ───
const app = {
  config: { departments: [], personnel: [], services: [] },
  hoso: [],
  contracts: [],
  pagination: { hoso: { page: 1, perPage: 25, total: 0 } },
  searchTimer: null,
}

// ─── Init ───
document.addEventListener("DOMContentLoaded", async () => {
  setupDates()
  bindNav()
  await loadConfig()
  await refreshData()
  lucide.createIcons()
})

// ─── Toast System ───
function toast(message, type = "info") {
  const container = document.getElementById("toast-container")
  if (!container) return

  const icons = { success: "check-circle", error: "alert-circle", info: "info" }
  const el = document.createElement("div")
  el.className = `toast toast-${type}`
  el.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}"></i>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.classList.add('toast-out');setTimeout(()=>this.parentElement.remove(),350)">✕</button>
  `
  container.appendChild(el)
  lucide.createIcons({ root: el })

  setTimeout(() => {
    el.classList.add("toast-out")
    setTimeout(() => el.remove(), 350)
  }, 4000)
}

// ─── Date Setup ───
function setupDates() {
  const d = new Date()
  const days = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"]
  const months = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"]
  const el = document.getElementById("live-time")
  if (el) el.textContent = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}`

  const today = d.toISOString().split("T")[0]
  const nw = new Date(); nw.setDate(d.getDate() + 7); const nwStr = nw.toISOString().split("T")[0]
  const $ = id => document.getElementById(id)
  if ($("form-hd-signdate")) $("form-hd-signdate").value = today
  if ($("form-hs-deadline")) $("form-hs-deadline").value = nwStr
  if ($("form-hd-enddate")) $("form-hd-enddate").value = nwStr
}

// ─── Format ───
function fmt(n) {
  if (n == null || isNaN(n)) return "0₫"
  return Number(n).toLocaleString("vi-VN") + "₫"
}

// ─── Nav Binding ───
function bindNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const tab = item.dataset.tab
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"))
      item.classList.add("active")
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"))
      const pane = document.getElementById(`tab-${tab}`)
      if (pane) pane.classList.add("active")
      switchTab(tab)
    })
  })
}

// ─── Tab Router ───
async function switchTab(tab) {
  const fns = { dashboard: loadDashboard, hoso: loadHoso, hopdong: loadHopdong, thuchi: loadThuchi, luong: loadPayroll, crm: loadCrm, kpi: loadKpi, wiki: loadWiki }
  if (fns[tab]) await fns[tab]()
}
async function refreshData() {
  const active = document.querySelector(".nav-item.active")
  if (active) await switchTab(active.dataset.tab)
}

// ─── Config ───
async function loadConfig() {
  try {
    const res = await fetch("/api/config")
    if (res.ok) {
      app.config = await res.json()
      populateDropdowns()
    }
  } catch {}
}

function populateDropdowns() {
  const { services, personnel, departments } = app.config
  const setOpts = (id, list, placeholder) => {
    const s = document.getElementById(id)
    if (!s) return
    s.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : ""
    list.forEach(v => s.add(new Option(v, v)))
  }
  setOpts("form-hs-service", services)
  setOpts("form-hd-service", services)
  setOpts("form-hs-main", personnel)
  const assist = document.getElementById("form-hs-assist")
  if (assist) {
    assist.innerHTML = '<option value="Không cần">Không cần</option>'
    personnel.forEach(p => assist.add(new Option(p, p)))
  }
  setOpts("form-tc-department", departments)
}

// ══════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  try {
    const res = await fetch("/api/dashboard")
    if (!res.ok) throw Error()
    const d = await res.json()
    document.getElementById("stat-total-hoso").textContent = d.total_hoso ?? 0
    document.getElementById("stat-in-progress").textContent = d.in_progress ?? 0
    document.getElementById("stat-overdue").textContent = d.overdue ?? 0
    document.getElementById("stat-revenue").textContent = fmt(d.total_collected)
    document.getElementById("stat-contract-val").textContent = fmt(d.total_contract_value)
    document.getElementById("stat-paid-val").textContent = fmt(d.total_collected)
    document.getElementById("stat-debt-val").textContent = fmt(d.total_debt)

    const tbody = document.getElementById("dashboard-recent-hoso")
    tbody.innerHTML = ""
    if (!d.recent_hoso || d.recent_hoso.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>Chưa có dữ liệu</p></div></td></tr>`
      return
    }
    d.recent_hoso.forEach(h => {
      const s = h["Trạng thái"] || ""
      const cls = s === "Hoàn thành" ? "badge badge-success" : s.includes("Hủy") ? "badge badge-danger" : (s.includes("Chờ")||s.includes("Đang")) ? "badge badge-warning" : "badge badge-default"
      tbody.innerHTML += `<tr>
        <td><strong>${h["Mã hồ sơ"]||""}</strong></td>
        <td>${h["Tên khách hàng"]||""}</td>
        <td>${h["Loại dịch vụ"]||""}</td>
        <td>${h["Khu vực/Phường"]||""}</td>
        <td>${h["Phụ trách chính"]||""}</td>
        <td>${h["Deadline"]||""}</td>
        <td><span class="${cls}">${s}</span></td>
      </tr>`
    })
  } catch {
    toast("Không thể tải dashboard", "error")
  }
}

// ══════════════════════════════════════════
//  HỒ SƠ
// ══════════════════════════════════════════
async function loadHoso() {
  const tbody = document.getElementById("hoso-table-body")
  tbody.innerHTML = Array(8).fill(0).map(() =>
    `<tr class="skeleton-row">${Array(11).fill(0).map(() => '<td><div class="skeleton">&nbsp;</div></td>').join("")}</tr>`
  ).join("")

  try {
    const res = await fetch("/api/hoso")
    if (!res.ok) throw Error()
    app.hoso = await res.json()
    app.pagination.hoso.total = app.hoso.length
    app.pagination.hoso.page = 1
    renderHoso()
  } catch {
    toast("Lỗi tải danh sách hồ sơ", "error")
  }
}

function renderHoso() {
  const { page, perPage } = app.pagination.hoso
  const list = app.hoso
  const start = (page - 1) * perPage
  const end = Math.min(start + perPage, list.length)
  const pageItems = list.slice(start, end)

  const tbody = document.getElementById("hoso-table-body")
  tbody.innerHTML = ""
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><i data-lucide="search-x"></i><h4>Không tìm thấy</h4><p>Thử thay đổi từ khóa tìm kiếm</p></div></td></tr>`
    return
  }

  pageItems.forEach(h => {
    const s = h["Trạng thái"] || ""
    const cls = s === "Hoàn thành" ? "badge badge-success" : s.includes("Hủy") ? "badge badge-danger" : (s.includes("Chờ")||s.includes("Đang")) ? "badge badge-warning" : "badge badge-default"
    const w = h["Cảnh báo"] || "Trong hạn"
    const wCls = w === "XONG" ? "badge badge-success" : w === "QUÁ HẠN" ? "badge badge-danger" : "badge badge-default"

    const actions = `
      <select class="btn btn-secondary btn-xs" style="font-size:0.7rem;height:26px;padding:0 6px;" onchange="updateHosoStatus('${h["Mã hồ sơ"]}', this.value)">
        <option value="" disabled selected>Cập nhật</option>
        <option value="Mới tiếp nhận">Mới tiếp nhận</option>
        <option value="Chờ khảo sát">Chờ khảo sát</option>
        <option value="Đang đo">Đang đo</option>
        <option value="Đang làm hồ sơ">Đang làm hồ sơ</option>
        <option value="Nộp thành công - Chờ kết quả">Nộp thành công</option>
        <option value="Chờ khách bổ sung">Chờ khách bổ sung</option>
        <option value="Hoàn thành">Hoàn thành</option>
        <option value="Đã hủy">Đã hủy</option>
      </select>`

    tbody.innerHTML += `<tr>
      <td><strong class="mono">${h["Mã hồ sơ"]||""}</strong></td>
      <td>${h["Tên khách hàng"]||""}</td>
      <td class="mono">${h["SĐT"]||"—"}</td>
      <td>${h["Loại dịch vụ"]||""}</td>
      <td>${h["Khu vực/Phường"]||""}</td>
      <td>${h["Phụ trách chính"]||""}</td>
      <td>${h["Hỗ trợ"]||"—"}</td>
      <td class="mono">${h["Deadline"]||""}</td>
      <td><span class="${wCls}">${w}</span></td>
      <td><span class="${cls}">${s}</span></td>
      <td>${actions}</td>
    </tr>`
  })
  lucide.createIcons()
  renderPagination("hoso-pagination", app.pagination.hoso, renderHoso)
}

function filterHosoTable() {
  const q = document.getElementById("hoso-search-input").value.toLowerCase()
  app.hoso.forEach(h => {
    h._hidden = !(
      (h["Mã hồ sơ"]||"").toLowerCase().includes(q) ||
      (h["Tên khách hàng"]||"").toLowerCase().includes(q) ||
      (h["Khu vực/Phường"]||"").toLowerCase().includes(q) ||
      (h["Loại dịch vụ"]||"").toLowerCase().includes(q) ||
      (h["Phụ trách chính"]||"").toLowerCase().includes(q)
    )
  })
  app.pagination.hoso.page = 1
  renderHoso()
}

// Debounced search
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("hoso-search-input")
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(app.searchTimer)
      app.searchTimer = setTimeout(filterHosoTable, 250)
    })
  }
})

// ─── Pagination ───
function renderPagination(containerId, state, renderFn) {
  const el = document.getElementById(containerId)
  if (!el) return
  const { page, perPage, total } = state
  const pages = Math.ceil(total / perPage)
  if (pages <= 1) { el.innerHTML = ""; return }

  let html = `<button class="page-btn" onclick="goPage('${containerId}',${page-1},${renderFn.name})" ${page<=1?'disabled':''} style="${page<=1?'opacity:0.3;cursor:default':''}">‹</button>`
  const range = 3
  for (let i = Math.max(1, page-range); i <= Math.min(pages, page+range); i++) {
    html += `<button class="page-btn ${i===page?'active':''}" onclick="goPage('${containerId}',${i},'${renderFn.name}')">${i}</button>`
  }
  html += `<span class="page-info">${total} bản ghi</span>`
  html += `<button class="page-btn" onclick="goPage('${containerId}',${page+1},'${renderFn.name}')" ${page>=pages?'disabled':''} style="${page>=pages?'opacity:0.3;cursor:default':''}">›</button>`
  el.innerHTML = html
}

function goPage(containerId, page, fnName) {
  const state = app.pagination.hoso
  if (page < 1 || page > Math.ceil(state.total / state.perPage)) return
  state.page = page
  if (fnName === "renderHoso") renderHoso()
}

// ─── CRUD Hồ sơ ───
async function handleCreateHoso(e) {
  e.preventDefault()
  const payload = {
    Tên_hồ_sơ: document.getElementById("form-hs-name").value,
    Tên_khách_hàng: document.getElementById("form-hs-client").value,
    SĐT: document.getElementById("form-hs-phone").value,
    Khu_vực_Phường: document.getElementById("form-hs-area").value,
    Loại_dịch_vụ: document.getElementById("form-hs-service").value,
    Phụ_trách_chính: document.getElementById("form-hs-main").value,
    Hỗ_trợ: document.getElementById("form-hs-assist").value,
    Deadline: document.getElementById("form-hs-deadline").value,
    Trạng_thái: "Mới tiếp nhận"
  }
  try {
    const res = await fetch("/api/hoso", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      closeModal("add-hoso-modal")
      document.getElementById("add-hoso-form").reset()
      setupDates()
      toast("Tạo hồ sơ thành công!", "success")
      await loadHoso()
    } else {
      const err = await res.json()
      toast("Lỗi: " + (err.detail || "Không xác định"), "error")
    }
  } catch {
    toast("Lỗi kết nối máy chủ", "error")
  }
}

async function updateHosoStatus(maHs, newStatus) {
  if (!confirm(`Chuyển "${maHs}" sang trạng thái "${newStatus}"?`)) return
  try {
    const res = await fetch("/api/hoso/update-status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Mã_hồ_sơ: maHs, Trạng_thái: newStatus })
    })
    if (res.ok) {
      toast("Đã cập nhật trạng thái!", "success")
      await loadHoso()
    } else {
      const err = await res.json()
      toast("Lỗi: " + (err.detail || ""), "error")
    }
  } catch {
    toast("Lỗi kết nối", "error")
  }
}

// ══════════════════════════════════════════
//  HỢP ĐỒNG
// ══════════════════════════════════════════
async function loadHopdong() {
  try {
    const res = await fetch("/api/hopdong")
    if (!res.ok) throw Error()
    app.contracts = await res.json()
    renderContracts()

    // Populate dropdowns
    const s1 = document.getElementById("form-hd-hoso-select")
    const s2 = document.getElementById("form-tc-hopdong")
    if (s1) {
      s1.innerHTML = '<option value="">— Chọn —</option>'
      app.hoso.forEach(h => { if (h["Mã hồ sơ"]) s1.add(new Option(`${h["Mã hồ sơ"]} — ${h["Tên khách hàng"]}`, h["Mã hồ sơ"])) })
    }
    if (s2) {
      s2.innerHTML = '<option value="None">Không liên kết</option>'
      app.contracts.forEach(c => { if (c["Mã hợp đồng"]) s2.add(new Option(`${c["Mã hợp đồng"]} — ${c["Tên khách hàng"]}`, c["Mã hợp đồng"])) })
    }
  } catch {
    toast("Lỗi tải hợp đồng", "error")
  }
}

function renderContracts() {
  const tbody = document.getElementById("contract-table-body")
  tbody.innerHTML = ""
  if (app.contracts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>Chưa có hợp đồng</p></div></td></tr>`
    return
  }
  app.contracts.forEach(c => {
    const s = c["Tình trạng"] || "Chờ thanh toán"
    const cls = s === "Đã tất toán" ? "badge badge-success" : s === "Quá hạn thanh toán" ? "badge badge-danger" : "badge badge-warning"

    let docLink = `<span style="color:var(--text-tertiary);font-size:0.78rem;">—</span>`
    const gc = c["Ghi chú"] || ""
    if (gc.includes("/static/generated_contracts/")) {
      const url = gc.split("File Hợp đồng: ")[1] || gc
      docLink = `<a href="${url}" class="btn btn-secondary btn-xs" download><i data-lucide="download"></i> File</a>`
    }

    tbody.innerHTML += `<tr>
      <td><strong class="mono">${c["Mã hợp đồng"]||""}</strong></td>
      <td class="mono">${c["Mã hồ sơ"]||"—"}</td>
      <td>${c["Tên khách hàng"]||""}</td>
      <td>${c["Dịch vụ"]||""}</td>
      <td class="mono">${fmt(c["Giá trị hợp đồng"]||c["Giá trị HĐ"])}</td>
      <td class="mono text-success">${fmt(c["Đã thu"]||c["Đã thanh toán"])}</td>
      <td class="mono"><strong style="color:${(c["Còn nợ"]||0) > 0 ? 'var(--red-400)' : 'var(--green-400)'}">${fmt(c["Còn nợ"]||c["Công nợ"])}</strong></td>
      <td><span class="${cls}">${s}</span></td>
      <td>${docLink}</td>
    </tr>`
  })
  lucide.createIcons()
}

function populateContractFormFromHoso() {
  const maHs = document.getElementById("form-hd-hoso-select").value
  const hs = app.hoso.find(h => h["Mã hồ sơ"] === maHs)
  if (!hs) return
  ;["form-hd-name","form-hd-phone","form-hd-address"].forEach(id => document.getElementById(id).value = "")
  const nameEl = document.getElementById("form-hd-name")
  if (nameEl) nameEl.value = hs["Tên khách hàng"] || ""
  const phoneEl = document.getElementById("form-hd-phone")
  if (phoneEl) phoneEl.value = hs["SĐT"] || ""
  const addrEl = document.getElementById("form-hd-address")
  if (addrEl) addrEl.value = hs["Khu vực/Phường"] || ""
  const svcEl = document.getElementById("form-hd-service")
  if (svcEl && hs["Loại dịch vụ"]) svcEl.value = hs["Loại dịch vụ"]
}

async function handleGenerateContract(e) {
  e.preventDefault()
  const val = parseFloat(document.getElementById("form-hd-value").value)
  if (!val || val <= 0) { toast("Nhập giá trị hợp đồng hợp lệ", "error"); return }

  const payload = {
    SO_HOP_DONG: document.getElementById("form-hd-code").value,
    MA_HO_SO: document.getElementById("form-hd-hoso-select").value,
    TEN_KHACH_HANG: document.getElementById("form-hd-name").value,
    SO_DIEN_THOAI: document.getElementById("form-hd-phone").value,
    KHACH_HANG_EMAIL: "admin@nhadatbachkhoa.com",
    LOAI_DICH_VU: document.getElementById("form-hd-service").value,
    DIA_CHI: document.getElementById("form-hd-address").value,
    GIA_TRI_HOP_DONG: val,
    NGAY_KY: document.getElementById("form-hd-signdate").value,
    NGAY_HET_HAN: document.getElementById("form-hd-enddate").value,
    Sale_nguồn: document.getElementById("form-hd-sale").value
  }
  try {
    const res = await fetch("/api/hopdong/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      const data = await res.json()
      toast("Hợp đồng đã được tạo thành công!", "success")
      window.open(data.download_url)
      document.getElementById("contract-generator-form").reset()
      setupDates()
      await loadHopdong()
    } else {
      const err = await res.json()
      toast("Lỗi: " + (err.detail || ""), "error")
    }
  } catch {
    toast("Lỗi kết nối máy chủ", "error")
  }
}

// ══════════════════════════════════════════
//  THU CHI
// ══════════════════════════════════════════
async function loadThuchi() {
  try {
    const res = await fetch("/api/thuchi")
    if (!res.ok) throw Error()
    const list = await res.json()
    const tbody = document.getElementById("thuchi-table-body")
    tbody.innerHTML = ""

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>Chưa có giao dịch</p></div></td></tr>`
      return
    }
    list.forEach(t => {
      const isChi = t["Loại Thu/Chi"] === "Chi"
      const cls = isChi ? "badge badge-danger" : "badge badge-success"
      const amtCls = isChi ? "text-danger" : "text-success"
      const prefix = isChi ? "−" : "+"
      tbody.innerHTML += `<tr>
        <td class="mono">${t["Ngày"]||""}</td>
        <td><strong class="mono">${t["Mã phiếu"]||t["Số chứng từ"]||""}</strong></td>
        <td class="mono">${t["Mã hồ sơ"]||"—"}</td>
        <td>${t["Diễn giải"]||""}</td>
        <td><span class="${cls}">${t["Loại Thu/Chi"]||t["Loại"]}</span></td>
        <td>${t["Người nhận/Nộp"]||""}</td>
        <td class="mono"><strong class="${amtCls}">${prefix}${fmt(t["Số tiền"])}</strong></td>
        <td>${t["Hình thức"]||""}</td>
      </tr>`
    })
  } catch {
    toast("Lỗi tải thu chi", "error")
  }
}

async function handleCreateThuchi(e) {
  e.preventDefault()
  const amt = parseFloat(document.getElementById("form-tc-amount").value)
  if (!amt || amt <= 0) { toast("Nhập số tiền hợp lệ", "error"); return }

  const payload = {
    Loại_Thu_Chi: document.getElementById("form-tc-type").value,
    Mã_hồ_sơ: document.getElementById("form-tc-hoso").value,
    Mã_hợp_đồng: document.getElementById("form-tc-hopdong").value,
    Diễn_giải: document.getElementById("form-tc-details").value,
    Phòng_ban: document.getElementById("form-tc-department").value,
    Người_nhận_Nộp: document.getElementById("form-tc-person").value,
    Hình_thức: document.getElementById("form-tc-method").value,
    Số_tiền: amt
  }
  try {
    const res = await fetch("/api/thuchi", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      document.getElementById("thuchi-form").reset()
      toast("Ghi sổ quỹ thành công!", "success")
      await loadThuchi()
    } else {
      const err = await res.json()
      toast("Lỗi: " + (err.detail || ""), "error")
    }
  } catch {
    toast("Lỗi kết nối máy chủ", "error")
  }
}

// ══════════════════════════════════════════
//  LƯƠNG
// ══════════════════════════════════════════
async function loadPayroll() {
  const month = document.getElementById("payroll-month").value
  try {
    const res = await fetch(`/api/luong?month=${month}`)
    if (!res.ok) throw Error()
    const list = await res.json()
    const tbody = document.getElementById("payroll-table-body")
    tbody.innerHTML = ""

    const hsSet = new Set(list.map(r => r["Mã hồ sơ"]))
    document.getElementById("payroll-count").textContent = hsSet.size

    let total = 0
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>Không có hồ sơ hoàn thành tháng này</p></div></td></tr>`
      document.getElementById("payroll-total-amount").textContent = "0₫"
      return
    }
    list.forEach(r => {
      const val = parseFloat(r["Tổng nhận"] || r["Số tiền khoán"] || 0)
      total += val
      tbody.innerHTML += `<tr>
        <td><strong>${r["Nhân sự"]||""}</strong></td>
        <td class="mono">${r["Mã hồ sơ"]||""}</td>
        <td>${r["Công đoạn khoán"]||""}</td>
        <td class="mono">${fmt(r["Số tiền khoán"])}</td>
        <td class="mono">${fmt(r["Phụ cấp"])}</td>
        <td class="mono">${fmt(r["Thưởng/Phạt"])}</td>
        <td class="mono"><strong class="text-success">${fmt(val)}</strong></td>
        <td class="mono">${r["Ngày chốt"]||""}</td>
        <td style="font-size:0.78rem;color:var(--text-tertiary)">${r["Ghi chú"]||""}</td>
      </tr>`
    })
    document.getElementById("payroll-total-amount").textContent = fmt(total)
  } catch {
    toast("Lỗi tải bảng lương", "error")
  }
}

// ══════════════════════════════════════════
//  CRM PIPELINE
// ══════════════════════════════════════════
async function loadCrm() {
  try {
    const res = await fetch("/api/crm/leads")
    if (!res.ok) throw Error()
    const response = await res.json()
    const leads = response.data || []
    
    const board = document.getElementById("crm-kanban-board")
    const statuses = ["Tiếp cận", "Báo giá", "Đàm phán", "Chốt"]
    board.innerHTML = ""
    
    statuses.forEach(s => {
      const colLeads = leads.filter(l => l.status === s)
      let cardsHtml = ""
      colLeads.forEach(l => {
        cardsHtml += `
          <div class="crm-card">
            <h4>${l.customer_name}</h4>
            <p>${l.phone}</p>
            <select onchange="updateLeadStatus('${l.id}', this.value)">
              ${statuses.map(opt => `<option value="${opt}" ${opt === s ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </div>
        `
      })
      board.innerHTML += `
        <div class="crm-col">
          <div class="crm-col-header">
            <span>${s}</span>
            <span class="badge badge-default">${colLeads.length}</span>
          </div>
          ${cardsHtml}
        </div>
      `
    })
  } catch {
    toast("Lỗi tải Pipeline CRM", "error")
  }
}

async function updateLeadStatus(leadId, newStatus) {
  try {
    const res = await fetch(`/api/crm/leads/${leadId}/status?new_status=${newStatus}`, { method: "PUT" })
    if (res.ok) {
      toast("Đã chuyển trạng thái Lead", "success")
      await loadCrm()
    } else {
      toast("Lỗi cập nhật Lead", "error")
    }
  } catch {
    toast("Lỗi kết nối", "error")
  }
}

async function handleCreateLead(e) {
  e.preventDefault()
  const payload = {
    customer_name: document.getElementById("form-lead-name").value,
    phone: document.getElementById("form-lead-phone").value,
    source: document.getElementById("form-lead-source").value,
    status: "Tiếp cận",
    notes: document.getElementById("form-lead-notes").value
  }
  
  try {
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      closeModal("add-lead-modal")
      document.getElementById("add-lead-form").reset()
      toast("Tạo Lead thành công!", "success")
      await loadCrm()
    } else {
      const err = await res.json()
      toast("Lỗi: " + (err.detail || "Không thể tạo Lead"), "error")
    }
  } catch {
    toast("Lỗi kết nối máy chủ", "error")
  }
}

// ══════════════════════════════════════════
//  KPI NHÂN SỰ
// ══════════════════════════════════════════
async function loadKpi() {
  const month = document.getElementById("kpi-month").value
  try {
    const res = await fetch(`/api/kpi/scores?month=${month}`)
    if (!res.ok) throw Error()
    const response = await res.json()
    const scores = response.data || {}
    
    const tbody = document.getElementById("kpi-table-body")
    tbody.innerHTML = ""
    if (Object.keys(scores).length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Chưa có dữ liệu KPI tháng này</p></div></td></tr>`
      return
    }
    
    for (const [emp, data] of Object.entries(scores)) {
      const isGood = data.score >= 100
      tbody.innerHTML += `
        <tr>
          <td><strong>${emp}</strong></td>
          <td class="mono">${data.total_tasks}</td>
          <td class="mono"><strong style="color:${isGood ? 'var(--green-500)' : 'var(--amber-500)'}">${data.score}</strong></td>
          <td><span class="badge ${isGood ? 'badge-success' : 'badge-warning'}">${isGood ? 'Tốt' : 'Cần cố gắng'}</span></td>
          <td style="font-size:0.8rem; color:var(--text-tertiary)">${data.details ? data.details.join(', ') : ''}</td>
        </tr>
      `
    }
  } catch {
    toast("Lỗi tải điểm KPI", "error")
  }
}

// ══════════════════════════════════════════
//  WIKI (TRI THỨC)
// ══════════════════════════════════════════
async function loadWiki() {
  try {
    const res = await fetch("/api/wiki/")
    if (!res.ok) throw Error()
    const response = await res.json()
    const docs = response.data || []
    
    const tbody = document.getElementById("wiki-table-body")
    tbody.innerHTML = ""
    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Chưa có tài liệu nào</p></div></td></tr>`
      return
    }
    
    docs.forEach(d => {
      tbody.innerHTML += `
        <tr>
          <td class="mono"><strong>${d.id}</strong></td>
          <td>${d.title}</td>
          <td><span class="badge badge-info">${d.category}</span></td>
          <td><a href="${d.link}" class="btn btn-secondary btn-xs" target="_blank"><i data-lucide="eye"></i> Xem</a></td>
        </tr>
      `
    })
    lucide.createIcons()
  } catch {
    toast("Lỗi tải Wiki", "error")
  }
}

async function handleUploadWiki(e) {
  e.preventDefault()
  const payload = {
    id: document.getElementById("form-wiki-id").value,
    title: document.getElementById("form-wiki-title").value,
    category: document.getElementById("form-wiki-category").value,
    link: document.getElementById("form-wiki-link").value,
    roles_allowed: ["*"]
  }
  
  try {
    const res = await fetch("/api/wiki/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      closeModal("add-wiki-modal")
      document.getElementById("add-wiki-form").reset()
      toast("Đăng tài liệu thành công!", "success")
      await loadWiki()
    } else {
      const err = await res.json()
      toast("Lỗi: " + (err.detail || "Không thể lưu tài liệu"), "error")
    }
  } catch {
    toast("Lỗi kết nối máy chủ", "error")
  }
}

// ─── Modal ───
function openModal(id) {
  document.getElementById(id).classList.add("open")
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open")
}
// Close modal on backdrop click
document.querySelectorAll(".modal-overlay").forEach(el => {
  el.addEventListener("click", e => { if (e.target === el) el.classList.remove("open") })
})
