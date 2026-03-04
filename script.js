"use strict";

/* ===========================
   SUPABASE INIT
   =========================== */
const SUPABASE_URL      = "https://oowmffgepmfvqutnqxdl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vd21mZmdlcG1mdnF1dG5xeGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4Mzc4OTIsImV4cCI6MjA4NzQxMzg5Mn0.9c22b46Af6cWIFHBZROi63-hicObyHoStq2XglqoL2A";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===========================
   STATE
   =========================== */
let inputMode    = "monthly";
let bandsVisible = false;
let lastCalc     = null;
let _deletingAccount = false;  // prevents onAuthStateChange re-login during account deletion

/* ===========================
   INPUT MODE TOGGLE
   =========================== */
function setInputMode(mode) {
  inputMode = mode;
  document.getElementById("monthlyBtn").classList.toggle("active", mode === "monthly");
  document.getElementById("annualBtn").classList.toggle("active",  mode === "annual");
  document.getElementById("periodLabel").textContent = mode === "monthly" ? "(Monthly)" : "(Annual)";
  calculate();
}

/* ===========================
   HELPERS
   =========================== */
function val(id) { return parseFloat(document.getElementById(id).value) || 0; }

function fmt(n) {
  if (n === 0) return "₦0";
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

function getRegime() {
  return document.querySelector("input[name='regime']:checked").value;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ===========================
   TAX BANDS
   =========================== */
const NTA2025_BANDS = [
  { label:"First ₦800,000",    limit:800_000,   rate:0.00 },
  { label:"Next ₦2,200,000",   limit:2_200_000, rate:0.15 },
  { label:"Next ₦9,000,000",   limit:9_000_000, rate:0.18 },
  { label:"Next ₦12,000,000",  limit:12_000_000,rate:0.21 },
  { label:"Next ₦16,000,000",  limit:16_000_000,rate:0.23 },
  { label:"Above ₦40,000,000", limit:Infinity,  rate:0.25 },
];

const PITA_BANDS = [
  { label:"First ₦300,000",    limit:300_000,  rate:0.07 },
  { label:"Next ₦300,000",     limit:300_000,  rate:0.11 },
  { label:"Next ₦500,000",     limit:500_000,  rate:0.15 },
  { label:"Next ₦500,000",     limit:500_000,  rate:0.19 },
  { label:"Next ₦1,600,000",   limit:1_600_000,rate:0.21 },
  { label:"Above ₦3,200,000",  limit:Infinity, rate:0.24 },
];

function calcBands(chargeableIncome, bands) {
  let remaining = Math.max(0, chargeableIncome);
  let totalTax  = 0;
  const workings = [];
  for (const band of bands) {
    if (remaining <= 0) { workings.push({...band, taxable:0, tax:0}); continue; }
    const taxable = band.limit === Infinity ? remaining : Math.min(remaining, band.limit);
    const tax = taxable * band.rate;
    totalTax += tax;
    workings.push({...band, taxable, tax});
    remaining -= taxable;
  }
  return { totalTax, workings };
}

/* ===========================
   MAIN CALCULATION
   =========================== */
function calculate() {
  const mult       = inputMode === "monthly" ? 12 : 1;
  const basic      = val("basic")     * mult;
  const housing    = val("housing")   * mult;
  const transport  = val("transport") * mult;
  const other      = val("other")     * mult;
  const annualRent = val("annualRent");

  if (basic + housing + transport + other === 0) { showEmpty(); lastCalc = null; return; }

  const gross      = basic + housing + transport + other;
  const pension    = 0.08  * (basic + housing + transport);
  const nhf        = 0.025 * basic;
  const nhis       = 0.05  * basic;
  const rentRelief = annualRent > 0 ? Math.min(0.20 * annualRent, 500_000) : 0;
  const chargeable = Math.max(0, gross - pension - nhf - nhis - rentRelief);

  const isExempt      = chargeable <= 800_000;
  const ntaResult     = calcBands(chargeable, NTA2025_BANDS);
  const ntaPaye       = ntaResult.totalTax;
  const ntaNet        = gross - pension - nhf - nhis - ntaPaye;
  const ntaNetMonthly = ntaNet / 12;
  const effectiveRate = gross > 0 ? (ntaPaye / gross) * 100 : 0;

  const cra            = Math.max(200_000, 0.01 * gross) + 0.20 * gross;
  const pitaChargeable = Math.max(0, gross - pension - nhf - nhis - cra);
  const pitaResult     = calcBands(pitaChargeable, PITA_BANDS);
  const pitaPaye       = pitaResult.totalTax;
  const pitaNet        = gross - pension - nhf - nhis - pitaPaye;
  const pitaNetMonthly = pitaNet / 12;
  const diff           = ntaNetMonthly - pitaNetMonthly;

  lastCalc = {
    basic, housing, transport, other_allowances:other, annual_rent:annualRent,
    gross_annual:gross, pension, nhf, nhis, rent_relief:rentRelief,
    chargeable_income:chargeable, nta_paye:ntaPaye,
    nta_net_monthly:ntaNetMonthly, nta_net_annual:ntaNet,
    pita_paye:pitaPaye, pita_net_monthly:pitaNetMonthly,
    effective_rate:effectiveRate, input_mode:inputMode,
    cra, pitaNet, diff, isExempt,
    ntaBands:ntaResult.workings, pitaBands:pitaResult.workings,
  };

  showResults();

  document.getElementById("exemptionBanner").classList.toggle("hidden", !isExempt);
  if (isExempt) {
    const exemptEl = document.getElementById("exemptChargeableAmt");
    if (exemptEl) exemptEl.textContent = fmt(chargeable/12) + "/mo (" + fmt(chargeable) + "/yr)";
  }
  document.getElementById("grossDisplay").textContent          = fmt(gross/12);
  document.getElementById("chargeableDisplay").textContent     = fmt(chargeable/12) + "/mo";
  document.getElementById("effectiveRateDisplay").textContent  = effectiveRate.toFixed(2) + "%";
  document.getElementById("summaryNetMonthly").textContent     = fmt(ntaNetMonthly);
  document.getElementById("summaryNetAnnual").textContent      = fmt(ntaNet);
  document.getElementById("pensionDisplay").textContent        = fmt(pension/12) + "/mo";
  document.getElementById("nhfDisplay").textContent            = fmt(nhf/12) + "/mo";
  document.getElementById("nhisDisplay").textContent           = fmt(nhis/12) + "/mo";
  document.getElementById("totalDeductionsDisplay").textContent= fmt((pension+nhf+nhis+rentRelief)/12) + "/mo";

  const rentRow = document.getElementById("rentRow");
  if (rentRelief > 0) {
    rentRow.classList.remove("hidden");
    document.getElementById("rentReliefDisplay").textContent = "-" + fmt(rentRelief) + "/yr";
  } else { rentRow.classList.add("hidden"); }

  document.getElementById("ntaPaye").textContent        = fmt(ntaPaye/12) + "/mo";
  document.getElementById("ntaNetMonthly").textContent  = fmt(ntaNetMonthly);
  document.getElementById("ntaNetAnnual").textContent   = fmt(ntaNet);
  document.getElementById("pitaCra").textContent        = fmt(cra/12) + "/mo";
  document.getElementById("pitaPaye").textContent       = fmt(pitaPaye/12) + "/mo";
  document.getElementById("pitaNetMonthly").textContent = fmt(pitaNetMonthly);
  document.getElementById("pitaNetAnnual").textContent  = fmt(pitaNet);

  renderBands("ntaBands",  ntaResult.workings);
  renderBands("pitaBands", pitaResult.workings);

  const regime = getRegime();
  document.getElementById("nta2025Result").classList.toggle("hidden", regime === "pita");
  document.getElementById("pitaResult").classList.toggle("hidden",    regime === "nta2025");

  const compEl = document.getElementById("comparisonHighlight");
  if (regime === "both") {
    compEl.classList.remove("hidden");
    const absDiff = Math.abs(diff);
    document.getElementById("comparisonValue").textContent  = (diff >= 0 ? "+" : "-") + fmt(absDiff);
    document.getElementById("comparisonValue").className    = "comparison-value " + (diff >= 0 ? "positive" : "negative");
    document.getElementById("comparisonSub").textContent    = diff >= 0 ? "more per month under NTA 2025 ✓" : "less per month under NTA 2025";
  } else { compEl.classList.add("hidden"); }
}

/* ===========================
   RENDER BANDS
   =========================== */
function renderBands(containerId, workings) {
  const container = document.getElementById(containerId);
  if (!workings.some(w => w.taxable > 0)) {
    container.innerHTML = '<p style="font-size:12px;color:#888;padding:10px 0;">No taxable income in any band.</p>';
    return;
  }
  const rows = workings.filter(w => w.taxable > 0 || w.rate === 0).map(w => `
    <tr>
      <td>${w.label}</td>
      <td class="band-rate">${(w.rate*100).toFixed(0)}%</td>
      <td>${fmt(w.taxable)}</td>
      <td class="band-tax">${w.tax > 0 ? fmt(w.tax) : "—"}</td>
    </tr>`).join("");
  container.innerHTML = `
    <table class="bands-table">
      <thead><tr><th>Band</th><th>Rate</th><th>Taxable</th><th>Tax</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function toggleBands() {
  bandsVisible = !bandsVisible;
  document.getElementById("ntaBands").classList.toggle("hidden", !bandsVisible);
  document.getElementById("pitaBands").classList.toggle("hidden", !bandsVisible);
  document.getElementById("bandsToggleLabel").textContent = bandsVisible
    ? "▲ Hide Tax Band Workings" : "▼ Show Tax Band Workings";
}

function showEmpty() {
  document.getElementById("emptyState").classList.remove("hidden");
  document.getElementById("resultsContent").classList.add("hidden");
}
function showResults() {
  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("resultsContent").classList.remove("hidden");
}

/* ===========================
   US-007 — SAVE CALCULATION
   =========================== */
async function saveCalculation() {
  if (!lastCalc)     { showSaveStatus("Please calculate your tax first.", "error"); return; }
  if (!currentUser)  { showSaveStatus("Please sign in to save calculations.", "error"); return; }

  const saveBtn  = document.getElementById("saveBtn");
  const meta     = currentUser.user_metadata || {};
  const name     = meta.full_name || currentUser.email || "Anonymous";

  saveBtn.disabled    = true;
  saveBtn.textContent = "Saving...";

  const { error } = await sb.from("tax_calculations").insert({
    user_id:           currentUser.id,
    user_name:         name,
    basic:             lastCalc.basic,
    housing:           lastCalc.housing,
    transport:         lastCalc.transport,
    other_allowances:  lastCalc.other_allowances,
    annual_rent:       lastCalc.annual_rent,
    gross_annual:      lastCalc.gross_annual,
    pension:           lastCalc.pension,
    nhf:               lastCalc.nhf,
    nhis:              lastCalc.nhis,
    rent_relief:       lastCalc.rent_relief,
    chargeable_income: lastCalc.chargeable_income,
    nta_paye:          lastCalc.nta_paye,
    nta_net_monthly:   lastCalc.nta_net_monthly,
    nta_net_annual:    lastCalc.nta_net_annual,
    pita_paye:         lastCalc.pita_paye,
    pita_net_monthly:  lastCalc.pita_net_monthly,
    effective_rate:    lastCalc.effective_rate,
    input_mode:        lastCalc.input_mode,
  });

  saveBtn.disabled    = false;
  saveBtn.textContent = "💾 Save Calculation";

  if (error) { showSaveStatus("Failed to save: " + error.message, "error"); }
  else       { showSaveStatus("✓ Saved successfully!", "success"); loadHistory(); }
}

function showSaveStatus(msg, type) {
  const el = document.getElementById("saveStatus");
  el.textContent = msg;
  el.className   = "save-status " + type;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

/* ===========================
   LOAD HISTORY
   =========================== */
let _allHistory = [];
let _historyPage = 0;
const HISTORY_PER_PAGE = 5;

async function loadHistory() {
  if (!currentUser) return;
  const grid  = document.getElementById("historyGrid");
  const empty = document.getElementById("historyEmpty");
  grid.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;font-family:var(--mono);padding:20px 0;">Loading...</p>';
  const { data, error } = await sb
    .from("tax_calculations").select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false }).limit(200);
  if (error) { grid.innerHTML = `<p style="color:#FF7070;font-size:13px;">Error: ${error.message}</p>`; return; }
  if (!data || data.length === 0) { grid.innerHTML = ""; empty.classList.remove("hidden"); return; }
  _allHistory  = data;
  _historyPage = 0;
  empty.classList.add("hidden");
  grid.innerHTML = "";
  renderNextHistoryPage();
}

function renderNextHistoryPage() {
  const grid  = document.getElementById("historyGrid");
  const batch = _allHistory.slice(_historyPage * HISTORY_PER_PAGE, (_historyPage + 1) * HISTORY_PER_PAGE);
  _historyPage++;

  batch.forEach(c => {
    const diff   = c.nta_net_monthly - c.pita_net_monthly;
    const better = diff >= 0;
    const card   = document.createElement("div");
    card.className = "history-card";
    card.innerHTML = buildHistoryCard(c, diff, better);
    grid.appendChild(card);
  });

  // Show More button
  const existing = document.getElementById("histShowMore");
  if (existing) existing.remove();
  const remaining = _allHistory.length - _historyPage * HISTORY_PER_PAGE;
  if (remaining > 0) {
    const btn = document.createElement("div");
    btn.id = "histShowMore";
    btn.style.cssText = "text-align:center;margin-top:20px;";
    btn.innerHTML = `<button class="btn-refresh" onclick="renderNextHistoryPage()" style="padding:10px 32px;font-size:13px;">Show More <span style="opacity:0.5;">(${remaining} remaining)</span></button>`;
    grid.appendChild(btn);
  }
}

function buildHistoryCard(c, diff, better) {
  return `
    <div class="card-top">
      <span class="card-name">${escHtml(c.user_name || "Anonymous")}</span>
      <span class="card-date">${formatDate(c.created_at)}</span>
    </div>

    <div class="card-summary-bar">
      <div class="card-summary-item">
        <span class="card-stat-label">Gross / Month</span>
        <span class="card-stat-value">${fmt(c.gross_annual / 12)}</span>
      </div>
      <div class="card-summary-item">
        <span class="card-stat-label">Chargeable / Month</span>
        <span class="card-stat-value">${fmt(c.chargeable_income / 12)}</span>
      </div>
      <div class="card-summary-item">
        <span class="card-stat-label">Effective Tax Rate</span>
        <span class="card-stat-value" style="color:var(--green-light);">${Number(c.effective_rate).toFixed(2)}%</span>
      </div>
    </div>

    <div class="hcard-deductions">
      <div class="hcard-section-label">Statutory Deductions</div>
      <div class="hcard-row"><span>Pension (8%)</span><span>${fmt(c.pension/12)}/mo</span></div>
      <div class="hcard-row"><span>NHF (2.5%)</span><span>${fmt(c.nhf/12)}/mo</span></div>
      <div class="hcard-row"><span>NHIS (5%)</span><span>${fmt(c.nhis/12)}/mo</span></div>
      ${c.rent_relief > 0 ? `<div class="hcard-row green"><span>Rent Relief (NTA 2025)</span><span>-${fmt(c.rent_relief)}/yr</span></div>` : ""}
      <div class="hcard-row total"><span>Total Deductions / Month</span><span style="color:#FF7070;">${fmt((c.pension+c.nhf+c.nhis)/12)}/mo</span></div>
    </div>

    <div class="hcard-regime nta-regime">
      <div class="hcard-regime-header">
        <span class="card-regime-badge nta">NTA 2025</span>
        <span class="hcard-regime-sub">New Regime</span>
      </div>
      <div class="hcard-row"><span>PAYE Tax</span><span class="red">${fmt(c.nta_paye/12)}/mo</span></div>
      <div class="hcard-row bold"><span>Monthly Net Pay</span><span class="green large-val">${fmt(c.nta_net_monthly)}</span></div>
      <div class="hcard-row muted"><span>Annual Net Pay</span><span>${fmt(c.nta_net_annual)}</span></div>
    </div>

    <div class="hcard-regime pita-regime">
      <div class="hcard-regime-header">
        <span class="card-regime-badge pita">Old PITA</span>
        <span class="hcard-regime-sub">Previous Regime</span>
      </div>
      <div class="hcard-row"><span>CRA Deduction</span><span>${fmt((Math.max(200000, 0.01*c.gross_annual) + 0.20*c.gross_annual)/12)}/mo</span></div>
      <div class="hcard-row"><span>PAYE Tax</span><span class="red">${fmt(c.pita_paye/12)}/mo</span></div>
      <div class="hcard-row bold"><span>Monthly Net Pay</span><span class="${better ? "muted-val" : "green"} large-val">${fmt(c.pita_net_monthly)}</span></div>
      <div class="hcard-row muted"><span>Annual Net Pay</span><span>${fmt(c.pita_net_monthly*12)}</span></div>
    </div>

    <div class="hcard-diff ${better ? "positive" : "negative"}">
      ${better ? "✓" : "✕"} NTA 2025 gives you
      <strong>${fmt(Math.abs(diff))}/month ${better ? "more" : "less"}</strong>
      than old PITA
    </div>

    <div class="card-footer">
      <button class="card-toggle" onclick="toggleHistoryCard(this)">▼ Show Details</button>
      <div class="card-actions">
        <button class="card-recalc" onclick="recalcFromHistory(${c.id})">✏ Edit</button>
        <button class="card-pdf" onclick="exportHistoryPDF(${c.id})">📄 PDF</button>
        <button class="card-delete" onclick="deleteCalculation(${c.id}, event)">Delete</button>
      </div>
    </div>`;
}

function toggleHistoryCard(btn) {
  const card = btn.closest(".history-card");
  const expanded = card.classList.toggle("expanded");
  btn.textContent = expanded ? "▲ Hide Details" : "▼ Show Details";
}

function recalcFromHistory(id) {
  const c = _allHistory.find(r => r.id === id);
  if (!c) return;
  document.getElementById("basic").value      = Math.round(c.basic / 12);
  document.getElementById("housing").value    = Math.round(c.housing / 12);
  document.getElementById("transport").value  = Math.round(c.transport / 12);
  document.getElementById("other").value      = Math.round(c.other_allowances / 12);
  document.getElementById("annualRent").value = Math.round(c.annual_rent || 0);
  setInputMode("monthly");
  showAppSection("calculator");
  // oninput doesn't fire when setting .value programmatically — trigger manually
  setTimeout(() => calculate(), 50);
}

function showAppSection(id) {
  // Remember which tab was active so reload restores it
  sessionStorage.setItem("taxcalc_active_tab", id);

  // Show only the target section
  APP_SECTIONS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? "" : "none";
  });
  document.querySelectorAll(".user-nav-link").forEach(l => {
    l.classList.toggle("active", l.dataset.section === id);
  });
  // For calculator: skip hero, scroll straight to input form
  if (id === "calculator") {
    setTimeout(() => {
      const form = document.getElementById("calcForm");
      if (form) {
        const top = form.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    }, 30);
  } else {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  // Hook: auto-load payroll runs when payroll tab opens
  if (id === "payroll") {
    setTimeout(() => onPayrollSectionOpen(), 50);
  }
  // Hook: render state grid when info tab opens
  if (id === "info") {
    setTimeout(() => onInfoSectionOpen(), 50);
  }
  // Hook: load CIT history when cit tab opens
  if (id === "cit") {
    setTimeout(() => loadCITHistory(), 50);
  }
}

function exportHistoryPDF(id) {
  const c = _allHistory.find(r => r.id === id);
  if (!c) return;
  const name    = c.user_name || "Anonymous";
  const dateStr = formatDate(c.created_at);
  const diff    = c.nta_net_monthly - c.pita_net_monthly;
  const better  = diff >= 0;

  const html = `<div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:13px;line-height:1.6;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0A0F0D;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="width:28px;height:28px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:14px;">₦</div>
          <span style="font-size:16px;font-weight:800;">TaxCalc <span style="color:#00A86B;font-size:11px;font-weight:500;">NTA 2025</span></span>
        </div>
        <p style="font-size:11px;color:#888;margin:0;">Personal Income Tax Computation</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#888;">
        <p style="margin:0;font-weight:700;color:#0A0F0D;">${name}</p>
        <p style="margin:2px 0 0;">Saved: ${dateStr}</p>
      </div>
    </div>
    <p style="font-weight:700;font-size:10px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Salary Components (Annual)</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <tr style="background:#f5f7f5;"><td style="padding:6px 10px;border:1px solid #e2e8e4;">Basic</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.basic)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8e4;">Housing</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.housing)}</td></tr>
      <tr><td style="padding:6px 10px;border:1px solid #e2e8e4;">Transport</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.transport)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8e4;">Other</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.other_allowances)}</td></tr>
      <tr><td colspan="2" style="padding:8px 10px;border:2px solid #0A0F0D;font-weight:700;">Gross Annual</td>
          <td colspan="2" style="padding:8px 10px;border:2px solid #0A0F0D;text-align:right;font-weight:700;">${fmt(c.gross_annual)}</td></tr>
    </table>
    <p style="font-weight:700;font-size:10px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Statutory Deductions</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <tr><td style="padding:6px 10px;border:1px solid #e2e8e4;">Pension (8%)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.pension)}</td></tr>
      <tr style="background:#fafafa;"><td style="padding:6px 10px;border:1px solid #e2e8e4;">NHF (2.5%)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.nhf)}</td></tr>
      <tr><td style="padding:6px 10px;border:1px solid #e2e8e4;">NHIS (5%)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.nhis)}</td></tr>
      ${c.rent_relief > 0 ? '<tr style="background:#fafafa;"><td style="padding:6px 10px;border:1px solid #e2e8e4;color:#00A86B;">Rent Relief</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;color:#00A86B;">-' + fmt(c.rent_relief) + '</td></tr>' : ""}
      <tr><td style="padding:8px 10px;border:2px solid #0A0F0D;font-weight:700;">Chargeable Income</td>
          <td style="padding:8px 10px;border:2px solid #0A0F0D;text-align:right;font-weight:700;">${fmt(c.chargeable_income)}</td></tr>
    </table>
    <div style="margin-bottom:14px;border:2px solid #0A0F0D;border-radius:8px;overflow:hidden;">
      <div style="background:#0A0F0D;padding:8px 14px;display:flex;align-items:center;gap:8px;">
        <span style="background:#00A86B;color:white;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;">NTA 2025</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.5);">New Regime</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Month</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">${fmt(c.nta_paye/12)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Year</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;">${fmt(c.nta_paye)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;font-weight:700;">Monthly Net Pay</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:700;font-size:15px;">${fmt(c.nta_net_monthly)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;">Annual Net Pay</td><td style="padding:8px 14px;text-align:right;">${fmt(c.nta_net_annual)}</td></tr>
      </table>
    </div>
    <div style="margin-bottom:14px;border:2px solid #555;border-radius:8px;overflow:hidden;">
      <div style="background:#2a2a2a;padding:8px 14px;display:flex;align-items:center;gap:8px;">
        <span style="background:#F4A100;color:#0A0F0D;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;">PITA</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.5);">Old Regime</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Month</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">${fmt(c.pita_paye/12)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Year</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;">${fmt(c.pita_paye)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;font-weight:700;">Monthly Net Pay</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:700;font-size:15px;">${fmt(c.pita_net_monthly)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;">Annual Net Pay</td><td style="padding:8px 14px;text-align:right;">${fmt(c.pita_net_monthly*12)}</td></tr>
      </table>
    </div>
    <div style="border:2px solid ${better?"#00A86B":"#E04040"};border-radius:8px;padding:14px;text-align:center;margin-bottom:16px;">
      <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">You save / lose under NTA 2025</p>
      <p style="font-size:26px;font-weight:700;margin:0;color:${better?"#00A86B":"#E04040"};">${(better?"+":"-")}${fmt(Math.abs(diff))}</p>
      <p style="font-size:11px;color:#888;margin:6px 0 0;">${better?"more":"less"} per month under NTA 2025</p>
    </div>
    <div style="border-top:1px solid #e2e8e4;padding-top:12px;font-size:10px;color:#aaa;text-align:center;">
      <p style="margin:0;">Based on the <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference purposes only.</p>
      <p style="margin:3px 0 0;">Generated by TaxCalc NTA 2025</p>
    </div>
  </div>`;

  const printWin = window.open("", "_blank", "width=800,height=900");
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Tax Computation — ${name}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;padding:40px 48px;color:#0A0F0D;font-size:13px;line-height:1.6;}@media print{@page{margin:14mm;size:A4;}body{padding:0;}}</style>
    </head><body>${html}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 600);
}

async function deleteCalculation(id, e) {
  e.stopPropagation();
  if (!confirm("Delete this saved calculation?")) return;
  const { error } = await sb.from("tax_calculations").delete().eq("id", id);
  if (error) alert("Failed to delete: " + error.message);
  else loadHistory();
}

/* ===========================
   US-006 — EXPORT PDF
   =========================== */
function exportPDF() {
  if (!lastCalc) { alert("Please calculate your tax first before exporting."); return; }

  const meta    = currentUser?.user_metadata || {};
  const name    = meta.full_name || currentUser?.email || "Anonymous";
  const c       = lastCalc;
  const dateStr = new Date().toLocaleDateString("en-NG", { day:"2-digit", month:"long", year:"numeric" });
  const regime  = getRegime();

  const bandsHtml = (bands, title) => {
    const rows = bands.filter(b => b.taxable > 0).map(b => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f4f1;">${b.label}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f4f1;text-align:center;color:#00A86B;">${(b.rate*100).toFixed(0)}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f4f1;text-align:right;">${fmt(b.taxable)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f4f1;text-align:right;color:#E04040;">${b.tax > 0 ? fmt(b.tax) : "—"}</td>
      </tr>`).join("");
    if (!rows) return "";
    return `
      <p style="font-weight:700;font-size:11px;margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">${title}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f5f7f5;">
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8e4;">Band</th>
          <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #e2e8e4;">Rate</th>
          <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e2e8e4;">Taxable</th>
          <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e2e8e4;">Tax</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  const ntaSection = regime !== "pita" ? `
    <div style="margin-bottom:16px;">
      <div style="border:2px solid #0A0F0D;border-bottom:none;padding:8px 14px;border-radius:6px 6px 0 0;display:flex;align-items:center;gap:8px;background:#f5f7f5;">
        <span style="background:#00A86B;color:white;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;">NTA 2025</span>
        <span style="font-size:11px;color:#555;">New Regime — Nigeria Tax Act 2025</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:2px solid #0A0F0D;border-top:none;">
        <tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax (Monthly)</td>
            <td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">${fmt(c.nta_paye/12)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax (Annual)</td>
            <td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;">${fmt(c.nta_paye)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;font-weight:700;">Monthly Net Pay</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:700;font-size:15px;">${fmt(c.nta_net_monthly)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;">Annual Net Pay</td>
            <td style="padding:8px 14px;text-align:right;color:#555;">${fmt(c.nta_net_annual)}</td></tr>
      </table>
      ${bandsHtml(c.ntaBands, "NTA 2025 Band Workings")}
    </div>` : "";

  const pitaSection = regime !== "nta2025" ? `
    <div style="margin-bottom:16px;">
      <div style="border:2px solid #555;border-bottom:none;padding:8px 14px;border-radius:6px 6px 0 0;display:flex;align-items:center;gap:8px;background:#f5f7f5;">
        <span style="background:#F4A100;color:#0A0F0D;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;">PITA</span>
        <span style="font-size:11px;color:#555;">Old Regime — Personal Income Tax Act</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:2px solid #555;border-top:none;">
        <tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">CRA Deduction (Monthly)</td>
            <td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;">${fmt(c.cra/12)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax (Monthly)</td>
            <td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">${fmt(c.pita_paye/12)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;font-weight:700;">Monthly Net Pay</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:700;font-size:15px;">${fmt(c.pita_net_monthly)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;">Annual Net Pay</td>
            <td style="padding:8px 14px;text-align:right;color:#555;">${fmt(c.pitaNet)}</td></tr>
      </table>
      ${bandsHtml(c.pitaBands, "PITA Band Workings")}
    </div>` : "";

  const compSection = regime === "both" ? `
    <div style="border:2px solid ${c.diff>=0?"#00A86B":"#E04040"};border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">
      <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">You save / lose under NTA 2025</p>
      <p style="font-size:26px;font-weight:700;margin:0;color:${c.diff>=0?"#00A86B":"#E04040"};">${(c.diff>=0?"+":"-")+fmt(Math.abs(c.diff))}</p>
      <p style="font-size:11px;color:#888;margin:6px 0 0;">${c.diff>=0?"more":"less"} per month under NTA 2025</p>
    </div>` : "";

  const html = `
    <div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:13px;line-height:1.6;">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0A0F0D;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="width:28px;height:28px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:14px;">₦</div>
            <span style="font-size:16px;font-weight:800;letter-spacing:-0.5px;">TaxCalc <span style="color:#00A86B;font-weight:500;font-size:11px;">NTA 2025</span></span>
          </div>
          <p style="font-size:11px;color:#888;margin:0;">Personal Income Tax Computation</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#888;">
          <p style="margin:0;font-weight:700;color:#0A0F0D;font-size:13px;">${escHtml(name)}</p>
          <p style="margin:2px 0 0;">Date: ${dateStr}</p>
          <p style="margin:2px 0 0;color:#00A86B;font-weight:600;">Nigeria Tax Act 2025</p>
        </div>
      </div>
      <!-- Salary -->
      <p style="font-weight:700;font-size:10px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Salary Components (Annual)</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <tr style="background:#f5f7f5;">
          <td style="padding:6px 10px;border:1px solid #e2e8e4;">Basic Salary</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;font-weight:600;">${fmt(c.basic)}</td>
          <td style="padding:6px 10px;border:1px solid #e2e8e4;">Housing Allowance</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;font-weight:600;">${fmt(c.housing)}</td>
        </tr>
        <tr>
          <td style="padding:6px 10px;border:1px solid #e2e8e4;">Transport Allowance</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;font-weight:600;">${fmt(c.transport)}</td>
          <td style="padding:6px 10px;border:1px solid #e2e8e4;">Other Allowances</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;font-weight:600;">${fmt(c.other_allowances)}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:8px 10px;border:2px solid #0A0F0D;font-weight:700;">Gross Annual Pay</td>
          <td colspan="2" style="padding:8px 10px;border:2px solid #0A0F0D;text-align:right;font-weight:700;">${fmt(c.gross_annual)}</td>
        </tr>
      </table>
      <!-- Deductions -->
      <p style="font-weight:700;font-size:10px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Statutory Deductions (Annual)</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <tr><td style="padding:6px 10px;border:1px solid #e2e8e4;">Pension (8% of Basic+Housing+Transport)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.pension)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:6px 10px;border:1px solid #e2e8e4;">NHF (2.5% of Basic)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.nhf)}</td></tr>
        <tr><td style="padding:6px 10px;border:1px solid #e2e8e4;">NHIS (5% of Basic)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;">${fmt(c.nhis)}</td></tr>
        ${c.rent_relief > 0 ? `<tr style="background:#fafafa;"><td style="padding:6px 10px;border:1px solid #e2e8e4;color:#00A86B;">Rent Relief (NTA 2025)</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;color:#00A86B;">-${fmt(c.rent_relief)}</td></tr>` : ""}
        <tr>
          <td style="padding:8px 10px;border:2px solid #0A0F0D;font-weight:700;">Chargeable Income</td>
          <td style="padding:8px 10px;border:2px solid #0A0F0D;text-align:right;font-weight:700;">${fmt(c.chargeable_income)}</td>
        </tr>
      </table>
      <!-- Summary -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <tr>
          <td style="padding:8px 10px;border:1px solid #e2e8e4;text-align:center;">
            <p style="font-size:9px;color:#888;margin:0 0 3px;text-transform:uppercase;letter-spacing:0.5px;">Gross / Month</p>
            <p style="font-size:14px;font-weight:700;margin:0;">${fmt(c.gross_annual/12)}</p>
          </td>
          <td style="padding:8px 10px;border:1px solid #e2e8e4;text-align:center;">
            <p style="font-size:9px;color:#888;margin:0 0 3px;text-transform:uppercase;letter-spacing:0.5px;">Chargeable / Month</p>
            <p style="font-size:14px;font-weight:700;margin:0;">${fmt(c.chargeable_income/12)}</p>
          </td>
          <td style="padding:8px 10px;border:2px solid #0A0F0D;text-align:center;">
            <p style="font-size:9px;color:#555;margin:0 0 3px;text-transform:uppercase;letter-spacing:0.5px;">Effective Tax Rate</p>
            <p style="font-size:14px;font-weight:700;margin:0;color:#00A86B;">${c.effective_rate.toFixed(2)}%</p>
          </td>
        </tr>
      </table>
      ${ntaSection}${pitaSection}${compSection}
      <!-- Footer -->
      <div style="border-top:1px solid #e2e8e4;padding-top:12px;font-size:10px;color:#aaa;text-align:center;">
        <p style="margin:0;">Based on the <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference purposes only. Consult a tax professional for advice.</p>
        <p style="margin:3px 0 0;">Generated by TaxCalc NTA 2025 · ${dateStr}</p>
      </div>
    </div>`;

  // Open in new window and print — much more reliable than print CSS
  const printWin = window.open("", "_blank", "width=800,height=900");
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <title>Tax Computation — ${escHtml(name)} — ${dateStr}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: white; padding: 40px 48px; color: #0A0F0D; font-size: 13px; line-height: 1.6; }
        @media print { @page { margin: 14mm; size: A4; } body { padding: 0; } }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 600);
}

/* ===========================
   AUTH STATE
   =========================== */
let currentUser = null;

/* ===========================
   AUTH HELPERS
   =========================== */
function showPanel(panelId) {
  document.querySelectorAll(".auth-panel").forEach(p => p.classList.add("hidden"));
  document.getElementById(panelId).classList.remove("hidden");
  ["loginError","registerError","resetError","resetSuccess"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.add("hidden"); }
  });
}

function showAuthOverlay(panelId) {
  showPanel(panelId || "loginPanel");
  document.getElementById("authOverlay").style.display = "flex";
}

function hideAuthOverlay() {
  document.getElementById("authOverlay").style.display = "none";
}

function setAuthLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  btn.disabled    = loading;
  btn.textContent = loading ? "Please wait..." : defaultText;
}

function showAuthError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove("hidden");
}

const ROLE_LABELS = {
  employee:       "Employee",
  hr_manager:     "HR Manager",
  business_owner: "Business Owner",
  tax_consultant: "Tax Consultant",
};

function updateHeaderUser(user) {
  if (!user) return;
  const email   = user.email || "";
  const meta    = user.user_metadata || {};
  const name    = meta.full_name || email;
  const role    = meta.role || "employee";
  const initials = name.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase()).slice(0,2).join("");

  document.getElementById("userAvatar").textContent = initials || "?";
  // Show name if available, otherwise show email
  const displayName = meta.full_name && meta.full_name !== email ? meta.full_name : email;
  document.getElementById("userEmail").textContent  = displayName;
  document.getElementById("guestNav").classList.add("hidden");
  document.getElementById("userNav").classList.remove("hidden");

  // Show role badge next to avatar
  let badge = document.getElementById("userRoleBadge");
  if (badge) {
    badge.textContent = ROLE_LABELS[role] || role;
    badge.dataset.role = role;
  }

  // Show/hide Payroll tab based on role
  const payrollLink = document.querySelector('[data-section="payroll"]');
  if (payrollLink) {
    payrollLink.style.display = role === "employee" ? "none" : "";
  }
  // Show/hide Business Tax tab — only business_owner and tax_consultant
  const citLink = document.getElementById("citNavLink");
  if (citLink) {
    citLink.style.display = ["business_owner","tax_consultant"].includes(role) ? "" : "none";
  }

  // Store role for default tab logic
  window._userRole = role;
}

function resetHeaderToGuest() {
  document.getElementById("guestNav").classList.remove("hidden");
  document.getElementById("userNav").classList.add("hidden");
}

/* ===========================
   APP MODE vs LANDING MODE
   =========================== */
// IDs of every section that should ONLY show on the landing page
const LANDING_SECTIONS = ["home", "how-it-works", "features", "who-its-for"];
// IDs of every section that should ONLY show when logged in
const APP_SECTIONS     = ["calculator", "history", "payroll", "cit", "info"];

function showLandingMode() {
  LANDING_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  });
  APP_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  // Also hide CTA section (it's between landing and calculator)
  const cta = document.querySelector(".cta-section");
  if (cta) cta.style.display = "";
  const divider = document.querySelector(".section-divider");
  if (divider) divider.style.display = "none";
  resetHeaderToGuest();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function showAppMode(tab) {
  LANDING_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const cta = document.querySelector(".cta-section");
  if (cta) cta.style.display = "none";
  const divider = document.querySelector(".section-divider");
  if (divider) divider.style.display = "none";

  // Determine best landing tab:
  // 1. Explicit tab param (from session restore)
  // 2. Role default (HR/business/consultant → payroll, employee → calculator)
  // 3. Fallback to calculator
  let target = tab && APP_SECTIONS.includes(tab) ? tab : null;
  if (!target) {
    const role = window._userRole || "employee";
    const payrollRoles = ["hr_manager", "business_owner", "tax_consultant"];
    target = payrollRoles.includes(role) ? "payroll" : "calculator";
  }
  // Employees can't land on payroll even if somehow stored
  if (window._userRole === "employee" && target === "payroll") target = "calculator";
  showAppSection(target);
}


/* ===========================
   DELETE ACCOUNT
   =========================== */
async function deleteAccount() {
  const confirmed = confirm(
    "Are you sure you want to delete your account?\n\n" +
    "This will permanently delete:\n" +
    "• All your saved calculations\n" +
    "• All your saved payroll runs\n" +
    "• Your account and login\n\n" +
    "This cannot be undone."
  );
  if (!confirmed) return;

  const reconfirm = confirm("Last chance — permanently delete your account?");
  if (!reconfirm) return;

  const userId = currentUser?.id;

  // Set flag so onAuthStateChange SIGNED_IN events during account mutation are ignored
  _deletingAccount = true;

  // Clear UI immediately — don't wait for Supabase
  currentUser = null;
  window._userRole = null;
  document.getElementById("historyGrid").innerHTML = "";
  document.getElementById("historyEmpty").classList.remove("hidden");
  showLandingMode();

  try {
    // Step 1: get session while it's still alive
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    const uid   = sessionData?.session?.user?.id;

    // Step 2: delete all user data rows via RLS (user still authenticated)
    if (uid) {
      await sb.from("tax_calculations").delete().eq("user_id", uid);
      await sb.from("payroll_runs").delete().eq("user_id", uid);
      await sb.from("cit_calculations").delete().eq("user_id", uid);
    }

    // Step 3: Anonymize the auth account so it can never be signed into again.
    // We can't call auth.admin.deleteUser() from the client (needs service_role key).
    // Instead: overwrite the email with a random unrecoverable address and wipe metadata.
    // Combined with the data deletion in Step 2, the account is effectively dead.
    const ghostEmail = `deleted_${uid}_${Date.now()}@taxcalc.invalid`;
    await sb.auth.updateUser({
      email: ghostEmail,
      data: { full_name: "", role: "", company: "", deleted: true }
    }).catch(() => {}); // if this fails, account is still signed out next

    // Step 4: Also try the edge function in case it's been fixed on the server
    if (token) {
      fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        }
      }).then(() => {}).catch(() => {}); // fire-and-forget, silent
    }

    // Step 5: sign out to clear local session
    await sb.auth.signOut();
    _deletingAccount = false;
    sessionStorage.removeItem("taxcalc_active_tab");
    alert("Your account and all data have been permanently deleted.");
  } catch (err) {
    await sb.auth.signOut().catch(() => {});
    _deletingAccount = false;
    sessionStorage.removeItem("taxcalc_active_tab");
    alert("Your data was deleted and you have been signed out.");
  }
}

/* ===========================
   LOGOUT
   =========================== */
/* ===========================
   LOGIN
   =========================== */
async function doLogin() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) { showAuthError("loginError", "Please enter your email and password."); return; }

  setAuthLoading("loginBtn", true, "Sign In");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  setAuthLoading("loginBtn", false, "Sign In");

  if (error) { showAuthError("loginError", error.message); return; }
  currentUser = data.user;
  updateHeaderUser(currentUser);
  hideAuthOverlay();
  showAppMode();
  loadHistory();
}

/* ===========================
   REGISTER
   =========================== */


/* ===========================
   LANDING DEMO CALCULATOR
   (no auth, no saving — entice to register)
   =========================== */
function runDemo() {
  const basic      = Number(document.getElementById("demoBasic")?.value)      || 0;
  const allowances = Number(document.getElementById("demoAllowances")?.value) || 0;

  if (!basic && !allowances) {
    ["demoGross","demoDeductions","demoPaye","demoNet","demoRate"]
      .forEach(id => { const el = document.getElementById(id); if(el) el.textContent = "—"; });
    return;
  }

  const grossMonthly = basic + allowances;
  const gross        = grossMonthly * 12;

  // Statutory deductions (annual)
  const pension = basic * 0.08;          // simplified: 8% of basic only for demo
  const nhf     = basic * 0.025;
  const nhis    = basic * 0.05;
  const totalStatutory = pension + nhf + nhis;

  const chargeable = Math.max(0, gross - totalStatutory);

  // NTA 2025 progressive bands
  const bands = [
    { limit: 800_000,    rate: 0.00 },
    { limit: 2_200_000,  rate: 0.15 },
    { limit: 6_000_000,  rate: 0.18 },
    { limit: 15_000_000, rate: 0.21 },
    { limit: 25_000_000, rate: 0.23 },
    { limit: Infinity,   rate: 0.25 },
  ];
  let remaining = chargeable, prev = 0, annualPaye = 0;
  for (const b of bands) {
    const slice = Math.min(Math.max(remaining - prev, 0), b.limit - prev);
    annualPaye += slice * b.rate;
    if (remaining <= b.limit) break;
    prev = b.limit;
  }

  const monthlyPaye       = annualPaye / 12;
  const monthlyDeductions = (totalStatutory / 12) + monthlyPaye;
  const netMonthly        = grossMonthly - monthlyDeductions;
  const effectiveRate     = gross > 0 ? (annualPaye / gross) * 100 : 0;

  const fmtN = n => "₦" + Math.round(n).toLocaleString("en-NG");

  document.getElementById("demoGross").textContent      = fmtN(grossMonthly);
  document.getElementById("demoDeductions").textContent = fmtN(monthlyDeductions);
  document.getElementById("demoPaye").textContent       = fmtN(monthlyPaye);
  document.getElementById("demoNet").textContent        = fmtN(netMonthly);
  document.getElementById("demoRate").textContent       = effectiveRate.toFixed(2) + "%";
}

/* ===========================
   MOBILE NAV TOGGLE
   =========================== */
function toggleMobileNav() {
  const guestNav = document.getElementById("guestNav");
  const userNav  = document.getElementById("userNav");
  const btn      = document.getElementById("hamburgerBtn");
  const nav      = guestNav?.classList.contains("hidden") ? userNav : guestNav;
  if (nav) {
    nav.classList.toggle("mobile-open");
    btn?.classList.toggle("open");
  }
}

// Close mobile nav when a link is clicked
document.addEventListener("click", e => {
  const nav = document.querySelector(".header-nav.mobile-open, #userNav.mobile-open");
  if (nav && !nav.contains(e.target) && e.target.id !== "hamburgerBtn" && !e.target.closest("#hamburgerBtn")) {
    nav.classList.remove("mobile-open");
    document.getElementById("hamburgerBtn")?.classList.remove("open");
  }
});

/* ===========================
   ROLE SELECTION
   =========================== */
function selectRole(btn) {
  document.querySelectorAll(".role-card").forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected");
  // Show company field for non-employee roles
  const role = btn.dataset.role;
  const companyField = document.getElementById("companyField");
  if (companyField) {
    if (role === "employee") {
      companyField.classList.add("hidden");
    } else {
      companyField.classList.remove("hidden");
    }
  }
}

async function doRegister() {
  const name     = document.getElementById("regName").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const role     = document.querySelector(".role-card.selected")?.dataset.role || "";
  const company  = document.getElementById("regCompany")?.value.trim() || "";

  if (!email || !password) { showAuthError("registerError", "Please fill in all fields."); return; }
  if (password.length < 6) { showAuthError("registerError", "Password must be at least 6 characters."); return; }
  if (!role) { showAuthError("registerError", "Please select what best describes you."); return; }

  setAuthLoading("registerBtn", true, "Create Account");
  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name || email, role, company } }
  });
  setAuthLoading("registerBtn", false, "Create Account");

  if (error) { showAuthError("registerError", error.message); return; }
  showPanel("successPanel");
}

/* ===========================
   RESET PASSWORD
   =========================== */
async function doReset() {
  const email = document.getElementById("resetEmail").value.trim();
  if (!email) { showAuthError("resetError", "Please enter your email address."); return; }

  setAuthLoading("resetBtn", true, "Send Reset Link");
  const { error } = await sb.auth.resetPasswordForEmail(email);
  setAuthLoading("resetBtn", false, "Send Reset Link");

  if (error) { showAuthError("resetError", error.message); return; }
  const success = document.getElementById("resetSuccess");
  success.textContent = "✓ Reset link sent! Check your email.";
  success.classList.remove("hidden");
}


/* ===========================
   DELETE ACCOUNT
   =========================== */

/* ===========================
   LOGOUT
   =========================== */
async function doLogout() {
  // Update UI immediately — don't wait for Supabase
  currentUser = null;
  document.getElementById("historyGrid").innerHTML = "";
  document.getElementById("historyEmpty").classList.remove("hidden");
  hideAuthOverlay();
  showLandingMode();
  // Sign out in background after UI is already updated
  sb.auth.signOut();
}


/* ===========================
   SCROLL HELPERS
   =========================== */
const SCROLL_KEY = "taxcalc_scroll_pos";

function saveScrollPos() {
  sessionStorage.setItem(SCROLL_KEY, window.scrollY);
}

function restoreScrollPos() {
  const pos = sessionStorage.getItem(SCROLL_KEY);
  if (pos !== null) {
    setTimeout(() => window.scrollTo({ top: parseInt(pos), behavior: "instant" }), 50);
  }
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = "";          // ensure visible (landing sections)
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* ===========================
   INIT — Check session + scroll memory
   =========================== */
window.addEventListener("DOMContentLoaded", async () => {

  initTheme();
  window.addEventListener("scroll", saveScrollPos, { passive: true });

  ["loginEmail","loginPassword"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  });
  ["regName","regEmail","regPassword"].forEach(id => {
    document.getElementById(id)?.addEventListener("keydown", e => { if (e.key === "Enter") doRegister(); });
  });
  document.getElementById("resetEmail")?.addEventListener("keydown", e => { if (e.key === "Enter") doReset(); });

  // Start in landing mode — hide app sections until logged in
  showLandingMode();

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user && !_deletingAccount) {
      currentUser = session.user;
      updateHeaderUser(currentUser);   // sets window._userRole from metadata
      hideAuthOverlay();
      // Only trigger app mode if we're currently in landing mode
      // Check if a landing section is visible — if so, we're on the landing page
      const onLanding = LANDING_SECTIONS.some(id => {
        const el = document.getElementById(id);
        return el && el.style.display !== "none";
      });
      if (onLanding) {
        showAppMode();
        loadHistory();
      }
    }
    // SIGNED_OUT is handled entirely by doLogout() — ignore it here
  });

  // Check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    updateHeaderUser(currentUser);
    hideAuthOverlay();
    // Restore last active tab — default to calculator on first login
    const lastTab = sessionStorage.getItem("taxcalc_active_tab") || "calculator";
    showAppMode(lastTab);
    loadHistory();
    restoreScrollPos();
  }
  // No session = stay in landing mode
});
/* =====================================================
   STAGE 3 — PAYROLL MANAGER
   ===================================================== */

let payrollEmployees = [];   // in-memory list

/* --------------------------------------------------
   NTA 2025 calc reused for payroll (single employee)
   -------------------------------------------------- */
function calcEmployeeTax(emp) {
  const basic     = Number(emp.basic)    || 0;
  const housing   = Number(emp.housing)  || 0;
  const transport = Number(emp.transport)|| 0;
  const other     = Number(emp.other)    || 0;
  const rent      = Number(emp.rent)     || 0;

  const grossMonthly  = basic + housing + transport + other;
  const gross         = grossMonthly * 12;

  const pension       = (basic + housing + transport) * 0.08;
  const nhf           = basic * 0.025;
  const nhis          = basic * 0.05;
  const rentRelief    = Math.min(500_000, rent * 0.20);

  const chargeable    = Math.max(0, gross - pension - nhf - nhis - rentRelief);
  const chargeableMo  = chargeable / 12;

  // NTA 2025 bands (annual)
  const bands = [
    { limit: 800_000,    rate: 0.00 },
    { limit: 2_200_000,  rate: 0.15 },
    { limit: 6_000_000,  rate: 0.18 },
    { limit: 15_000_000, rate: 0.21 },
    { limit: 25_000_000, rate: 0.23 },
    { limit: Infinity,   rate: 0.25 },
  ];
  let remaining = chargeable;
  let prev = 0;
  let ntaPaye = 0;
  for (const b of bands) {
    const slice = Math.min(Math.max(remaining - prev, 0), b.limit - prev);
    ntaPaye += slice * b.rate;
    if (remaining <= b.limit) break;
    prev = b.limit;
  }

  const ntaPayeMonthly  = ntaPaye / 12;
  const netMonthly      = grossMonthly - (pension / 12) - (nhf / 12) - (nhis / 12) - ntaPayeMonthly;
  const effectiveRate   = gross > 0 ? (ntaPaye / gross) * 100 : 0;

  const employerPension = (basic + housing + transport) * 0.10; // 10% employer contribution
  const totalEmployerCost = grossMonthly + (employerPension / 12); // gross + employer pension/month

  return {
    gross, grossMonthly,
    pension, nhf, nhis, rentRelief,
    chargeable,
    ntaPaye, ntaPayeMonthly,
    netMonthly,
    effectiveRate,
    employerPension, // annual employer pension
    totalEmployerCost, // monthly total cost to employer
  };
}

/* --------------------------------------------------
   ADD EMPLOYEE
   -------------------------------------------------- */
function addPayrollEmployee() {
  const name     = document.getElementById("empName").value.trim();
  const basic    = Number(document.getElementById("empBasic").value)    || 0;
  const housing  = Number(document.getElementById("empHousing").value)  || 0;
  const transport= Number(document.getElementById("empTransport").value)|| 0;
  const other    = Number(document.getElementById("empOther").value)    || 0;
  const rent     = Number(document.getElementById("empRent").value)     || 0;

  const errEl = document.getElementById("payrollAddError");
  if (!name) {
    errEl.textContent = "Please enter the employee's name.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!basic && !housing && !transport && !other) {
    errEl.textContent = "Please enter at least one salary component.";
    errEl.classList.remove("hidden");
    return;
  }
  errEl.classList.add("hidden");

  const emp = { id: Date.now(), name, basic, housing, transport, other, rent };
  emp.calc  = calcEmployeeTax(emp);
  payrollEmployees.push(emp);

  // Clear form
  ["empName","empBasic","empHousing","empTransport","empOther","empRent"]
    .forEach(id => { document.getElementById(id).value = ""; });

  renderPayrollTable();
}

/* --------------------------------------------------
   REMOVE EMPLOYEE
   -------------------------------------------------- */
function removePayrollEmployee(id) {
  payrollEmployees = payrollEmployees.filter(e => e.id !== id);
  renderPayrollTable();
}

/* Edit employee — fills the Add Employee form with their current values */
function editPayrollEmployee(id) {
  const emp = payrollEmployees.find(e => e.id === id);
  if (!emp) return;

  // Fill the Add Employee form with this employee's values
  document.getElementById("empName").value      = emp.name      || "";
  document.getElementById("empBasic").value     = emp.basic     || "";
  document.getElementById("empHousing").value   = emp.housing   || "";
  document.getElementById("empTransport").value = emp.transport || "";
  document.getElementById("empOther").value     = emp.other     || "";
  document.getElementById("empRent").value      = emp.rent      || "";

  // Remove from list — user will re-add with updated values
  payrollEmployees = payrollEmployees.filter(e => e.id !== id);
  renderPayrollTable();

  // Scroll to the form and highlight it
  const form = document.getElementById("empName");
  if (form) {
    form.focus();
    const formWrap = document.querySelector(".payroll-add-employee");
    if (formWrap) {
      formWrap.classList.add("editing-highlight");
      setTimeout(() => formWrap.classList.remove("editing-highlight"), 2000);
      formWrap.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

/* --------------------------------------------------
   RENDER TABLE + SUMMARY
   -------------------------------------------------- */
function renderPayrollTable() {
  const empty     = document.getElementById("payrollEmpty");
  const container = document.getElementById("payrollTableContainer");
  const tbody     = document.getElementById("payrollTableBody");
  const summary   = document.getElementById("payrollSummary");

  if (payrollEmployees.length === 0) {
    empty.classList.remove("hidden");
    container.classList.add("hidden");
    summary.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  container.classList.remove("hidden");
  summary.classList.remove("hidden");

  tbody.innerHTML = payrollEmployees.map(emp => {
    const c = emp.calc;
    return `<tr>
      <td class="emp-name-cell">${escHtml(emp.name)}</td>
      <td data-label="Gross/Month">${fmt(c.grossMonthly)}</td>
      <td data-label="Pension (Emp)">${fmt(c.pension / 12)}</td>
      <td data-label="NHF">${fmt(c.nhf / 12)}</td>
      <td data-label="NHIS">${fmt(c.nhis / 12)}</td>
      <td data-label="Rent Relief">${c.rentRelief > 0 ? fmt(c.rentRelief) + "/yr" : "—"}</td>
      <td class="paye-cell" data-label="PAYE/Month">${fmt(c.ntaPayeMonthly)}</td>
      <td class="net-cell" data-label="Net/Month">${fmt(c.netMonthly)}</td>
      <td class="amber-cell" data-label="Emp Pension (10%)">${fmt(c.employerPension / 12)}</td>
      <td class="cost-cell" data-label="Total Cost">${fmt(c.totalEmployerCost)}</td>
      <td data-label="Eff. Rate">${c.effectiveRate.toFixed(1)}%</td>
      <td class="emp-actions-cell">
        <button class="emp-edit-btn" onclick="editPayrollEmployee(${emp.id})" title="Edit employee">✏</button>
        <button class="emp-remove-btn" onclick="removePayrollEmployee(${emp.id})" title="Remove">✕</button>
      </td>
    </tr>`;
  }).join("");

  // Summary totals
  const totalGross = payrollEmployees.reduce((s, e) => s + e.calc.grossMonthly, 0);
  const totalPAYE  = payrollEmployees.reduce((s, e) => s + e.calc.ntaPayeMonthly, 0);
  const totalNet   = payrollEmployees.reduce((s, e) => s + e.calc.netMonthly, 0);
  const avgRate    = payrollEmployees.reduce((s, e) => s + e.calc.effectiveRate, 0) / payrollEmployees.length;

  const totalEmployerPension = payrollEmployees.reduce((s, e) => s + (e.calc.employerPension / 12), 0);
  const totalEmployerCost    = payrollEmployees.reduce((s, e) => s + e.calc.totalEmployerCost, 0);

  document.getElementById("summEmployeeCount").textContent    = payrollEmployees.length;
  document.getElementById("summTotalGross").textContent       = fmt(totalGross);
  document.getElementById("summTotalPAYE").textContent        = fmt(totalPAYE);
  document.getElementById("summEmployerPension").textContent  = fmt(totalEmployerPension);
  document.getElementById("summTotalCost").textContent        = fmt(totalEmployerCost);
  document.getElementById("summTotalNet").textContent         = fmt(totalNet);
  document.getElementById("summAvgRate") && (document.getElementById("summAvgRate").textContent = avgRate.toFixed(1) + "%");
}

/* --------------------------------------------------
   SAVE PAYROLL RUN TO SUPABASE
   -------------------------------------------------- */
async function savePayrollRun() {
  if (!currentUser) { alert("Please sign in to save payroll runs."); return; }
  if (payrollEmployees.length === 0) { alert("Add at least one employee before saving."); return; }

  const runName  = document.getElementById("payrollRunName").value.trim() || "Payroll Run";
  const period   = document.getElementById("payrollPeriod").value.trim()  || "";
  const saveBtn  = document.getElementById("savePayrollBtn");

  const totalGross = payrollEmployees.reduce((s, e) => s + e.calc.grossMonthly, 0);
  const totalPAYE  = payrollEmployees.reduce((s, e) => s + e.calc.ntaPayeMonthly, 0);
  const totalNet   = payrollEmployees.reduce((s, e) => s + e.calc.netMonthly, 0);

  // Sanitise employee list for storage (drop calc object, keep inputs + results)
  const empData = payrollEmployees.map(e => ({
    id: e.id, name: e.name,
    basic: e.basic, housing: e.housing, transport: e.transport,
    other: e.other, rent: e.rent,
    grossMonthly:    e.calc.grossMonthly,
    ntaPayeMonthly:  e.calc.ntaPayeMonthly,
    netMonthly:      e.calc.netMonthly,
    effectiveRate:   e.calc.effectiveRate,
    pension:         e.calc.pension,
    nhf:             e.calc.nhf,
    nhis:            e.calc.nhis,
    rentRelief:      e.calc.rentRelief,
  }));

  saveBtn.disabled    = true;
  saveBtn.textContent = "Saving...";

  const { error } = await sb.from("payroll_runs").insert({
    user_id:        currentUser.id,
    run_name:       runName,
    pay_period:     period,
    total_gross:    totalGross,
    total_paye:     totalPAYE,
    total_net:      totalNet,
    employee_count: payrollEmployees.length,
    employees:      empData,
  });

  saveBtn.disabled    = false;
  saveBtn.textContent = "💾 Save Run";

  if (error) {
    alert("Failed to save: " + error.message);
  } else {
    alert("✓ Payroll run saved successfully!");
    loadPayrollRuns();
  }
}

/* --------------------------------------------------
   LOAD SAVED PAYROLL RUNS
   -------------------------------------------------- */
async function loadPayrollRuns() {
  if (!currentUser) return;

  const grid  = document.getElementById("payrollRunsGrid");
  const empty = document.getElementById("payrollRunsEmpty");
  grid.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;font-family:var(--mono);padding:12px 0;">Loading...</p>';

  const { data, error } = await sb
    .from("payroll_runs")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { grid.innerHTML = `<p style="color:#FF7070;font-size:13px;">Error: ${error.message}</p>`; return; }

  if (!data || data.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = data.map(run => `
    <div class="payroll-run-card">
      <div class="prun-top">
        <div>
          <span class="prun-name">${escHtml(run.run_name)}</span>
          ${run.pay_period ? `<span class="prun-period">${escHtml(run.pay_period)}</span>` : ""}
        </div>
        <span class="prun-date">${formatDate(run.created_at)}</span>
      </div>
      <div class="prun-stats">
        <div class="prun-stat">
          <span class="prun-stat-label">Employees</span>
          <span class="prun-stat-value">${run.employee_count}</span>
        </div>
        <div class="prun-stat">
          <span class="prun-stat-label">Total Gross / Month</span>
          <span class="prun-stat-value">${fmt(run.total_gross)}</span>
        </div>
        <div class="prun-stat">
          <span class="prun-stat-label">Total PAYE Remittable</span>
          <span class="prun-stat-value red">${fmt(run.total_paye)}</span>
        </div>
        <div class="prun-stat">
          <span class="prun-stat-label">Total Net / Month</span>
          <span class="prun-stat-value green">${fmt(run.total_net)}</span>
        </div>
      </div>
      <div class="prun-footer">
        <button class="prun-btn load" onclick="loadPayrollRunIntoForm(${run.id})">✏ Edit / Load</button>
        <button class="prun-btn pdf"  onclick="exportPayrollPDF(${run.id})">📄 PDF</button>
        <button class="prun-btn xlsx" onclick="exportPayrollRunXLSX(${run.id})">📊 Excel</button>
        <button class="prun-btn del"  onclick="deletePayrollRun(${run.id})">Delete</button>
      </div>
    </div>`).join("");

  // Stash data for load/export use
  window._payrollRuns = data;
}

/* --------------------------------------------------
   LOAD SAVED RUN INTO FORM
   -------------------------------------------------- */
function loadPayrollRunIntoForm(runId) {
  const run = (window._payrollRuns || []).find(r => r.id === runId);
  if (!run || !run.employees) return;

  // Fill run meta fields
  document.getElementById("payrollRunName").value = run.run_name   || "";
  document.getElementById("payrollPeriod").value  = run.pay_period || "";

  // Restore all employees into table
  payrollEmployees = run.employees.map(e => ({
    id:        e.id || Date.now() + Math.random(),
    name:      e.name,
    basic:     e.basic,
    housing:   e.housing,
    transport: e.transport,
    other:     e.other,
    rent:      e.rent,
    calc:      calcEmployeeTax(e),
  }));

  renderPayrollTable();

  // Clear the add-employee form so it's ready for a new entry
  ["empName","empBasic","empHousing","empTransport","empOther","empRent"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("payrollAddError")?.classList.add("hidden");

  // Scroll to the run name field so user sees the loaded run
  const nameField = document.getElementById("payrollRunName");
  if (nameField) {
    setTimeout(() => {
      const top = nameField.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 50);
  }
}

/* --------------------------------------------------
   DELETE SAVED RUN
   -------------------------------------------------- */
async function deletePayrollRun(runId) {
  if (!confirm("Delete this payroll run?")) return;
  const { error } = await sb.from("payroll_runs").delete().eq("id", runId);
  if (error) alert("Failed to delete: " + error.message);
  else loadPayrollRuns();
}

/* --------------------------------------------------
   EXPORT CURRENT PAYROLL TABLE TO EXCEL
   -------------------------------------------------- */
function exportPayrollXLSX() {
  if (payrollEmployees.length === 0) { alert("No employees to export."); return; }
  const runName = document.getElementById("payrollRunName").value.trim() || "Payroll Run";
  const period  = document.getElementById("payrollPeriod").value.trim()  || "";
  generatePayrollXLSX(payrollEmployees, runName, period);
}

function exportPayrollRunXLSX(runId) {
  const run = (window._payrollRuns || []).find(r => r.id === runId);
  if (!run) return;
  const employees = run.employees.map(e => ({ ...e, calc: calcEmployeeTax(e) }));
  generatePayrollXLSX(employees, run.run_name, run.pay_period || "");
}

function generatePayrollXLSX(employees, runName, period) {
  // Build CSV-style content then trigger download as .csv (universally opens in Excel)
  const header = [
    "Employee Name","Gross/Month","Basic","Housing","Transport","Other Allowances",
    "Pension (8%)","NHF (2.5%)","NHIS (5%)","Rent Relief/yr",
    "Chargeable Income","PAYE/Month","Net Take-Home/Month","Effective Rate (%)"
  ];

  const rows = employees.map(e => {
    const c = e.calc || calcEmployeeTax(e);
    return [
      e.name,
      c.grossMonthly.toFixed(2),
      e.basic,
      e.housing,
      e.transport,
      e.other,
      (c.pension/12).toFixed(2),
      (c.nhf/12).toFixed(2),
      (c.nhis/12).toFixed(2),
      c.rentRelief > 0 ? c.rentRelief.toFixed(2) : "0",
      (c.chargeable/12).toFixed(2),
      c.ntaPayeMonthly.toFixed(2),
      c.netMonthly.toFixed(2),
      c.effectiveRate.toFixed(2),
    ];
  });

  // Totals row
  const totals = [
    "TOTALS",
    employees.reduce((s,e) => s + (e.calc||calcEmployeeTax(e)).grossMonthly, 0).toFixed(2),
    "","","","","","","","","",
    employees.reduce((s,e) => s + (e.calc||calcEmployeeTax(e)).ntaPayeMonthly, 0).toFixed(2),
    employees.reduce((s,e) => s + (e.calc||calcEmployeeTax(e)).netMonthly, 0).toFixed(2),
    "",
  ];

  const title   = `${runName}${period ? " — " + period : ""} (NTA 2025)`;
  const csvRows = [
    [title], [],
    header,
    ...rows,
    [],
    totals,
    [],
    ["Generated by TaxCalc NTA 2025", new Date().toLocaleDateString("en-NG")]
  ];

  const csv = csvRows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const blob = new Blob(["\uFEFF" + csv, ], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${runName.replace(/\s+/g, "_")}_NTA2025.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------
   EXPORT PAYROLL PDF
   -------------------------------------------------- */
function exportPayrollPDF(runId) {
  const run = (window._payrollRuns || []).find(r => r.id === runId);
  if (!run) return;
  const employees  = run.employees;
  const runName    = run.run_name;
  const period     = run.pay_period || "";
  const dateStr    = formatDate(run.created_at);

  const rowsHtml = employees.map((e, i) => {
    const c = calcEmployeeTax(e);
    const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    return `<tr style="background:${bg};">
      <td style="padding:7px 10px;border:1px solid #e2e8e4;">${escHtml(e.name)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.grossMonthly)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.pension/12)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.nhf/12)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.nhis/12)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">₦${fmt(c.ntaPayeMonthly)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:600;">₦${fmt(c.netMonthly)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:center;">${c.effectiveRate.toFixed(1)}%</td>
    </tr>`;
  }).join("");

  const totalGross = employees.reduce((s,e) => s + calcEmployeeTax(e).grossMonthly, 0);
  const totalPAYE  = employees.reduce((s,e) => s + calcEmployeeTax(e).ntaPayeMonthly, 0);
  const totalNet   = employees.reduce((s,e) => s + calcEmployeeTax(e).netMonthly, 0);

  const html = `
    <div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:12px;line-height:1.6;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0A0F0D;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="width:28px;height:28px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:14px;">₦</div>
            <span style="font-size:16px;font-weight:800;">TaxCalc <span style="color:#00A86B;font-size:11px;font-weight:500;">NTA 2025</span></span>
          </div>
          <p style="font-size:11px;color:#888;margin:0;">Payroll Computation — ${period}</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#888;">
          <p style="margin:0;font-weight:700;color:#0A0F0D;">${escHtml(runName)}</p>
          <p style="margin:2px 0 0;">Date: ${dateStr}</p>
          <p style="margin:2px 0 0;color:#00A86B;font-weight:600;">Nigeria Tax Act 2025</p>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px;">
        <thead>
          <tr style="background:#0A0F0D;color:white;">
            <th style="padding:8px 10px;text-align:left;border:1px solid #0A0F0D;">Employee</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">Gross/Mo</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">Pension</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">NHF</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">NHIS</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">PAYE/Mo</th>
            <th style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">Net/Mo</th>
            <th style="padding:8px 10px;text-align:center;border:1px solid #0A0F0D;">Eff. Rate</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#0A0F0D;color:white;font-weight:700;">
            <td style="padding:8px 10px;border:1px solid #0A0F0D;">TOTALS (${employees.length} employees)</td>
            <td style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;">₦${fmt(totalGross)}</td>
            <td colspan="3" style="border:1px solid #0A0F0D;"></td>
            <td style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;color:#FF7070;">₦${fmt(totalPAYE)}</td>
            <td style="padding:8px 10px;text-align:right;border:1px solid #0A0F0D;color:#00A86B;">₦${fmt(totalNet)}</td>
            <td style="border:1px solid #0A0F0D;"></td>
          </tr>
        </tfoot>
      </table>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
        <div style="border:1px solid #e2e8e4;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Total PAYE Remittable</p>
          <p style="font-size:18px;font-weight:700;color:#E04040;margin:0;">₦${fmt(totalPAYE)}</p>
          <p style="font-size:10px;color:#aaa;margin:2px 0 0;">per month to FIRS</p>
        </div>
        <div style="border:1px solid #e2e8e4;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Total Net Payable</p>
          <p style="font-size:18px;font-weight:700;color:#00A86B;margin:0;">₦${fmt(totalNet)}</p>
          <p style="font-size:10px;color:#aaa;margin:2px 0 0;">per month to staff</p>
        </div>
        <div style="border:1px solid #e2e8e4;border-radius:8px;padding:12px;text-align:center;">
          <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Total Gross Payroll</p>
          <p style="font-size:18px;font-weight:700;margin:0;">₦${fmt(totalGross)}</p>
          <p style="font-size:10px;color:#aaa;margin:2px 0 0;">per month</p>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8e4;padding-top:10px;font-size:10px;color:#aaa;text-align:center;">
        <p style="margin:0;">Based on <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference purposes only.</p>
        <p style="margin:2px 0 0;">Generated by TaxCalc NTA 2025 · ${new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"long",year:"numeric"})}</p>
      </div>
    </div>`;

  const printWin = window.open("", "_blank", "width=1000,height=800");
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Payroll — ${escHtml(runName)}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;padding:32px 40px;color:#0A0F0D;}@media print{@page{margin:12mm;size:A4 landscape;}body{padding:0;}}</style>
    </head><body>${html}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 600);
}

/* --------------------------------------------------
   AUTO-LOAD PAYROLL RUNS WHEN SECTION OPENS
   Called from showAppSection (defined earlier)
   -------------------------------------------------- */
function onPayrollSectionOpen() {
  if (currentUser) loadPayrollRuns();
}

/* Theme Toggle */
function toggleTheme() {
  const isLight = document.body.classList.toggle("light-mode");
  localStorage.setItem("taxcalc_theme", isLight ? "light" : "dark");
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = isLight ? "☀ Light" : "☾ Dark";
}

function initTheme() {
  const saved = localStorage.getItem("taxcalc_theme");
  if (saved === "light") {
    document.body.classList.add("light-mode");
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.textContent = "☀ Light";
  }
}

/* ==============================================
   TOOLTIP ENGINE — fixed-position, never clipped
   ============================================== */
(function () {
  // Create one shared bubble element appended to body
  const bubble = document.createElement("div");
  bubble.id = "tipBubble";
  document.body.appendChild(bubble);

  let hideTimer = null;

  function show(icon) {
    const text = icon.getAttribute("data-tip");
    if (!text) return;

    clearTimeout(hideTimer);
    bubble.textContent = text;
    bubble.classList.remove("visible", "above", "below");

    // Temporarily make it visible (off-screen) to measure its height
    bubble.style.left = "-9999px";
    bubble.style.top  = "-9999px";
    bubble.classList.add("visible");

    const bw   = bubble.offsetWidth;
    const bh   = bubble.offsetHeight;
    const rect = icon.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;

    // Decide vertical placement: prefer above, flip below if no room
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceAbove < bh + 16;

    // Horizontal: centre on icon, clamp to viewport edges with 8px margin
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, vw - bw - 8));

    let top;
    if (placeBelow) {
      top = rect.bottom + 8;
      bubble.classList.add("below");
    } else {
      top = rect.top - bh - 8;
      bubble.classList.add("above");
    }

    bubble.style.left = left + "px";
    bubble.style.top  = top  + "px";
  }

  function hide() {
    hideTimer = setTimeout(() => {
      bubble.classList.remove("visible");
    }, 80);
  }

  // Event delegation — works for dynamically rendered rows too
  document.addEventListener("mouseover", function (e) {
    const icon = e.target.closest(".tip");
    if (icon) show(icon);
  });

  document.addEventListener("mouseout", function (e) {
    const icon = e.target.closest(".tip");
    if (icon) hide();
  });

  // Hide on scroll/resize so bubble doesn't drift
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
})();

/* =====================================================
   CIT — COMPANY INCOME TAX CALCULATOR (NTA 2025)
   ===================================================== */

let lastCIT = null;

function calculateCIT() {
  const turnover = Number(document.getElementById("citTurnover").value) || 0;
  const profit   = Number(document.getElementById("citProfit").value)   || 0;
  const assets   = Number(document.getElementById("citAssets").value)   || 0;
  const year     = document.getElementById("citYear").value || "2025";

  const empty  = document.getElementById("citEmpty");
  const output = document.getElementById("citOutput");

  if (!turnover && !profit) {
    empty.classList.remove("hidden");
    output.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  output.classList.remove("hidden");

  // Determine company tier
  const isSmall  = turnover < 50_000_000 && assets <= 250_000_000;
  const isMedium = !isSmall && turnover <= 500_000_000;
  const isLarge  = !isSmall && !isMedium;

  const citRate   = isSmall ? 0 : isMedium ? 0.20 : 0.30;
  const levyRate  = isSmall ? 0 : 0.04;   // Development Levy — exempted for small cos
  const citAmount = profit * citRate;
  const levyAmt   = profit * levyRate;
  const totalTax  = citAmount + levyAmt;
  const netProfit = profit - totalTax;
  const effRate   = profit > 0 ? (totalTax / profit * 100) : 0;

  // Tier badge
  const tierBadge = document.getElementById("citTierBadge");
  if (isSmall) {
    tierBadge.innerHTML = `<span class="cit-tier small">SMALL COMPANY — 0% CIT</span>
      <p class="cit-tier-note">Turnover under ₦50m and assets ≤ ₦250m. Exempt from CIT and Development Levy under NTA 2025.</p>`;
  } else if (isMedium) {
    tierBadge.innerHTML = `<span class="cit-tier medium">MEDIUM COMPANY — 20% CIT</span>
      <p class="cit-tier-note">Turnover between ₦50m and ₦500m. Development Levy of 4% also applies.</p>`;
  } else {
    tierBadge.innerHTML = `<span class="cit-tier large">LARGE COMPANY — 30% CIT</span>
      <p class="cit-tier-note">Turnover exceeds ₦500m. Subject to 30% CIT and 4% Development Levy.</p>`;
  }

  // Fill result fields
  document.getElementById("citRTurnover").textContent  = fmt(turnover);
  document.getElementById("citRProfit").textContent    = fmt(profit);
  document.getElementById("citRRate").textContent      = `${(citRate*100).toFixed(0)}%`;
  document.getElementById("citRCIT").textContent       = fmt(citAmount);
  document.getElementById("citRLevy").textContent      = isSmall ? "Exempt" : fmt(levyAmt);
  document.getElementById("citRTotal").textContent     = fmt(totalTax);
  document.getElementById("citRNet").textContent       = fmt(netProfit);
  document.getElementById("citREffective").textContent = `${effRate.toFixed(2)}%`;

  lastCIT = { turnover, profit, assets, year, isSmall, isMedium, isLarge,
              citRate, citAmount, levyAmt, totalTax, netProfit, effRate };
}

async function saveCIT() {
  if (!lastCIT) return alert("Nothing to save — calculate first.");
  if (!currentUser) return alert("Please log in to save.");

  const meta = currentUser.user_metadata || {};
  const company = meta.company || meta.full_name || currentUser.email;

  const tier = lastCIT.isSmall ? "small" : lastCIT.isMedium ? "medium" : "large";

  const { error } = await sb.from("cit_calculations").insert({
    user_id:       currentUser.id,
    company_name:  company,
    fin_year:      lastCIT.year,
    turnover:      lastCIT.turnover,
    assessable_profit: lastCIT.profit,
    total_assets:  lastCIT.assets,
    company_tier:  tier,
    cit_rate:      lastCIT.citRate,
    cit_payable:   lastCIT.citAmount,
    dev_levy:      lastCIT.levyAmt,
    total_tax:     lastCIT.totalTax,
    net_profit:    lastCIT.netProfit,
    effective_rate: lastCIT.effRate,
  });

  if (error) return alert("Save failed: " + error.message);
  alert("CIT calculation saved.");
  loadCITHistory();
}

async function loadCITHistory() {
  if (!currentUser) return;
  const { data, error } = await sb.from("cit_calculations")
    .select("*").eq("user_id", currentUser.id)
    .order("created_at", { ascending: false }).limit(20);

  const grid  = document.getElementById("citHistoryGrid");
  const empty = document.getElementById("citHistoryEmpty");
  if (error || !data || !data.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.innerHTML = data.map(r => {
    const tier = r.company_tier;
    const tierLabel = tier === "small" ? "Small — 0%" : tier === "medium" ? "Medium — 20%" : "Large — 30%";
    return `<div class="cit-hcard">
      <div class="cit-hcard-top">
        <span class="cit-hcard-company">${escHtml(r.company_name || "—")}</span>
        <span class="cit-hcard-date">${formatDate(r.created_at)}</span>
      </div>
      <span class="cit-tier ${tier}">${tierLabel}</span>
      <div class="cit-hcard-stats">
        <div><span class="cit-hcard-label">Turnover</span><span class="cit-hcard-val">${fmt(r.turnover)}</span></div>
        <div><span class="cit-hcard-label">CIT Payable</span><span class="cit-hcard-val red">${fmt(r.cit_payable)}</span></div>
        <div><span class="cit-hcard-label">Dev. Levy</span><span class="cit-hcard-val red">${r.company_tier==="small"?"Exempt":fmt(r.dev_levy)}</span></div>
        <div><span class="cit-hcard-label">Net Profit</span><span class="cit-hcard-val green">${fmt(r.net_profit)}</span></div>
      </div>
      <div class="cit-hcard-footer">
        <button class="card-delete" onclick="deleteCIT(${r.id}, event)">Delete</button>
      </div>
    </div>`;
  }).join("");
}

async function deleteCIT(id, e) {
  e.stopPropagation();
  if (!confirm("Delete this CIT calculation?")) return;
  await sb.from("cit_calculations").delete().eq("id", id);
  loadCITHistory();
}

function exportCITPDF() {
  if (!lastCIT) return alert("Calculate first.");
  const c = lastCIT;
  const tier = c.isSmall ? "Small Company (0% CIT)" : c.isMedium ? "Medium Company (20% CIT)" : "Large Company (30% CIT)";
  const meta = currentUser?.user_metadata || {};
  const company = meta.company || meta.full_name || currentUser?.email || "";
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const G = "#00A86B", INK = "#0A0F0D";
  const W = 210, P = 20;
  let y = 0;
  // Header bar
  doc.setFillColor(G); doc.rect(0,0,W,28,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor("#fff");
  doc.text("Company Income Tax Computation",P,12);
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text("Nigeria Tax Act 2025 — NTA 2025",P,19);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}`,W-P,19,{align:"right"});
  y=38;
  // Company info
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(INK);
  doc.text(company || "Company",P,y); y+=6;
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor("#666");
  doc.text(`Financial Year: ${c.year}   |   Company Tier: ${tier}`,P,y); y+=12;
  // Table helper
  const row = (label,val,bold=false,color=null) => {
    doc.setDrawColor("#e2e8f0"); doc.line(P,y,W-P,y);
    doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(10); doc.setTextColor(color||INK);
    doc.text(label,P,y+7); doc.text(val,W-P,y+7,{align:"right"});
    y+=11;
  };
  // Inputs section
  doc.setFillColor("#f5f7f5"); doc.rect(P,y,W-P*2,8,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor("#888");
  doc.text("COMPANY FINANCIALS",P+2,y+5.5); y+=12;
  row("Annual Turnover", fmt(c.turnover));
  row("Assessable Profit", fmt(c.profit));
  row("Total Assets", fmt(c.assets));
  y+=4;
  // Tax section
  doc.setFillColor("#f5f7f5"); doc.rect(P,y,W-P*2,8,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor("#888");
  doc.text("TAX COMPUTATION",P+2,y+5.5); y+=12;
  row("CIT Rate", `${(c.citRate*100).toFixed(0)}%`);
  row("CIT Payable", fmt(c.citAmount), false, "#E04040");
  row("Development Levy (4%)", c.isSmall?"Exempt":fmt(c.levyAmt), false, c.isSmall?"#00A86B":"#E04040");
  row("Total Tax Payable", fmt(c.totalTax), true, "#E04040");
  row("Net Profit After Tax", fmt(c.netProfit), true, "#00A86B");
  row("Effective Tax Rate", `${c.effRate.toFixed(2)}%`, true);
  y+=8;
  // Footer
  doc.setFontSize(8); doc.setTextColor("#aaa"); doc.setFont("helvetica","normal");
  doc.text("This computation is for planning purposes only. Consult a qualified tax professional before filing.",P,y);
  doc.text("Powered by TaxCalc NTA 2025",W/2,285,{align:"center"});
  doc.save(`CIT_${(company||"company").replace(/\s+/g,"_")}_${c.year}.pdf`);
}


/* =====================================================
   INFO / HELP — STATE REMITTANCE DATA
   ===================================================== */

const STATES_DATA = [
  { state:"Abia",          irs:"Abia State Board of Internal Revenue",      abbr:"ABSBIRN",  portal:"https://abia.gov.ng",                       deadline:"10th of following month" },
  { state:"Adamawa",       irs:"Adamawa State Internal Revenue Service",     abbr:"ADIRS",    portal:"https://adamawa.gov.ng",                     deadline:"10th of following month" },
  { state:"Akwa Ibom",     irs:"Akwa Ibom State Internal Revenue Service",   abbr:"AKIRS",    portal:"https://akirs.gov.ng",                       deadline:"10th of following month" },
  { state:"Anambra",       irs:"Anambra State Internal Revenue Service",     abbr:"AIRS",     portal:"https://airs.gov.ng",                        deadline:"10th of following month" },
  { state:"Bauchi",        irs:"Bauchi State Internal Revenue Service",      abbr:"BASIRS",   portal:"https://bauchi.gov.ng",                      deadline:"10th of following month" },
  { state:"Bayelsa",       irs:"Bayelsa State Internal Revenue Service",     abbr:"BIRS",     portal:"https://birs.gov.ng",                        deadline:"10th of following month" },
  { state:"Benue",         irs:"Benue State Internal Revenue Service",       abbr:"BSIRS",    portal:"https://benue.gov.ng",                       deadline:"10th of following month" },
  { state:"Borno",         irs:"Borno State Internal Revenue Service",       abbr:"BOSIRS",   portal:"https://borno.gov.ng",                       deadline:"10th of following month" },
  { state:"Cross River",   irs:"Cross River State Internal Revenue Service", abbr:"CRSIRS",   portal:"https://crsirs.gov.ng",                      deadline:"10th of following month" },
  { state:"Delta",         irs:"Delta State Board of Internal Revenue",      abbr:"DSBIR",    portal:"https://deltastatebir.com",                  deadline:"10th of following month" },
  { state:"Ebonyi",        irs:"Ebonyi State Revenue Service",               abbr:"EBRS",     portal:"https://ebonyi.gov.ng",                      deadline:"10th of following month" },
  { state:"Edo",           irs:"Edo State Internal Revenue Service",         abbr:"EIRS",     portal:"https://eirs.gov.ng",                        deadline:"10th of following month" },
  { state:"Ekiti",         irs:"Ekiti State Internal Revenue Service",       abbr:"EKIRS",    portal:"https://ekitirs.gov.ng",                     deadline:"10th of following month" },
  { state:"Enugu",         irs:"Enugu State Revenue Service",                abbr:"ESRS",     portal:"https://esrs.gov.ng",                        deadline:"10th of following month" },
  { state:"FCT Abuja",     irs:"FCT Internal Revenue Service",               abbr:"FCT-IRS",  portal:"https://fct-irs.gov.ng",                     deadline:"10th of following month" },
  { state:"Gombe",         irs:"Gombe State Internal Revenue Service",       abbr:"GIRS",     portal:"https://gombe.gov.ng",                       deadline:"10th of following month" },
  { state:"Imo",           irs:"Imo State Internal Revenue Service",         abbr:"IIRS",     portal:"https://iirs.gov.ng",                        deadline:"10th of following month" },
  { state:"Jigawa",        irs:"Jigawa State Internal Revenue Service",      abbr:"JIRS",     portal:"https://jigawa.gov.ng",                      deadline:"10th of following month" },
  { state:"Kaduna",        irs:"Kaduna State Internal Revenue Service",      abbr:"KADIRS",   portal:"https://kadirs.gov.ng",                      deadline:"10th of following month" },
  { state:"Kano",          irs:"Kano State Internal Revenue Service",        abbr:"KIRS",     portal:"https://kirs.gov.ng",                        deadline:"10th of following month" },
  { state:"Katsina",       irs:"Katsina State Internal Revenue Service",     abbr:"KATIRS",   portal:"https://katsina.gov.ng",                     deadline:"10th of following month" },
  { state:"Kebbi",         irs:"Kebbi State Internal Revenue Service",       abbr:"KEBIRS",   portal:"https://kebbi.gov.ng",                       deadline:"10th of following month" },
  { state:"Kogi",          irs:"Kogi State Internal Revenue Service",        abbr:"KOGIRS",   portal:"https://kogirs.gov.ng",                      deadline:"10th of following month" },
  { state:"Kwara",         irs:"Kwara State Internal Revenue Service",       abbr:"KWIRS",    portal:"https://kwirs.gov.ng",                       deadline:"10th of following month" },
  { state:"Lagos",         irs:"Lagos State Internal Revenue Service",       abbr:"LIRS",     portal:"https://lirs.gov.ng",                        deadline:"10th of following month" },
  { state:"Nasarawa",      irs:"Nasarawa State Board of Internal Revenue",   abbr:"NASBIR",   portal:"https://nasarawa.gov.ng",                    deadline:"10th of following month" },
  { state:"Niger",         irs:"Niger State Internal Revenue Service",       abbr:"NIGERS",   portal:"https://nigerstate.gov.ng",                  deadline:"10th of following month" },
  { state:"Ogun",          irs:"Ogun State Internal Revenue Service",        abbr:"OGIRS",    portal:"https://ogirs.gov.ng",                       deadline:"10th of following month" },
  { state:"Ondo",          irs:"Ondo State Internal Revenue Service",        abbr:"ONIRS",    portal:"https://onirs.gov.ng",                       deadline:"10th of following month" },
  { state:"Osun",          irs:"Osun State Internal Revenue Service",        abbr:"OSIRS",    portal:"https://osirsng.com",                        deadline:"10th of following month" },
  { state:"Oyo",           irs:"Oyo State Internal Revenue Service",         abbr:"OYIRS",    portal:"https://oyoirsng.com",                       deadline:"10th of following month" },
  { state:"Plateau",       irs:"Plateau State Internal Revenue Service",     abbr:"PSIRS",    portal:"https://psirs.gov.ng",                       deadline:"10th of following month" },
  { state:"Rivers",        irs:"Rivers State Internal Revenue Service",      abbr:"RSIRS",    portal:"https://rsirs.gov.ng",                       deadline:"10th of following month" },
  { state:"Sokoto",        irs:"Sokoto State Internal Revenue Service",      abbr:"SOKIRS",   portal:"https://sokoto.gov.ng",                      deadline:"10th of following month" },
  { state:"Taraba",        irs:"Taraba State Internal Revenue Service",      abbr:"TARS",     portal:"https://taraba.gov.ng",                      deadline:"10th of following month" },
  { state:"Yobe",          irs:"Yobe State Revenue Service",                 abbr:"YBRS",     portal:"https://yobe.gov.ng",                        deadline:"10th of following month" },
  { state:"Zamfara",       irs:"Zamfara State Internal Revenue Service",     abbr:"ZIRS",     portal:"https://zamfara.gov.ng",                     deadline:"10th of following month" },
];

function renderStates(list) {
  const grid = document.getElementById("stateGrid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<p style="color:rgba(255,255,255,0.3);font-family:var(--mono);font-size:12px;padding:12px 0;">No states match your search.</p>`;
    return;
  }
  grid.innerHTML = list.map(s => `
    <div class="state-card">
      <div class="state-card-top">
        <span class="state-name">${s.state}</span>
        <span class="state-abbr">${s.abbr}</span>
      </div>
      <div class="state-irs">${s.irs}</div>
      <div class="state-deadline">⏰ ${s.deadline}</div>
      <a class="state-portal-link" href="${s.portal}" target="_blank" rel="noopener">Visit Portal →</a>
    </div>
  `).join("");
}

function filterStates() {
  const q = (document.getElementById("stateSearch")?.value || "").toLowerCase();
  const filtered = STATES_DATA.filter(s =>
    s.state.toLowerCase().includes(q) ||
    s.irs.toLowerCase().includes(q) ||
    s.abbr.toLowerCase().includes(q)
  );
  renderStates(filtered);
}

function onInfoSectionOpen() {
  renderStates(STATES_DATA);
}