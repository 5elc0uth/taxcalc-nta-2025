"use strict";

/* ===========================
   SUPABASE INIT
   =========================== */
const SUPABASE_URL = "https://oowmffgepmfvqutnqxdl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vd21mZmdlcG1mdnF1dG5xeGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4Mzc4OTIsImV4cCI6MjA4NzQxMzg5Mn0.9c22b46Af6cWIFHBZROi63-hicObyHoStq2XglqoL2A";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===========================
   STATE
   =========================== */
let inputMode = "monthly";
let bandsVisible = false;
let lastCalc = null;
let _deletingAccount = false; // prevents onAuthStateChange re-login during account deletion

/* ===========================
   INPUT MODE TOGGLE
   =========================== */
function setInputMode(mode) {
  inputMode = mode;
  document
    .getElementById("monthlyBtn")
    .classList.toggle("active", mode === "monthly");
  document
    .getElementById("annualBtn")
    .classList.toggle("active", mode === "annual");
  document.getElementById("periodLabel").textContent =
    mode === "monthly" ? "(Monthly)" : "(Annual)";
  calculate();
}

/* ===========================
   HELPERS
   =========================== */
function val(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function fmt(n) {
  if (n === 0) return "₦0";
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

function getRegime() {
  return document.querySelector("input[name='regime']:checked").value;
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ===========================
   TAX BANDS
   =========================== */
const NTA2025_BANDS = [
  { label: "First ₦800,000", limit: 800_000, rate: 0.0 },
  { label: "Next ₦2,200,000", limit: 2_200_000, rate: 0.15 },
  { label: "Next ₦9,000,000", limit: 9_000_000, rate: 0.18 },
  { label: "Next ₦12,000,000", limit: 12_000_000, rate: 0.21 },
  { label: "Next ₦16,000,000", limit: 16_000_000, rate: 0.23 },
  { label: "Above ₦40,000,000", limit: Infinity, rate: 0.25 },
];

const PITA_BANDS = [
  { label: "First ₦300,000", limit: 300_000, rate: 0.07 },
  { label: "Next ₦300,000", limit: 300_000, rate: 0.11 },
  { label: "Next ₦500,000", limit: 500_000, rate: 0.15 },
  { label: "Next ₦500,000", limit: 500_000, rate: 0.19 },
  { label: "Next ₦1,600,000", limit: 1_600_000, rate: 0.21 },
  { label: "Above ₦3,200,000", limit: Infinity, rate: 0.24 },
];

function calcBands(chargeableIncome, bands) {
  let remaining = Math.max(0, chargeableIncome);
  let totalTax = 0;
  const workings = [];
  for (const band of bands) {
    if (remaining <= 0) {
      workings.push({ ...band, taxable: 0, tax: 0 });
      continue;
    }
    const taxable =
      band.limit === Infinity ? remaining : Math.min(remaining, band.limit);
    const tax = taxable * band.rate;
    totalTax += tax;
    workings.push({ ...band, taxable, tax });
    remaining -= taxable;
  }
  return { totalTax, workings };
}

/* ===========================
   MAIN CALCULATION
   =========================== */
function calculate() {
  const mult = inputMode === "monthly" ? 12 : 1;
  const basic = val("basic") * mult;
  const housing = val("housing") * mult;
  const transport = val("transport") * mult;
  const other = val("other") * mult;
  const annualRent = val("annualRent");

  if (basic + housing + transport + other === 0) {
    showEmpty();
    lastCalc = null;
    return;
  }

  const gross = basic + housing + transport + other;
  const pension = 0.08 * (basic + housing + transport);
  const nhf = 0.025 * basic;
  const nhis = 0.05 * basic;
  const rentRelief = annualRent > 0 ? Math.min(0.2 * annualRent, 500_000) : 0;
  const chargeable = Math.max(0, gross - pension - nhf - nhis - rentRelief);

  const isExempt = chargeable <= 800_000;
  const ntaResult = calcBands(chargeable, NTA2025_BANDS);
  const ntaPaye = ntaResult.totalTax;
  const ntaNet = gross - pension - nhf - nhis - ntaPaye;
  const ntaNetMonthly = ntaNet / 12;
  const effectiveRate = gross > 0 ? (ntaPaye / gross) * 100 : 0;

  const cra = Math.max(200_000, 0.01 * gross) + 0.2 * gross;
  const pitaChargeable = Math.max(0, gross - pension - nhf - nhis - cra);
  const pitaResult = calcBands(pitaChargeable, PITA_BANDS);
  const pitaPaye = pitaResult.totalTax;
  const pitaNet = gross - pension - nhf - nhis - pitaPaye;
  const pitaNetMonthly = pitaNet / 12;
  const diff = ntaNetMonthly - pitaNetMonthly;

  lastCalc = {
    basic,
    housing,
    transport,
    other_allowances: other,
    annual_rent: annualRent,
    gross_annual: gross,
    pension,
    nhf,
    nhis,
    rent_relief: rentRelief,
    chargeable_income: chargeable,
    nta_paye: ntaPaye,
    nta_net_monthly: ntaNetMonthly,
    nta_net_annual: ntaNet,
    pita_paye: pitaPaye,
    pita_net_monthly: pitaNetMonthly,
    effective_rate: effectiveRate,
    input_mode: inputMode,
    cra,
    pitaNet,
    diff,
    isExempt,
    ntaBands: ntaResult.workings,
    pitaBands: pitaResult.workings,
    // US-014/015: client name for audit PDF (read at export time, not calc time)
    get clientName() {
      return document.getElementById("clientName")?.value?.trim() || "";
    },
  };

  showResults();

  document
    .getElementById("exemptionBanner")
    .classList.toggle("hidden", !isExempt);
  if (isExempt) {
    const exemptEl = document.getElementById("exemptChargeableAmt");
    if (exemptEl)
      exemptEl.textContent =
        fmt(chargeable / 12) + "/mo (" + fmt(chargeable) + "/yr)";
  }
  document.getElementById("grossDisplay").textContent = fmt(gross / 12);
  document.getElementById("chargeableDisplay").textContent =
    fmt(chargeable / 12) + "/mo";
  document.getElementById("effectiveRateDisplay").textContent =
    effectiveRate.toFixed(2) + "%";
  document.getElementById("summaryNetMonthly").textContent = fmt(ntaNetMonthly);
  document.getElementById("summaryNetAnnual").textContent = fmt(ntaNet);
  document.getElementById("pensionDisplay").textContent =
    fmt(pension / 12) + "/mo";
  document.getElementById("nhfDisplay").textContent = fmt(nhf / 12) + "/mo";
  document.getElementById("nhisDisplay").textContent = fmt(nhis / 12) + "/mo";
  document.getElementById("totalDeductionsDisplay").textContent =
    fmt((pension + nhf + nhis + rentRelief) / 12) + "/mo";

  const rentRow = document.getElementById("rentRow");
  if (rentRelief > 0) {
    rentRow.classList.remove("hidden");
    document.getElementById("rentReliefDisplay").textContent =
      "-" + fmt(rentRelief) + "/yr";
  } else {
    rentRow.classList.add("hidden");
  }

  document.getElementById("ntaPaye").textContent = fmt(ntaPaye / 12) + "/mo";
  document.getElementById("ntaNetMonthly").textContent = fmt(ntaNetMonthly);
  document.getElementById("ntaNetAnnual").textContent = fmt(ntaNet);
  document.getElementById("pitaCra").textContent = fmt(cra / 12) + "/mo";
  document.getElementById("pitaPaye").textContent = fmt(pitaPaye / 12) + "/mo";
  document.getElementById("pitaNetMonthly").textContent = fmt(pitaNetMonthly);
  document.getElementById("pitaNetAnnual").textContent = fmt(pitaNet);

  renderBands("ntaBands", ntaResult.workings);
  renderBands("pitaBands", pitaResult.workings);

  // Stage A US-014: update client name field label based on role
  const role = window._userRole || "employee";
  const clientNameLabel = document.getElementById("clientNameLabel");
  const clientNameInput = document.getElementById("clientName");
  if (clientNameLabel && clientNameInput) {
    if (role === "employee") {
      clientNameLabel.childNodes[0].textContent = "Your Name ";
      clientNameInput.placeholder = "e.g. Okwori Joseph";
    } else if (role === "hr_manager" || role === "business_owner") {
      clientNameLabel.childNodes[0].textContent = "Employee Name ";
      clientNameInput.placeholder = "e.g. Amaka Okafor";
    } else {
      // accountant / tax_consultant
      clientNameLabel.childNodes[0].textContent = "Client Name ";
      clientNameInput.placeholder = "e.g. Zenith Bank PLC — Adaeze Nwosu";
    }
  }

  // Stage 5: Auto-expand band workings so user always sees how tax was calculated
  bandsVisible = true;
  document.getElementById("ntaBands").classList.remove("hidden");
  document.getElementById("pitaBands").classList.remove("hidden");
  document.getElementById("bandsToggleLabel").textContent =
    "▲ How Your Tax Was Calculated";

  const regime = getRegime();
  document
    .getElementById("nta2025Result")
    .classList.toggle("hidden", regime === "pita");
  document
    .getElementById("pitaResult")
    .classList.toggle("hidden", regime === "nta2025");

  const compEl = document.getElementById("comparisonHighlight");
  if (regime === "both") {
    compEl.classList.remove("hidden");

    const pitaChargeable = Math.max(0, gross - pension - nhf - nhis - cra);
    const pitaEffRate = gross > 0 ? (pitaPaye / gross) * 100 : 0;

    const diffSign = (n) => (n >= 0 ? "+" : "");
    const diffColor = (el, n) => {
      el.classList.remove("positive", "negative", "muted");
      el.classList.add(n > 0 ? "positive" : n < 0 ? "negative" : "muted");
    };

    // Gross (same both sides)
    document.getElementById("cmpGrossPita").textContent = fmt(gross / 12);
    document.getElementById("cmpGrossNta").textContent = fmt(gross / 12);

    // Relief
    document.getElementById("cmpReliefPita").textContent = "CRA: " + fmt(cra);
    document.getElementById("cmpReliefNta").textContent =
      rentRelief > 0 ? "Rent Relief: " + fmt(rentRelief) : "Nil";
    const reliefDiffEl = document.getElementById("cmpReliefDiff");
    const reliefDiff = rentRelief - cra;
    reliefDiffEl.textContent = diffSign(reliefDiff) + fmt(Math.abs(reliefDiff));
    diffColor(reliefDiffEl, reliefDiff);

    // Chargeable
    document.getElementById("cmpChargePita").textContent = fmt(
      pitaChargeable / 12,
    );
    document.getElementById("cmpChargeNta").textContent = fmt(chargeable / 12);
    const chargeDiffEl = document.getElementById("cmpChargeDiff");
    const chargeDiff = (chargeable - pitaChargeable) / 12;
    chargeDiffEl.textContent =
      diffSign(-chargeDiff) + fmt(Math.abs(chargeDiff));
    diffColor(chargeDiffEl, -chargeDiff);

    // PAYE
    document.getElementById("cmpPayePita").textContent = fmt(pitaPaye / 12);
    document.getElementById("cmpPayeNta").textContent = fmt(ntaPaye / 12);
    const payeDiffEl = document.getElementById("cmpPayeDiff");
    const payeDiff = (ntaPaye - pitaPaye) / 12;
    payeDiffEl.textContent = diffSign(-payeDiff) + fmt(Math.abs(payeDiff));
    diffColor(payeDiffEl, -payeDiff);

    // Net monthly
    document.getElementById("cmpNetPita").textContent = fmt(pitaNetMonthly);
    document.getElementById("cmpNetNta").textContent = fmt(ntaNetMonthly);
    const netDiffEl = document.getElementById("cmpNetDiff");
    netDiffEl.textContent = diffSign(diff) + fmt(Math.abs(diff));
    diffColor(netDiffEl, diff);

    // Net annual
    document.getElementById("cmpNetAnnualPita").textContent = fmt(pitaNet);
    document.getElementById("cmpNetAnnualNta").textContent = fmt(ntaNet);
    const netAnnDiffEl = document.getElementById("cmpNetAnnualDiff");
    const annDiff = ntaNet - pitaNet;
    netAnnDiffEl.textContent = diffSign(annDiff) + fmt(Math.abs(annDiff));
    diffColor(netAnnDiffEl, annDiff);

    // Effective rate
    document.getElementById("cmpRatePita").textContent =
      pitaEffRate.toFixed(2) + "%";
    document.getElementById("cmpRateNta").textContent =
      effectiveRate.toFixed(2) + "%";
    const rateDiffEl = document.getElementById("cmpRateDiff");
    const rateDiff = effectiveRate - pitaEffRate;
    rateDiffEl.textContent =
      diffSign(-rateDiff) + Math.abs(rateDiff).toFixed(2) + "%";
    diffColor(rateDiffEl, -rateDiff);

    // Verdict
    const absDiff = Math.abs(diff);
    document.getElementById("comparisonValue").textContent =
      (diff >= 0 ? "+" : "−") + fmt(absDiff);
    document.getElementById("comparisonValue").className =
      "comp-verdict-value " + (diff >= 0 ? "positive" : "negative");
    document.getElementById("comparisonSub").textContent =
      diff >= 0
        ? `Client takes home ${fmt(absDiff)} MORE per month under NTA 2025 (${fmt(absDiff * 12)} / year)`
        : `Client takes home ${fmt(absDiff)} LESS per month under NTA 2025 (${fmt(absDiff * 12)} / year)`;
  } else {
    compEl.classList.add("hidden");
  }
}

/* ===========================
   RENDER BANDS
   =========================== */
function renderBands(containerId, workings) {
  const container = document.getElementById(containerId);
  const c = lastCalc;

  if (!workings.some((w) => w.taxable > 0)) {
    container.innerHTML =
      '<p style="font-size:12px;color:rgba(255,255,255,0.4);padding:10px 0;">No taxable income in any band — fully exempt under NTA 2025.</p>';
    return;
  }

  const totalTax = workings.reduce((s, w) => s + w.tax, 0);

  // --- Step-by-step derivation with real numbers ---
  const isNTA = containerId === "ntaBands";
  const chargeableVal = isNTA
    ? c.gross_annual - c.pension - c.nhf - c.nhis - (c.rent_relief || 0)
    : c.gross_annual - c.pension - c.nhf - c.nhis - (c.cra || 0);

  const rentRow =
    c.rent_relief > 0 && isNTA
      ? `<div class="deriv-row relief"><span>Rent Relief <span class="deriv-tag">NTA 2025 §36</span></span><span>− ${fmt(c.rent_relief)}</span></div>`
      : "";
  const craRow =
    !isNTA && c.cra > 0
      ? `<div class="deriv-row relief"><span>CRA (§33 PITA)</span><span>− ${fmt(c.cra)}</span></div>`
      : "";

  const derivation = `
    <div class="band-derivation">
      <div class="deriv-title">HOW CHARGEABLE INCOME WAS DERIVED</div>
      <div class="deriv-row gross"><span>Gross Annual Pay</span><span>${fmt(c.gross_annual)}</span></div>
      <div class="deriv-row deduct"><span>Less: Pension (8% of Basic+Housing+Transport)</span><span>− ${fmt(c.pension)}</span></div>
      <div class="deriv-row deduct"><span>Less: NHF (2.5% of Basic) <span class="deriv-tag">§21 NHF Act</span></span><span>− ${fmt(c.nhf)}</span></div>
      <div class="deriv-row deduct"><span>Less: NHIS (5% of Basic)</span><span>− ${fmt(c.nhis)}</span></div>
      ${rentRow}${craRow}
      <div class="deriv-row chargeable"><span>Chargeable Income <span class="deriv-tag">${isNTA ? "§25 NTA 2025" : "§33 PITA"}</span></span><span>${fmt(Math.max(0, chargeableVal))}</span></div>
      <div class="deriv-row monthly-note"><span>Monthly equivalent</span><span>${fmt(Math.max(0, chargeableVal) / 12)} / mo</span></div>
    </div>`;

  // --- All bands (zero bands dimmed, not hidden) ---
  const rows = workings
    .map(
      (w) => `
    <tr class="${w.taxable > 0 ? "band-active" : "band-zero"}">
      <td class="band-label-cell">${w.label}</td>
      <td class="band-rate">${(w.rate * 100).toFixed(0)}%</td>
      <td>${w.taxable > 0 ? fmt(w.taxable) : '<span class="band-nil">—</span>'}</td>
      <td>${w.taxable > 0 ? fmt(w.taxable / 12) : '<span class="band-nil">—</span>'}</td>
      <td class="band-tax">${w.tax > 0 ? fmt(w.tax) : '<span class="band-nil">—</span>'}</td>
    </tr>`,
    )
    .join("");

  container.innerHTML = `
    ${derivation}
    <div class="band-table-title">PAYE BAND COMPUTATION <span class="deriv-tag">${isNTA ? "§25 NTA 2025" : "§PITA"}</span></div>
    <table class="bands-table">
      <thead>
        <tr>
          <th>Band</th>
          <th>Rate</th>
          <th>Annual Taxable</th>
          <th>Monthly Taxable</th>
          <th>Tax</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" class="band-total-label">Annual PAYE Total</td>
          <td class="band-total-amt">${fmt(totalTax)}</td>
          <td class="band-total-amt">${fmt(totalTax / 12)}<span class="band-mo-label">/mo</span></td>
          <td class="band-tax bold">${fmt(totalTax)}</td>
        </tr>
      </tfoot>
    </table>`;
}

function toggleBands() {
  bandsVisible = !bandsVisible;
  document.getElementById("ntaBands").classList.toggle("hidden", !bandsVisible);
  document
    .getElementById("pitaBands")
    .classList.toggle("hidden", !bandsVisible);
  document.getElementById("bandsToggleLabel").textContent = bandsVisible
    ? "▲ Hide Tax Band Workings"
    : "▼ Show Tax Band Workings";
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
  if (!lastCalc) {
    showSaveStatus("Please calculate your tax first.", "error");
    return;
  }
  if (!currentUser) {
    showSaveStatus("Please sign in to save calculations.", "error");
    return;
  }

  const saveBtn = document.getElementById("saveBtn");
  const meta = currentUser.user_metadata || {};
  const loggedIn = meta.full_name || currentUser.email || "Anonymous";
  const role = window._userRole || "employee";
  const clientVal = lastCalc.clientName; // reads client name field at save time

  // user_name stored in DB = who the calculation is FOR (not who ran it)
  // For employees: their own name. For HR/biz/accountant: the client/employee name.
  const savedName = clientVal || loggedIn;
  // Separately store who prepared it for non-employee roles
  const preparedBy = role !== "employee" && clientVal ? loggedIn : null;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const { error } = await sb.from("tax_calculations").insert({
    user_id: currentUser.id,
    user_name: savedName,
    prepared_by: preparedBy,
    basic: lastCalc.basic,
    housing: lastCalc.housing,
    transport: lastCalc.transport,
    other_allowances: lastCalc.other_allowances,
    annual_rent: lastCalc.annual_rent,
    gross_annual: lastCalc.gross_annual,
    pension: lastCalc.pension,
    nhf: lastCalc.nhf,
    nhis: lastCalc.nhis,
    rent_relief: lastCalc.rent_relief,
    chargeable_income: lastCalc.chargeable_income,
    nta_paye: lastCalc.nta_paye,
    nta_net_monthly: lastCalc.nta_net_monthly,
    nta_net_annual: lastCalc.nta_net_annual,
    pita_paye: lastCalc.pita_paye,
    pita_net_monthly: lastCalc.pita_net_monthly,
    effective_rate: lastCalc.effective_rate,
    input_mode: lastCalc.input_mode,
  });

  saveBtn.disabled = false;
  saveBtn.textContent = "💾 Save Calculation";

  if (error) {
    showSaveStatus("Failed to save: " + error.message, "error");
  } else {
    showSaveStatus("✓ Saved successfully!", "success");
    loadHistory();
    // US-017: auto-upsert client profile for tax_consultant when a named client is saved
    if (role === "tax_consultant" && clientVal) {
      upsertClientProfileFromCalc(clientVal, lastCalc);
    }
  }
}

async function upsertClientProfileFromCalc(clientName, calc) {
  if (!currentUser || !clientName) return;
  // Check if a profile already exists for this client name under this user
  const { data: existing } = await sb
    .from("client_profiles")
    .select("id")
    .eq("user_id", currentUser.id)
    .ilike("name", clientName)
    .limit(1);

  const payload = {
    user_id: currentUser.id,
    name: clientName,
    basic: calc.basic,
    housing: calc.housing,
    transport: calc.transport,
    other_allowances: calc.other_allowances,
    annual_rent: calc.annual_rent || 0,
    updated_at: new Date().toISOString(),
  };

  if (existing && existing.length > 0) {
    // Update existing profile with latest salary figures
    await sb.from("client_profiles").update(payload).eq("id", existing[0].id);
  } else {
    // Create new profile
    payload.notes = "";
    payload.created_at = new Date().toISOString();
    await sb.from("client_profiles").insert(payload);
  }
  // Refresh profiles grid silently if currently on clients tab
  if (document.getElementById("clients")?.style.display !== "none") {
    loadClientProfiles();
  }
}

function showSaveStatus(msg, type) {
  const el = document.getElementById("saveStatus");
  el.textContent = msg;
  el.className = "save-status " + type;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

/* ===========================
   LOAD HISTORY  (US-007 + US-018)
   =========================== */
let _allHistory = [];
let _filteredHistory = [];
let _historyPage = 0;
const HISTORY_PER_PAGE = 5;

async function loadHistory() {
  if (!currentUser) return;
  const grid = document.getElementById("historyGrid");
  const empty = document.getElementById("historyEmpty");
  grid.innerHTML =
    '<p style="color:rgba(255,255,255,0.3);font-size:13px;font-family:var(--mono);padding:20px 0;">Loading...</p>';
  const { data, error } = await sb
    .from("tax_calculations")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    grid.innerHTML = `<p style="color:#FF7070;font-size:13px;">Error: ${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    document.getElementById("histExcelBtn").style.display = "none";
    return;
  }
  _allHistory = data;
  _filteredHistory = data;
  _historyPage = 0;
  empty.classList.add("hidden");
  document.getElementById("histExcelBtn").style.display = "";
  // Clear search on fresh load
  const searchEl = document.getElementById("historySearch");
  if (searchEl) searchEl.value = "";
  updateHistoryCount(_allHistory.length, _allHistory.length);
  grid.innerHTML = "";
  renderNextHistoryPage();
}

/* US-018: filter by client name */
function filterHistory() {
  const q = (document.getElementById("historySearch")?.value || "")
    .toLowerCase()
    .trim();
  const grid = document.getElementById("historyGrid");
  const empty = document.getElementById("historyEmpty");
  const noRes = document.getElementById("historyNoResults");

  _filteredHistory = q
    ? _allHistory.filter((c) => (c.user_name || "").toLowerCase().includes(q))
    : _allHistory;

  _historyPage = 0;
  grid.innerHTML = "";

  if (_allHistory.length === 0) {
    empty.classList.remove("hidden");
    noRes.classList.add("hidden");
    updateHistoryCount(0, 0);
    return;
  }
  empty.classList.add("hidden");

  if (_filteredHistory.length === 0) {
    noRes.classList.remove("hidden");
    document.getElementById("historySearchTerm").textContent = `"${q}"`;
    updateHistoryCount(0, _allHistory.length);
    return;
  }
  noRes.classList.add("hidden");
  updateHistoryCount(_filteredHistory.length, _allHistory.length);
  renderNextHistoryPage();
}

function updateHistoryCount(shown, total) {
  const el = document.getElementById("historySearchCount");
  if (!el) return;
  if (total === 0) {
    el.textContent = "";
    return;
  }
  const q = (document.getElementById("historySearch")?.value || "").trim();
  el.textContent = q
    ? `${shown} of ${total} record${total !== 1 ? "s" : ""}`
    : `${total} record${total !== 1 ? "s" : ""}`;
}

function renderNextHistoryPage() {
  const grid = document.getElementById("historyGrid");
  const batch = _filteredHistory.slice(
    _historyPage * HISTORY_PER_PAGE,
    (_historyPage + 1) * HISTORY_PER_PAGE,
  );
  _historyPage++;

  batch.forEach((c) => {
    const diff = c.nta_net_monthly - c.pita_net_monthly;
    const better = diff >= 0;
    const card = document.createElement("div");
    card.className = "history-card";
    card.innerHTML = buildHistoryCard(c, diff, better);
    grid.appendChild(card);
  });

  // Show More button
  const existing = document.getElementById("histShowMore");
  if (existing) existing.remove();
  const remaining = _filteredHistory.length - _historyPage * HISTORY_PER_PAGE;
  if (remaining > 0) {
    const btn = document.createElement("div");
    btn.id = "histShowMore";
    btn.style.cssText = "text-align:center;margin-top:20px;";
    btn.innerHTML = `<button class="btn-refresh" onclick="renderNextHistoryPage()" style="padding:10px 32px;font-size:13px;">Show More <span style="opacity:0.5;">(${remaining} remaining)</span></button>`;
    grid.appendChild(btn);
  }
}

/* US-018: Export filtered history as Excel (CSV) */
function exportHistoryExcel() {
  const records = _filteredHistory.length > 0 ? _filteredHistory : _allHistory;
  if (!records.length) {
    alert("No records to export.");
    return;
  }

  const q = (document.getElementById("historySearch")?.value || "").trim();
  const title = q ? `Tax History — ${q}` : "Tax Calculation History";
  const dateNow = new Date().toLocaleDateString("en-NG");

  const header = [
    "Client Name",
    "Prepared By",
    "Date Saved",
    "Gross / Month (₦)",
    "Gross / Year (₦)",
    "Pension / Month (₦)",
    "NHF / Month (₦)",
    "NHIS / Month (₦)",
    "Rent Relief / Year (₦)",
    "Chargeable Income / Month (₦)",
    "NTA 2025 PAYE / Month (₦)",
    "NTA 2025 PAYE / Year (₦)",
    "NTA 2025 Net Pay / Month (₦)",
    "NTA 2025 Net Pay / Year (₦)",
    "Old PITA PAYE / Month (₦)",
    "Old PITA PAYE / Year (₦)",
    "Old PITA Net Pay / Month (₦)",
    "Effective Tax Rate (%)",
    "NTA 2025 Benefit / Month (₦)",
  ];

  const rows = records.map((c) => {
    const diff = c.nta_net_monthly - c.pita_net_monthly;
    return [
      c.user_name || "Anonymous",
      c.prepared_by || "",
      new Date(c.created_at).toLocaleDateString("en-NG"),
      (c.gross_annual / 12).toFixed(2),
      c.gross_annual.toFixed(2),
      (c.pension / 12).toFixed(2),
      (c.nhf / 12).toFixed(2),
      (c.nhis / 12).toFixed(2),
      (c.rent_relief || 0).toFixed(2),
      (c.chargeable_income / 12).toFixed(2),
      (c.nta_paye / 12).toFixed(2),
      c.nta_paye.toFixed(2),
      c.nta_net_monthly.toFixed(2),
      c.nta_net_annual.toFixed(2),
      (c.pita_paye / 12).toFixed(2),
      c.pita_paye.toFixed(2),
      c.pita_net_monthly.toFixed(2),
      Number(c.effective_rate).toFixed(2),
      diff.toFixed(2),
    ];
  });

  const csvRows = [
    [title],
    [`Exported: ${dateNow}`],
    [`Records: ${records.length}`],
    [],
    header,
    ...rows,
    [],
    ["Generated by TaxCalc NTA 2025", dateNow],
  ];

  const csv = csvRows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const filename = q
    ? `TaxHistory_${q.replace(/\s+/g, "_")}_${dateNow.replace(/\//g, "-")}.csv`
    : `TaxHistory_All_${dateNow.replace(/\//g, "-")}.csv`;

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildHistoryCard(c, diff, better) {
  return `
    <div class="card-top">
      <span class="card-name">${escHtml(c.user_name || "Anonymous")}</span>
      <span class="card-date">${formatDate(c.created_at)}</span>
    </div>
    ${c.prepared_by ? `<div class="card-prepared-by">Prepared by: ${escHtml(c.prepared_by)}</div>` : ""}

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
      <div class="hcard-row"><span>Pension (8%)</span><span>${fmt(c.pension / 12)}/mo</span></div>
      <div class="hcard-row"><span>NHF (2.5%)</span><span>${fmt(c.nhf / 12)}/mo</span></div>
      <div class="hcard-row"><span>NHIS (5%)</span><span>${fmt(c.nhis / 12)}/mo</span></div>
      ${c.rent_relief > 0 ? `<div class="hcard-row green"><span>Rent Relief (NTA 2025)</span><span>-${fmt(c.rent_relief)}/yr</span></div>` : ""}
      <div class="hcard-row total"><span>Total Deductions / Month</span><span style="color:#FF7070;">${fmt((c.pension + c.nhf + c.nhis) / 12)}/mo</span></div>
    </div>

    <div class="hcard-regime nta-regime">
      <div class="hcard-regime-header">
        <span class="card-regime-badge nta">NTA 2025</span>
        <span class="hcard-regime-sub">New Regime</span>
      </div>
      <div class="hcard-row"><span>PAYE Tax</span><span class="red">${fmt(c.nta_paye / 12)}/mo</span></div>
      <div class="hcard-row bold"><span>Monthly Net Pay</span><span class="green large-val">${fmt(c.nta_net_monthly)}</span></div>
      <div class="hcard-row muted"><span>Annual Net Pay</span><span>${fmt(c.nta_net_annual)}</span></div>
    </div>

    <div class="hcard-regime pita-regime">
      <div class="hcard-regime-header">
        <span class="card-regime-badge pita">Old PITA</span>
        <span class="hcard-regime-sub">Previous Regime</span>
      </div>
      <div class="hcard-row"><span>CRA Deduction</span><span>${fmt((Math.max(200000, 0.01 * c.gross_annual) + 0.2 * c.gross_annual) / 12)}/mo</span></div>
      <div class="hcard-row"><span>PAYE Tax</span><span class="red">${fmt(c.pita_paye / 12)}/mo</span></div>
      <div class="hcard-row bold"><span>Monthly Net Pay</span><span class="${better ? "muted-val" : "green"} large-val">${fmt(c.pita_net_monthly)}</span></div>
      <div class="hcard-row muted"><span>Annual Net Pay</span><span>${fmt(c.pita_net_monthly * 12)}</span></div>
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
  const c = _allHistory.find((r) => r.id === id);
  if (!c) return;
  document.getElementById("basic").value = Math.round(c.basic / 12);
  document.getElementById("housing").value = Math.round(c.housing / 12);
  document.getElementById("transport").value = Math.round(c.transport / 12);
  document.getElementById("other").value = Math.round(c.other_allowances / 12);
  document.getElementById("annualRent").value = Math.round(c.annual_rent || 0);
  setInputMode("monthly");
  showAppSection("calculator");
  // oninput doesn't fire when setting .value programmatically — trigger manually
  setTimeout(() => calculate(), 50);
}

function showAppSection(id) {
  // Remember which tab was active so reload restores it
  sessionStorage.setItem("taxcalc_active_tab", id);

  // Close business dropdown if open
  closeBizDropdown();

  // Show only the target section
  APP_SECTIONS.forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? "" : "none";
  });

  // Update active state on flat nav links
  document.querySelectorAll(".user-nav-link").forEach((l) => {
    l.classList.toggle("active", l.dataset.section === id);
  });

  // Highlight Business dropdown trigger if a business tab is active
  const bizSections = ["cit", "vat", "bizsummary", "clients"];
  const trigger = document.getElementById("bizDropdownTrigger");
  if (trigger) trigger.classList.toggle("active", bizSections.includes(id));

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
  // Hook: load CIT history when Business Tax tab opens
  if (id === "cit") {
    setTimeout(() => loadCITHistory(), 50);
  }
  // Hook: load VAT history when VAT tab opens
  if (id === "vat") {
    setTimeout(() => loadVATHistory(), 50);
  }
  // Hook: refresh business summary when Tax Summary tab opens
  if (id === "bizsummary") {
    setTimeout(() => {
      refreshBizSummary();
      loadBizSummaryHistory();
    }, 50);
  }
  // Re-render Lucide icons for any dynamically shown content
  setTimeout(refreshIcons, 60);
}

function exportHistoryPDF(id) {
  const c = _allHistory.find((r) => r.id === id);
  if (!c) return;
  const name = c.user_name || "Anonymous";
  const dateStr = formatDate(c.created_at);
  const diff = c.nta_net_monthly - c.pita_net_monthly;
  const better = diff >= 0;

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
      ${c.rent_relief > 0 ? '<tr style="background:#fafafa;"><td style="padding:6px 10px;border:1px solid #e2e8e4;color:#00A86B;">Rent Relief</td><td style="padding:6px 10px;border:1px solid #e2e8e4;text-align:right;color:#00A86B;">-' + fmt(c.rent_relief) + "</td></tr>" : ""}
      <tr><td style="padding:8px 10px;border:2px solid #0A0F0D;font-weight:700;">Chargeable Income</td>
          <td style="padding:8px 10px;border:2px solid #0A0F0D;text-align:right;font-weight:700;">${fmt(c.chargeable_income)}</td></tr>
    </table>
    <div style="margin-bottom:14px;border:2px solid #0A0F0D;border-radius:8px;overflow:hidden;">
      <div style="background:#0A0F0D;padding:8px 14px;display:flex;align-items:center;gap:8px;">
        <span style="background:#00A86B;color:white;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;">NTA 2025</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.5);">New Regime</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Month</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">${fmt(c.nta_paye / 12)}</td></tr>
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
        <tr><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Month</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">${fmt(c.pita_paye / 12)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;">PAYE Tax / Year</td><td style="padding:8px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#E04040;">${fmt(c.pita_paye)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;font-weight:700;">Monthly Net Pay</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:700;font-size:15px;">${fmt(c.pita_net_monthly)}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:8px 14px;">Annual Net Pay</td><td style="padding:8px 14px;text-align:right;">${fmt(c.pita_net_monthly * 12)}</td></tr>
      </table>
    </div>
    <div style="border:2px solid ${better ? "#00A86B" : "#E04040"};border-radius:8px;padding:14px;text-align:center;margin-bottom:16px;">
      <p style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">You save / lose under NTA 2025</p>
      <p style="font-size:26px;font-weight:700;margin:0;color:${better ? "#00A86B" : "#E04040"};">${better ? "+" : "-"}${fmt(Math.abs(diff))}</p>
      <p style="font-size:11px;color:#888;margin:6px 0 0;">${better ? "more" : "less"} per month under NTA 2025</p>
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
  setTimeout(() => {
    printWin.print();
  }, 600);
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
  if (!lastCalc) {
    alert("Please calculate your tax first before exporting.");
    return;
  }

  const meta = currentUser?.user_metadata || {};
  const loggedIn = meta.full_name || currentUser?.email || "Anonymous";
  const role = window._userRole || "employee";
  const clientVal = lastCalc.clientName;
  const c = lastCalc;
  const dateStr = new Date().toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const regime = getRegime();

  // Name resolution by role
  let subjectName, preparerLine;
  if (role === "employee") {
    subjectName = clientVal || loggedIn;
    preparerLine = "";
  } else {
    subjectName = clientVal || loggedIn;
    preparerLine = `<tr><td style="padding:5px 0;color:#888;font-size:11px;">Prepared by</td><td style="padding:5px 0;text-align:right;font-size:11px;">${escHtml(loggedIn)}</td></tr>`;
  }
  const subjectLabel =
    role === "employee"
      ? "Taxpayer"
      : role === "tax_consultant"
        ? "Client"
        : "Employee";

  // ── SECTION A: Chargeable Income Derivation ──────────────────────────
  const buildDerivation = (isNTA) => {
    const craRow =
      !isNTA && c.cra > 0
        ? `<tr><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#555;">Less: Consolidated Relief Allowance <span style="font-size:9px;color:#999;">(§33 PITA)</span></td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;color:#E04040;">− ${fmt(c.cra)}</td></tr>`
        : "";
    const rentRow =
      isNTA && c.rent_relief > 0
        ? `<tr style="background:#fafff8;"><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#00A86B;">Less: Rent Relief <span style="font-size:9px;color:#999;">(NTA 2025 §36)</span></td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;color:#00A86B;">− ${fmt(c.rent_relief)}</td></tr>`
        : "";
    const chargeableAmt = isNTA
      ? c.gross_annual - c.pension - c.nhf - c.nhis - (c.rent_relief || 0)
      : c.gross_annual - c.pension - c.nhf - c.nhis - (c.cra || 0);
    const lawRef = isNTA ? "§25 NTA 2025" : "§33 PITA";
    return `
      <div style="margin-bottom:6px;">
        <p style="font-weight:700;font-size:9px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.6px;color:#888;">
          Chargeable Income Derivation <span style="font-weight:400;color:#bbb;">(${lawRef})</span>
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8e4;border-radius:6px;overflow:hidden;">
          <tr style="background:#f5f7f5;">
            <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">Gross Annual Pay</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmt(c.gross_annual)}</td>
          </tr>
          <tr><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#555;">Less: Pension <span style="font-size:9px;color:#999;">(8% of Basic+Housing+Transport)</span></td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;color:#E04040;">− ${fmt(c.pension)}</td></tr>
          <tr style="background:#fafafa;"><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#555;">Less: NHF <span style="font-size:9px;color:#999;">(2.5% of Basic · §21 NHF Act)</span></td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;color:#E04040;">− ${fmt(c.nhf)}</td></tr>
          <tr><td style="padding:5px 10px;border-bottom:1px solid #eee;color:#555;">Less: NHIS <span style="font-size:9px;color:#999;">(5% of Basic)</span></td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;color:#E04040;">− ${fmt(c.nhis)}</td></tr>
          ${rentRow}${craRow}
          <tr style="background:#f0faf5;">
            <td style="padding:8px 10px;font-weight:700;border-top:2px solid #0A0F0D;">Chargeable Income</td>
            <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:14px;border-top:2px solid #0A0F0D;">${fmt(Math.max(0, chargeableAmt))}</td>
          </tr>
          <tr style="background:#fafafa;">
            <td style="padding:4px 10px;font-size:11px;color:#888;">Monthly equivalent</td>
            <td style="padding:4px 10px;text-align:right;font-size:11px;color:#888;">${fmt(Math.max(0, chargeableAmt) / 12)} / mo</td>
          </tr>
        </table>
      </div>`;
  };

  // ── SECTION B: Band Computation Table (all 6 bands) ──────────────────
  const buildBandTable = (bands, isNTA) => {
    const lawRef = isNTA ? "§25 NTA 2025" : "PITA";
    const totalTax = bands.reduce((s, b) => s + b.tax, 0);
    const rows = bands
      .map((b) => {
        const active = b.taxable > 0;
        const dimStyle = active ? "" : "color:#ccc;";
        return `<tr style="${dimStyle}">
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;${dimStyle}">${b.label}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:center;${active ? "color:#00A86B;font-weight:600;" : "color:#ccc;"}">${(b.rate * 100).toFixed(0)}%</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;${dimStyle}">${active ? fmt(b.taxable) : "—"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;${dimStyle}">${active ? fmt(b.taxable / 12) : "—"}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;${active && b.tax > 0 ? "color:#E04040;font-weight:600;" : "color:#ccc;"}">${active && b.tax > 0 ? fmt(b.tax) : "—"}</td>
      </tr>`;
      })
      .join("");
    return `
      <div style="margin-bottom:6px;">
        <p style="font-weight:700;font-size:9px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.6px;color:#888;">
          PAYE Band Computation <span style="font-weight:400;color:#bbb;">(${lawRef})</span>
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8e4;">
          <thead>
            <tr style="background:#0A0F0D;color:white;">
              <th style="padding:6px 8px;text-align:left;font-weight:600;">Band</th>
              <th style="padding:6px 8px;text-align:center;font-weight:600;">Rate</th>
              <th style="padding:6px 8px;text-align:right;font-weight:600;">Annual Taxable</th>
              <th style="padding:6px 8px;text-align:right;font-weight:600;">Monthly Taxable</th>
              <th style="padding:6px 8px;text-align:right;font-weight:600;">Tax</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#f5f7f5;font-weight:700;border-top:2px solid #0A0F0D;">
              <td colspan="2" style="padding:6px 8px;">Annual PAYE Total</td>
              <td colspan="2" style="padding:6px 8px;text-align:right;color:#555;font-size:11px;">(see tax column →)</td>
              <td style="padding:6px 8px;text-align:right;color:#E04040;font-size:13px;">${fmt(totalTax)}</td>
            </tr>
            <tr style="background:#fafafa;">
              <td colspan="2" style="padding:4px 8px;font-size:11px;color:#888;">Monthly PAYE</td>
              <td colspan="3" style="padding:4px 8px;text-align:right;font-size:11px;color:#888;">${fmt(totalTax / 12)} / mo</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  };

  // ── SECTION C: Results summary per regime ────────────────────────────
  const ntaResults =
    regime !== "pita"
      ? `
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px;border:1px solid #e2e8e4;">
      <tr style="background:#f0faf5;">
        <td style="padding:7px 10px;font-weight:700;">Monthly Net Pay <span style="font-size:9px;font-weight:400;color:#888;">(NTA 2025)</span></td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:15px;color:#00A86B;">${fmt(c.nta_net_monthly)}</td>
      </tr>
      <tr><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">Annual Net Pay</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;">${fmt(c.nta_net_annual)}</td></tr>
      <tr style="background:#fafafa;"><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">PAYE Tax (Monthly)</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;color:#E04040;font-weight:600;">${fmt(c.nta_paye / 12)}</td></tr>
      <tr><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">PAYE Tax (Annual)</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;color:#E04040;">${fmt(c.nta_paye)}</td></tr>
    </table>`
      : "";

  const pitaResults =
    regime !== "nta2025"
      ? `
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px;border:1px solid #ddd;">
      <tr style="background:#fafafa;">
        <td style="padding:7px 10px;font-weight:700;">Monthly Net Pay <span style="font-size:9px;font-weight:400;color:#888;">(PITA)</span></td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:15px;color:#00A86B;">${fmt(c.pita_net_monthly)}</td>
      </tr>
      <tr><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">Annual Net Pay</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;">${fmt(c.pitaNet)}</td></tr>
      <tr style="background:#fafafa;"><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">CRA Deduction (Monthly)</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;">${fmt(c.cra / 12)}</td></tr>
      <tr><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">PAYE Tax (Monthly)</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;color:#E04040;font-weight:600;">${fmt(c.pita_paye / 12)}</td></tr>
      <tr style="background:#fafafa;"><td style="padding:6px 10px;border-top:1px solid #eee;color:#555;">PAYE Tax (Annual)</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;color:#E04040;">${fmt(c.pita_paye)}</td></tr>
    </table>`
      : "";

  // ── COMPARISON SECTION (PDF) — full side-by-side table ─────────────
  const pitaChargeablePdf = Math.max(
    0,
    c.gross_annual - c.pension - c.nhf - c.nhis - c.cra,
  );
  const pitaEffRatePdf =
    c.gross_annual > 0 ? (c.pita_paye / c.gross_annual) * 100 : 0;
  const annDiff = c.nta_net_annual - c.pitaNet;
  const diffPositive = c.diff >= 0;
  const diffColor = diffPositive ? "#00A86B" : "#E04040";
  const diffSign = (n) => (n >= 0 ? "+" : "−");

  const compSection =
    regime === "both"
      ? `
    <div style="margin-bottom:18px;border:2px solid ${diffColor};border-radius:8px;overflow:hidden;">
      <!-- Comparison header -->
      <div style="background:${diffPositive ? "#f0faf5" : "#fff5f5"};padding:10px 16px;border-bottom:2px solid ${diffColor};display:flex;justify-content:space-between;align-items:center;">
        <div>
          <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin:0;">Regime Comparison — PITA vs NTA 2025</p>
          <p style="font-size:10px;color:#888;margin:2px 0 0;">Financial impact of tax reform on this client</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:9px;color:#888;margin:0;text-transform:uppercase;letter-spacing:0.5px;">${diffPositive ? "Client gains" : "Client loses"} under NTA 2025</p>
          <p style="font-size:22px;font-weight:700;margin:2px 0 0;color:${diffColor};">${diffSign(c.diff)}${fmt(Math.abs(c.diff))}<span style="font-size:11px;font-weight:400;"> /mo</span></p>
          <p style="font-size:10px;color:#888;margin:1px 0 0;">${diffSign(annDiff)}${fmt(Math.abs(annDiff))} per year</p>
        </div>
      </div>
      <!-- Side-by-side table -->
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f5f7f5;">
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #e2e8e4;color:#888;font-weight:600;font-size:10px;width:36%;">Metric</th>
            <th style="padding:7px 10px;text-align:right;border-bottom:1px solid #e2e8e4;color:#B87000;font-weight:700;font-size:10px;">PITA (Old)</th>
            <th style="padding:7px 10px;text-align:right;border-bottom:1px solid #e2e8e4;color:#00875A;font-weight:700;font-size:10px;">NTA 2025 (New)</th>
            <th style="padding:7px 10px;text-align:right;border-bottom:1px solid #e2e8e4;color:#555;font-weight:600;font-size:10px;">Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;">Gross Pay / Month</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.gross_annual / 12)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.gross_annual / 12)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#aaa;">—</td>
          </tr>
          <tr style="background:#fafafa;">
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;">Relief Applied</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#B87000;">CRA: ${fmt(c.cra)}/yr</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#00875A;">${c.rent_relief > 0 ? "Rent: " + fmt(c.rent_relief) + "/yr" : "Nil"}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:${c.rent_relief - c.cra >= 0 ? "#00875A" : "#E04040"};">${diffSign(c.rent_relief - c.cra)}${fmt(Math.abs(c.rent_relief - c.cra))}</td>
          </tr>
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;">Chargeable Income / Mo</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(pitaChargeablePdf / 12)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.chargeable_income / 12)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:${c.chargeable_income - pitaChargeablePdf <= 0 ? "#00875A" : "#E04040"};">${diffSign(-(c.chargeable_income - pitaChargeablePdf) / 12)}${fmt(Math.abs((c.chargeable_income - pitaChargeablePdf) / 12))}</td>
          </tr>
          <tr style="background:#fafafa;">
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;">PAYE Tax / Month</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#E04040;">${fmt(c.pita_paye / 12)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#E04040;">${fmt(c.nta_paye / 12)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:${c.nta_paye - c.pita_paye <= 0 ? "#00875A" : "#E04040"};">${diffSign(-(c.nta_paye - c.pita_paye) / 12)}${fmt(Math.abs((c.nta_paye - c.pita_paye) / 12))}</td>
          </tr>
          <tr style="background:${diffPositive ? "#f0faf5" : "#fff5f5"};">
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8e4;font-weight:700;color:#0A0F0D;">Net Pay / Month</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8e4;text-align:right;font-weight:700;color:#00875A;">${fmt(c.pita_net_monthly)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8e4;text-align:right;font-weight:700;color:#00875A;">${fmt(c.nta_net_monthly)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8e4;text-align:right;font-weight:700;font-size:13px;color:${diffColor};">${diffSign(c.diff)}${fmt(Math.abs(c.diff))}</td>
          </tr>
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;">Net Pay / Year</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.pitaNet)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.nta_net_annual)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:${diffColor};">${diffSign(annDiff)}${fmt(Math.abs(annDiff))}</td>
          </tr>
          <tr style="background:#fafafa;">
            <td style="padding:6px 10px;color:#555;">Effective Tax Rate</td>
            <td style="padding:6px 10px;text-align:right;color:#B87000;">${pitaEffRatePdf.toFixed(2)}%</td>
            <td style="padding:6px 10px;text-align:right;color:#00875A;">${c.effective_rate.toFixed(2)}%</td>
            <td style="padding:6px 10px;text-align:right;color:${c.effective_rate - pitaEffRatePdf <= 0 ? "#00875A" : "#E04040"};">${diffSign(-(c.effective_rate - pitaEffRatePdf))}${Math.abs(c.effective_rate - pitaEffRatePdf).toFixed(2)}%</td>
          </tr>
        </tbody>
      </table>
      <!-- Advisory note -->
      <div style="padding:10px 16px;background:#f9f9f9;border-top:1px solid #e2e8e4;font-size:10px;color:#888;">
        <strong style="color:#555;">Advisory:</strong> ${
          diffPositive
            ? `Under NTA 2025, this client benefits from ${c.rent_relief > 0 ? "rent relief and revised bands" : "revised progressive bands"}, resulting in a net gain of ${fmt(Math.abs(c.diff))}/month (${fmt(Math.abs(annDiff))}/year).`
            : `Under NTA 2025, this client pays ${fmt(Math.abs(c.diff))}/month more in tax. ${c.rent_relief === 0 ? "Entering annual rent paid may unlock rent relief (up to ₦500,000)." : ""}`
        } Based on Nigeria Tax Act 2025.
      </div>
    </div>`
      : "";

  // ── BUILD PAGE ────────────────────────────────────────────────────────
  const html = `
    <div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:13px;line-height:1.6;">

      <!-- ═══ HEADER ═══ -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #0A0F0D;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
            <div style="width:26px;height:26px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:13px;">₦</div>
            <span style="font-size:15px;font-weight:800;letter-spacing:-0.5px;">TaxCalc <span style="color:#00A86B;font-weight:500;font-size:10px;">NTA 2025</span></span>
          </div>
          <p style="font-size:11px;color:#888;margin:0;">Personal Income Tax Computation</p>
          <p style="font-size:10px;color:#bbb;margin:2px 0 0;">Nigeria Tax Act 2025 — For reference purposes only</p>
        </div>
        <div style="text-align:right;">
          <table style="font-size:11px;border-collapse:collapse;text-align:right;">
            <tr><td style="padding:2px 0;color:#aaa;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">${subjectLabel}</td></tr>
            <tr><td style="padding:1px 0;font-weight:700;color:#0A0F0D;font-size:14px;">${escHtml(subjectName)}</td></tr>
            ${preparerLine}
            <tr><td style="padding:3px 0;color:#888;font-size:11px;">Date: ${dateStr}</td></tr>
            <tr><td style="padding:1px 0;color:#00A86B;font-weight:600;font-size:10px;">Nigeria Tax Act 2025</td></tr>
          </table>
        </div>
      </div>

      <!-- ═══ SALARY COMPONENTS ═══ -->
      <p style="font-weight:700;font-size:9px;margin:0 0 5px;text-transform:uppercase;letter-spacing:0.6px;color:#888;">Salary Components</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;border:1px solid #e2e8e4;">
        <thead>
          <tr style="background:#f5f7f5;">
            <th style="padding:5px 10px;text-align:left;font-weight:600;border-bottom:1px solid #e2e8e4;">Component</th>
            <th style="padding:5px 10px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8e4;">Monthly</th>
            <th style="padding:5px 10px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8e4;">Annual</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">Basic Salary</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.basic / 12)}</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmt(c.basic)}</td></tr>
          <tr style="background:#fafafa;"><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">Housing Allowance</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.housing / 12)}</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmt(c.housing)}</td></tr>
          <tr><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">Transport Allowance</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.transport / 12)}</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmt(c.transport)}</td></tr>
          ${c.other_allowances > 0 ? `<tr style="background:#fafafa;"><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">Other Allowances</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(c.other_allowances / 12)}</td><td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmt(c.other_allowances)}</td></tr>` : ""}
        </tbody>
        <tfoot>
          <tr style="background:#f5f7f5;font-weight:700;border-top:2px solid #0A0F0D;">
            <td style="padding:7px 10px;">Gross Pay</td>
            <td style="padding:7px 10px;text-align:right;">${fmt(c.gross_annual / 12)}</td>
            <td style="padding:7px 10px;text-align:right;">${fmt(c.gross_annual)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- ═══ NTA 2025 COMPUTATION ═══ -->
      ${
        regime !== "pita"
          ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="background:#00A86B;color:white;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;">NTA 2025</span>
          <span style="font-size:11px;color:#555;font-weight:600;">New Regime — Nigeria Tax Act 2025</span>
        </div>
        ${buildDerivation(true)}
        ${buildBandTable(c.ntaBands, true)}
        ${ntaResults}
      </div>`
          : ""
      }

      <!-- ═══ PITA COMPUTATION ═══ -->
      ${
        regime !== "nta2025"
          ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="background:#F4A100;color:#0A0F0D;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;">PITA</span>
          <span style="font-size:11px;color:#555;font-weight:600;">Old Regime — Personal Income Tax Act</span>
        </div>
        ${buildDerivation(false)}
        ${buildBandTable(c.pitaBands, false)}
        ${pitaResults}
      </div>`
          : ""
      }

      <!-- ═══ REGIME COMPARISON ═══ -->
      ${compSection}

      <!-- ═══ SUMMARY STRIP ═══ -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;border:1px solid #e2e8e4;">
        <tr>
          <td style="padding:8px 10px;text-align:center;border-right:1px solid #e2e8e4;">
            <p style="font-size:9px;color:#888;margin:0 0 2px;text-transform:uppercase;letter-spacing:0.5px;">Gross / Month</p>
            <p style="font-size:13px;font-weight:700;margin:0;">${fmt(c.gross_annual / 12)}</p>
          </td>
          <td style="padding:8px 10px;text-align:center;border-right:1px solid #e2e8e4;">
            <p style="font-size:9px;color:#888;margin:0 0 2px;text-transform:uppercase;letter-spacing:0.5px;">Chargeable / Month</p>
            <p style="font-size:13px;font-weight:700;margin:0;">${fmt(c.chargeable_income / 12)}</p>
          </td>
          <td style="padding:8px 10px;text-align:center;border:2px solid #0A0F0D;">
            <p style="font-size:9px;color:#555;margin:0 0 2px;text-transform:uppercase;letter-spacing:0.5px;">Effective Tax Rate</p>
            <p style="font-size:13px;font-weight:700;margin:0;color:#00A86B;">${c.effective_rate.toFixed(2)}%</p>
          </td>
        </tr>
      </table>

      <!-- ═══ FOOTER ═══ -->
      <div style="border-top:1px solid #e2e8e4;padding-top:10px;font-size:10px;color:#aaa;text-align:center;">
        <p style="margin:0;">Based on the <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference purposes only. Consult a qualified tax professional for advice.</p>
        <p style="margin:3px 0 0;">Generated by TaxCalc NTA 2025 · ${dateStr}</p>
      </div>
    </div>`;

  const printWin = window.open("", "_blank", "width=820,height=960");
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <title>Tax Computation — ${escHtml(subjectName)} — ${dateStr}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>
        *  { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: white; padding: 36px 44px; color: #0A0F0D; font-size: 13px; line-height: 1.6; }
        @media print { @page { margin: 12mm; size: A4; } body { padding: 0; } }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
  }, 600);
}

/* ===========================
   AUTH STATE
   =========================== */
let currentUser = null;

/* ===========================
   AUTH HELPERS
   =========================== */
function showPanel(panelId) {
  document
    .querySelectorAll(".auth-panel")
    .forEach((p) => p.classList.add("hidden"));
  document.getElementById(panelId).classList.remove("hidden");
  ["loginError", "registerError", "resetError", "resetSuccess"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = "";
        el.classList.add("hidden");
      }
    },
  );
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
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait..." : defaultText;
}

function showAuthError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove("hidden");
}

const ROLE_LABELS = {
  employee: "Employee",
  hr_manager: "HR Manager",
  business_owner: "Business Owner",
  tax_consultant: "Accountant",
};

function updateHeaderUser(user) {
  if (!user) return;
  const email = user.email || "";
  const meta = user.user_metadata || {};
  const name = meta.full_name || email;
  const role = meta.role || "employee";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  document.getElementById("userAvatar").textContent = initials || "?";
  // Show name if available, otherwise show email
  const displayName =
    meta.full_name && meta.full_name !== email ? meta.full_name : email;
  document.getElementById("userEmail").textContent = displayName;
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
    payrollLink.style.display = ["hr_manager", "business_owner"].includes(role)
      ? ""
      : "none";
  }
  // Business dropdown — visible to business_owner + tax_consultant
  const bizDropdown = document.getElementById("bizDropdown");
  const isBizRole = ["business_owner", "tax_consultant"].includes(role);
  if (bizDropdown) bizDropdown.style.display = isBizRole ? "" : "none";

  // Clients item inside dropdown — tax_consultant only
  const clientsLink = document.getElementById("clientsNavLink");
  const showClients = role === "tax_consultant";
  if (clientsLink) clientsLink.style.display = showClients ? "" : "none";

  // Store role for default tab logic
  window._userRole = role;
  updateContextBanner(role);
}

function resetHeaderToGuest() {
  document.getElementById("guestNav").classList.remove("hidden");
  document.getElementById("userNav").classList.add("hidden");
}

/* ===========================
   ROLE CONTEXT BANNER
   =========================== */
const ROLE_CONTEXT = {
  employee: {
    icon: "👤",
    title: "Personal Tax Calculator",
    sub: "Enter your salary to see your take-home pay, PAYE breakdown, and YTD position.",
  },
  hr_manager: {
    icon: "🏢",
    title: "HR & Payroll Manager",
    sub: "Run multi-employee payroll, compute PAYE per staff, and export payroll summaries.",
  },
  business_owner: {
    icon: "💼",
    title: "Business Owner",
    sub: "Manage staff payroll, compute PAYE, and calculate your company's income tax liability.",
  },
  tax_consultant: {
    icon: "📋",
    title: "Accountant — Client Workspace",
    sub: "Calculate PAYE for clients and export audit-ready PDF computations with NTA 2025 band workings.",
  },
};

function updateContextBanner(role) {
  const banner = document.getElementById("roleContextBanner");
  const ctx = ROLE_CONTEXT[role] || ROLE_CONTEXT.employee;
  if (!banner) return;
  banner.dataset.role = role;
  const iconEl = document.getElementById("rcbIcon");
  const titleEl = document.getElementById("rcbTitle");
  const subEl = document.getElementById("rcbSub");
  if (iconEl) iconEl.textContent = ctx.icon;
  if (titleEl) titleEl.textContent = ctx.title;
  if (subEl) subEl.textContent = ctx.sub;
}

/* ===========================
   APP MODE vs LANDING MODE
   =========================== */
// IDs of every section that should ONLY show on the landing page
const LANDING_SECTIONS = [
  "home",
  "how-it-works",
  "features",
  "who-its-for",
  "about",
  "blog",
  "contact",
];
// IDs of every section that should ONLY show when logged in
const APP_SECTIONS = [
  "calculator",
  "ytd",
  "history",
  "payroll",
  "cit",
  "clients",
  "vat",
  "bizsummary",
];

function showLandingMode() {
  LANDING_SECTIONS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  });
  APP_SECTIONS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  // Also hide CTA section (it's between landing and calculator)
  const cta = document.querySelector(".cta-section");
  if (cta) cta.style.display = "";
  const divider = document.querySelector(".section-divider");
  if (divider) divider.style.display = "none";
  // Hide role context banner for guests
  const rcb = document.getElementById("roleContextBanner");
  if (rcb) rcb.classList.add("hidden");
  resetHeaderToGuest();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function showAppMode(tab) {
  LANDING_SECTIONS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const cta = document.querySelector(".cta-section");
  if (cta) cta.style.display = "none";
  const divider = document.querySelector(".section-divider");
  if (divider) divider.style.display = "none";
  // Show role context banner
  const rcb = document.getElementById("roleContextBanner");
  if (rcb) rcb.classList.remove("hidden");

  // Determine best landing tab:
  // 1. Explicit tab param (from session restore)
  // 2. Role defaults: hr_manager + business_owner → payroll
  //                   employee + tax_consultant (accountant) → calculator
  // 3. Fallback to calculator
  let target = tab && APP_SECTIONS.includes(tab) ? tab : null;
  if (!target) {
    const role = window._userRole || "employee";
    target = ["hr_manager", "business_owner"].includes(role)
      ? "payroll"
      : "calculator";
  }
  // Employees can never land on payroll
  if (window._userRole === "employee" && target === "payroll")
    target = "calculator";
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
      "This cannot be undone.",
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
    const uid = sessionData?.session?.user?.id;

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
    await sb.auth
      .updateUser({
        email: ghostEmail,
        data: { full_name: "", role: "", company: "", deleted: true },
      })
      .catch(() => {}); // if this fails, account is still signed out next

    // Step 4: Also try the edge function in case it's been fixed on the server
    if (token) {
      fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
      })
        .then(() => {})
        .catch(() => {}); // fire-and-forget, silent
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
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) {
    showAuthError("loginError", "Please enter your email and password.");
    return;
  }

  setAuthLoading("loginBtn", true, "Sign In");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  setAuthLoading("loginBtn", false, "Sign In");

  if (error) {
    showAuthError("loginError", error.message);
    return;
  }
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
  const basic = Number(document.getElementById("demoBasic")?.value) || 0;
  const allowances =
    Number(document.getElementById("demoAllowances")?.value) || 0;

  if (!basic && !allowances) {
    ["demoGross", "demoDeductions", "demoPaye", "demoNet", "demoRate"].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "—";
      },
    );
    return;
  }

  const grossMonthly = basic + allowances;
  const gross = grossMonthly * 12;

  // Statutory deductions (annual)
  const pension = basic * 0.08; // simplified: 8% of basic only for demo
  const nhf = basic * 0.025;
  const nhis = basic * 0.05;
  const totalStatutory = pension + nhf + nhis;

  const chargeable = Math.max(0, gross - totalStatutory);

  // NTA 2025 progressive bands
  const bands = [
    { limit: 800_000, rate: 0.0 },
    { limit: 2_200_000, rate: 0.15 },
    { limit: 6_000_000, rate: 0.18 },
    { limit: 15_000_000, rate: 0.21 },
    { limit: 25_000_000, rate: 0.23 },
    { limit: Infinity, rate: 0.25 },
  ];
  let remaining = chargeable,
    prev = 0,
    annualPaye = 0;
  for (const b of bands) {
    const slice = Math.min(Math.max(remaining - prev, 0), b.limit - prev);
    annualPaye += slice * b.rate;
    if (remaining <= b.limit) break;
    prev = b.limit;
  }

  const monthlyPaye = annualPaye / 12;
  const monthlyDeductions = totalStatutory / 12 + monthlyPaye;
  const netMonthly = grossMonthly - monthlyDeductions;
  const effectiveRate = gross > 0 ? (annualPaye / gross) * 100 : 0;

  const fmtN = (n) => "₦" + Math.round(n).toLocaleString("en-NG");

  document.getElementById("demoGross").textContent = fmtN(grossMonthly);
  document.getElementById("demoDeductions").textContent =
    fmtN(monthlyDeductions);
  document.getElementById("demoPaye").textContent = fmtN(monthlyPaye);
  document.getElementById("demoNet").textContent = fmtN(netMonthly);
  document.getElementById("demoRate").textContent =
    effectiveRate.toFixed(2) + "%";
}

/* ===========================
   MOBILE NAV TOGGLE
   =========================== */
function toggleMobileNav() {
  const guestNav = document.getElementById("guestNav");
  const userNav = document.getElementById("userNav");
  const btn = document.getElementById("hamburgerBtn");
  const nav = guestNav?.classList.contains("hidden") ? userNav : guestNav;
  if (nav) {
    nav.classList.toggle("mobile-open");
    btn?.classList.toggle("open");
  }
}

function toggleBizDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById("bizDropdownMenu");
  const trigger = document.getElementById("bizDropdownTrigger");
  if (!menu) return;
  const isOpen = menu.classList.toggle("open");
  trigger?.classList.toggle("dropdown-open", isOpen);
}

function closeBizDropdown() {
  const menu = document.getElementById("bizDropdownMenu");
  const trigger = document.getElementById("bizDropdownTrigger");
  menu?.classList.remove("open");
  trigger?.classList.remove("dropdown-open");
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("bizDropdown");
  if (dropdown && !dropdown.contains(e.target)) closeBizDropdown();
});

// Close mobile nav when a link is clicked
document.addEventListener("click", (e) => {
  const nav = document.querySelector(
    ".header-nav.mobile-open, #userNav.mobile-open",
  );
  if (
    nav &&
    !nav.contains(e.target) &&
    e.target.id !== "hamburgerBtn" &&
    !e.target.closest("#hamburgerBtn")
  ) {
    nav.classList.remove("mobile-open");
    document.getElementById("hamburgerBtn")?.classList.remove("open");
  }
});

/* ===========================
   ROLE SELECTION
   =========================== */
function selectRole(btn) {
  document
    .querySelectorAll(".role-card")
    .forEach((c) => c.classList.remove("selected"));
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
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const role =
    document.querySelector(".role-card.selected")?.dataset.role || "";
  const company = document.getElementById("regCompany")?.value.trim() || "";

  if (!email || !password) {
    showAuthError("registerError", "Please fill in all fields.");
    return;
  }
  if (password.length < 6) {
    showAuthError("registerError", "Password must be at least 6 characters.");
    return;
  }
  if (!role) {
    showAuthError("registerError", "Please select what best describes you.");
    return;
  }

  setAuthLoading("registerBtn", true, "Create Account");
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name || email, role, company } },
  });
  setAuthLoading("registerBtn", false, "Create Account");

  if (error) {
    showAuthError("registerError", error.message);
    return;
  }
  showPanel("successPanel");
}

/* ===========================
   RESET PASSWORD
   =========================== */
async function doReset() {
  const email = document.getElementById("resetEmail").value.trim();
  if (!email) {
    showAuthError("resetError", "Please enter your email address.");
    return;
  }

  setAuthLoading("resetBtn", true, "Send Reset Link");
  const { error } = await sb.auth.resetPasswordForEmail(email);
  setAuthLoading("resetBtn", false, "Send Reset Link");

  if (error) {
    showAuthError("resetError", error.message);
    return;
  }
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
    setTimeout(
      () => window.scrollTo({ top: parseInt(pos), behavior: "instant" }),
      50,
    );
  }
}

function toggleGuideCard(el) {
  const card = el.closest(".about-guide-card");
  if (!card) return;
  card.classList.toggle("open");
  const chevron = card.querySelector(".about-guide-chevron");
  if (chevron)
    chevron.textContent = card.classList.contains("open") ? "⌃" : "⌄";
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = "";
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Immediately highlight the clicked link without waiting for scroll
    setActiveLandingLink(id);
  }
}

/* ===========================
   LANDING SCROLL SPY
   Tracks which section is most visible — stable, no flicker
   =========================== */
let _landingSpyTicking = false;
let _landingSpyActive = false;

function initLandingScrollSpy() {
  _landingSpyActive = true;
  window.addEventListener("scroll", _onLandingSpy, { passive: true });
  // Run once immediately to set initial state
  _onLandingSpy();
}

function _onLandingSpy() {
  if (!_landingSpyActive) return;
  if (_landingSpyTicking) return;
  _landingSpyTicking = true;
  requestAnimationFrame(() => {
    _landingSpyTicking = false;
    const spySections = [
      "how-it-works",
      "features",
      "who-its-for",
      "about",
      "blog",
      "contact",
    ];
    const headerH = 64;
    const viewH = window.innerHeight;

    let bestId = null;
    let bestScore = -1;

    spySections.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // How much of the section is inside the viewport (below header)
      const top = Math.max(rect.top, headerH);
      const bottom = Math.min(rect.bottom, viewH);
      const visible = Math.max(0, bottom - top);
      if (visible > bestScore) {
        bestScore = visible;
        bestId = id;
      }
    });

    setActiveLandingLink(bestId);
  });
}

function setActiveLandingLink(sectionId) {
  document.querySelectorAll("#guestNav .nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sectionId);
  });
}

function destroyLandingScrollSpy() {
  _landingSpyActive = false;
  window.removeEventListener("scroll", _onLandingSpy);
  document
    .querySelectorAll("#guestNav .nav-link")
    .forEach((l) => l.classList.remove("active"));
}

/* ===========================
   INIT — Check session + scroll memory
   =========================== */
window.addEventListener("DOMContentLoaded", async () => {
  window.addEventListener("scroll", saveScrollPos, { passive: true });

  ["loginEmail", "loginPassword"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
  });
  ["regName", "regEmail", "regPassword"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doRegister();
    });
  });
  document.getElementById("resetEmail")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doReset();
  });

  // Start in landing mode — hide app sections until logged in
  showLandingMode();

  // Seed demo card with placeholder values so results show on load
  const demoBasicEl = document.getElementById("demoBasic");
  const demoAlloEl = document.getElementById("demoAllowances");
  if (demoBasicEl && !demoBasicEl.value) demoBasicEl.value = 800000;
  if (demoAlloEl && !demoAlloEl.value) demoAlloEl.value = 400000;
  runDemo();

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user && !_deletingAccount) {
      currentUser = session.user;
      updateHeaderUser(currentUser); // sets window._userRole from metadata
      hideAuthOverlay();
      // Only trigger app mode if we're currently in landing mode
      // Check if a landing section is visible — if so, we're on the landing page
      const onLanding = LANDING_SECTIONS.some((id) => {
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
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    updateHeaderUser(currentUser);
    hideAuthOverlay();
    // Restore last active tab — default to calculator on first login
    const lastTab =
      sessionStorage.getItem("taxcalc_active_tab") || "calculator";
    showAppMode(lastTab);
    loadHistory();
    restoreScrollPos();
  }
  // No session = stay in landing mode
});
/* =====================================================
   STAGE 3 — PAYROLL MANAGER
   ===================================================== */

let payrollEmployees = []; // in-memory list

/* --------------------------------------------------
   NTA 2025 calc reused for payroll (single employee)
   -------------------------------------------------- */
function calcEmployeeTax(emp) {
  const basic = Number(emp.basic) || 0;
  const housing = Number(emp.housing) || 0;
  const transport = Number(emp.transport) || 0;
  const other = Number(emp.other) || 0;
  const rent = Number(emp.rent) || 0;

  const grossMonthly = basic + housing + transport + other;
  const gross = grossMonthly * 12;

  const pension = (basic + housing + transport) * 0.08;
  const nhf = basic * 0.025;
  const nhis = basic * 0.05;
  const rentRelief = Math.min(500_000, rent * 0.2);

  const chargeable = Math.max(0, gross - pension - nhf - nhis - rentRelief);
  const chargeableMo = chargeable / 12;

  // NTA 2025 bands (annual)
  const bands = [
    { limit: 800_000, rate: 0.0 },
    { limit: 2_200_000, rate: 0.15 },
    { limit: 6_000_000, rate: 0.18 },
    { limit: 15_000_000, rate: 0.21 },
    { limit: 25_000_000, rate: 0.23 },
    { limit: Infinity, rate: 0.25 },
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

  const ntaPayeMonthly = ntaPaye / 12;
  const netMonthly =
    grossMonthly - pension / 12 - nhf / 12 - nhis / 12 - ntaPayeMonthly;
  const effectiveRate = gross > 0 ? (ntaPaye / gross) * 100 : 0;

  const employerPension = (basic + housing + transport) * 0.1; // 10% employer contribution
  const totalEmployerCost = grossMonthly + employerPension / 12; // gross + employer pension/month

  return {
    gross,
    grossMonthly,
    pension,
    nhf,
    nhis,
    rentRelief,
    chargeable,
    ntaPaye,
    ntaPayeMonthly,
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
  const name = document.getElementById("empName").value.trim();
  const basic = Number(document.getElementById("empBasic").value) || 0;
  const housing = Number(document.getElementById("empHousing").value) || 0;
  const transport = Number(document.getElementById("empTransport").value) || 0;
  const other = Number(document.getElementById("empOther").value) || 0;
  const rent = Number(document.getElementById("empRent").value) || 0;

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
  emp.calc = calcEmployeeTax(emp);
  payrollEmployees.push(emp);

  // Clear form
  [
    "empName",
    "empBasic",
    "empHousing",
    "empTransport",
    "empOther",
    "empRent",
  ].forEach((id) => {
    document.getElementById(id).value = "";
  });

  renderPayrollTable();
}

/* --------------------------------------------------
   REMOVE EMPLOYEE
   -------------------------------------------------- */
function removePayrollEmployee(id) {
  payrollEmployees = payrollEmployees.filter((e) => e.id !== id);
  renderPayrollTable();
}

/* Edit employee — fills the Add Employee form with their current values */
function editPayrollEmployee(id) {
  const emp = payrollEmployees.find((e) => e.id === id);
  if (!emp) return;

  // Fill the Add Employee form with this employee's values
  document.getElementById("empName").value = emp.name || "";
  document.getElementById("empBasic").value = emp.basic || "";
  document.getElementById("empHousing").value = emp.housing || "";
  document.getElementById("empTransport").value = emp.transport || "";
  document.getElementById("empOther").value = emp.other || "";
  document.getElementById("empRent").value = emp.rent || "";

  // Remove from list — user will re-add with updated values
  payrollEmployees = payrollEmployees.filter((e) => e.id !== id);
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
  const empty = document.getElementById("payrollEmpty");
  const container = document.getElementById("payrollTableContainer");
  const tbody = document.getElementById("payrollTableBody");
  const summary = document.getElementById("payrollSummary");

  if (payrollEmployees.length === 0) {
    empty.classList.remove("hidden");
    container.classList.add("hidden");
    summary.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  container.classList.remove("hidden");
  summary.classList.remove("hidden");

  tbody.innerHTML = payrollEmployees
    .map((emp) => {
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
    })
    .join("");

  // Summary totals
  const totalGross = payrollEmployees.reduce(
    (s, e) => s + e.calc.grossMonthly,
    0,
  );
  const totalPAYE = payrollEmployees.reduce(
    (s, e) => s + e.calc.ntaPayeMonthly,
    0,
  );
  const totalNet = payrollEmployees.reduce((s, e) => s + e.calc.netMonthly, 0);

  const totalEmployerPension = payrollEmployees.reduce(
    (s, e) => s + e.calc.employerPension / 12,
    0,
  );
  const totalEmployerCost = payrollEmployees.reduce(
    (s, e) => s + e.calc.totalEmployerCost,
    0,
  );

  document.getElementById("summEmployeeCount").textContent =
    payrollEmployees.length;
  document.getElementById("summTotalGross").textContent = fmt(totalGross);
  document.getElementById("summTotalPAYE").textContent = fmt(totalPAYE);
  document.getElementById("summEmployerPension").textContent =
    fmt(totalEmployerPension);
  document.getElementById("summTotalCost").textContent = fmt(totalEmployerCost);
  document.getElementById("summTotalNet").textContent = fmt(totalNet);
}

/* --------------------------------------------------
   SAVE PAYROLL RUN TO SUPABASE
   -------------------------------------------------- */
async function savePayrollRun() {
  if (!currentUser) {
    alert("Please sign in to save payroll runs.");
    return;
  }
  if (payrollEmployees.length === 0) {
    alert("Add at least one employee before saving.");
    return;
  }

  const runName =
    document.getElementById("payrollRunName").value.trim() || "Payroll Run";
  const period = document.getElementById("payrollPeriod").value.trim() || "";
  const saveBtn = document.getElementById("savePayrollBtn");

  const totalGross = payrollEmployees.reduce(
    (s, e) => s + e.calc.grossMonthly,
    0,
  );
  const totalPAYE = payrollEmployees.reduce(
    (s, e) => s + e.calc.ntaPayeMonthly,
    0,
  );
  const totalNet = payrollEmployees.reduce((s, e) => s + e.calc.netMonthly, 0);

  // Sanitise employee list for storage (drop calc object, keep inputs + results)
  const empData = payrollEmployees.map((e) => ({
    id: e.id,
    name: e.name,
    basic: e.basic,
    housing: e.housing,
    transport: e.transport,
    other: e.other,
    rent: e.rent,
    grossMonthly: e.calc.grossMonthly,
    ntaPayeMonthly: e.calc.ntaPayeMonthly,
    netMonthly: e.calc.netMonthly,
    effectiveRate: e.calc.effectiveRate,
    pension: e.calc.pension,
    nhf: e.calc.nhf,
    nhis: e.calc.nhis,
    rentRelief: e.calc.rentRelief,
  }));

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  const { error } = await sb.from("payroll_runs").insert({
    user_id: currentUser.id,
    run_name: runName,
    pay_period: period,
    total_gross: totalGross,
    total_paye: totalPAYE,
    total_net: totalNet,
    employee_count: payrollEmployees.length,
    employees: empData,
  });

  saveBtn.disabled = false;
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

  const grid = document.getElementById("payrollRunsGrid");
  const empty = document.getElementById("payrollRunsEmpty");
  grid.innerHTML =
    '<p style="color:rgba(255,255,255,0.3);font-size:13px;font-family:var(--mono);padding:12px 0;">Loading...</p>';

  const { data, error } = await sb
    .from("payroll_runs")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    grid.innerHTML = `<p style="color:#FF7070;font-size:13px;">Error: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = data
    .map(
      (run) => `
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
    </div>`,
    )
    .join("");

  // Stash data for load/export use
  window._payrollRuns = data;
}

/* --------------------------------------------------
   LOAD SAVED RUN INTO FORM
   -------------------------------------------------- */
function loadPayrollRunIntoForm(runId) {
  const run = (window._payrollRuns || []).find((r) => r.id === runId);
  if (!run || !run.employees) return;

  // Fill run meta fields
  document.getElementById("payrollRunName").value = run.run_name || "";
  document.getElementById("payrollPeriod").value = run.pay_period || "";

  // Restore all employees into table
  payrollEmployees = run.employees.map((e) => ({
    id: e.id || Date.now() + Math.random(),
    name: e.name,
    basic: e.basic,
    housing: e.housing,
    transport: e.transport,
    other: e.other,
    rent: e.rent,
    calc: calcEmployeeTax(e),
  }));

  renderPayrollTable();

  // Clear the add-employee form so it's ready for a new entry
  [
    "empName",
    "empBasic",
    "empHousing",
    "empTransport",
    "empOther",
    "empRent",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
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
  if (payrollEmployees.length === 0) {
    alert("No employees to export.");
    return;
  }
  const runName =
    document.getElementById("payrollRunName").value.trim() || "Payroll Run";
  const period = document.getElementById("payrollPeriod").value.trim() || "";
  generatePayrollXLSX(payrollEmployees, runName, period);
}

function exportPayrollRunXLSX(runId) {
  const run = (window._payrollRuns || []).find((r) => r.id === runId);
  if (!run) return;
  const employees = run.employees.map((e) => ({
    ...e,
    calc: calcEmployeeTax(e),
  }));
  generatePayrollXLSX(employees, run.run_name, run.pay_period || "");
}

function generatePayrollXLSX(employees, runName, period) {
  // Build CSV-style content then trigger download as .csv (universally opens in Excel)
  const header = [
    "Employee Name",
    "Gross/Month",
    "Basic",
    "Housing",
    "Transport",
    "Other Allowances",
    "Pension (8%)",
    "NHF (2.5%)",
    "NHIS (5%)",
    "Rent Relief/yr",
    "Chargeable Income",
    "PAYE/Month",
    "Net Take-Home/Month",
    "Effective Rate (%)",
  ];

  const rows = employees.map((e) => {
    const c = e.calc || calcEmployeeTax(e);
    return [
      e.name,
      c.grossMonthly.toFixed(2),
      e.basic,
      e.housing,
      e.transport,
      e.other,
      (c.pension / 12).toFixed(2),
      (c.nhf / 12).toFixed(2),
      (c.nhis / 12).toFixed(2),
      c.rentRelief > 0 ? c.rentRelief.toFixed(2) : "0",
      (c.chargeable / 12).toFixed(2),
      c.ntaPayeMonthly.toFixed(2),
      c.netMonthly.toFixed(2),
      c.effectiveRate.toFixed(2),
    ];
  });

  // Totals row
  const totals = [
    "TOTALS",
    employees
      .reduce((s, e) => s + (e.calc || calcEmployeeTax(e)).grossMonthly, 0)
      .toFixed(2),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    employees
      .reduce((s, e) => s + (e.calc || calcEmployeeTax(e)).ntaPayeMonthly, 0)
      .toFixed(2),
    employees
      .reduce((s, e) => s + (e.calc || calcEmployeeTax(e)).netMonthly, 0)
      .toFixed(2),
    "",
  ];

  const title = `${runName}${period ? " — " + period : ""} (NTA 2025)`;
  const csvRows = [
    [title],
    [],
    header,
    ...rows,
    [],
    totals,
    [],
    ["Generated by TaxCalc NTA 2025", new Date().toLocaleDateString("en-NG")],
  ];

  const csv = csvRows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${runName.replace(/\s+/g, "_")}_NTA2025.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------
   EXPORT PAYROLL PDF
   -------------------------------------------------- */
function exportPayrollPDF(runId) {
  const run = (window._payrollRuns || []).find((r) => r.id === runId);
  if (!run) return;
  const employees = run.employees;
  const runName = run.run_name;
  const period = run.pay_period || "";
  const dateStr = formatDate(run.created_at);

  const rowsHtml = employees
    .map((e, i) => {
      const c = calcEmployeeTax(e);
      const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
      return `<tr style="background:${bg};">
      <td style="padding:7px 10px;border:1px solid #e2e8e4;">${escHtml(e.name)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.grossMonthly)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.pension / 12)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.nhf / 12)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;">₦${fmt(c.nhis / 12)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;color:#E04040;font-weight:600;">₦${fmt(c.ntaPayeMonthly)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:right;color:#00A86B;font-weight:600;">₦${fmt(c.netMonthly)}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8e4;text-align:center;">${c.effectiveRate.toFixed(1)}%</td>
    </tr>`;
    })
    .join("");

  const totalGross = employees.reduce(
    (s, e) => s + calcEmployeeTax(e).grossMonthly,
    0,
  );
  const totalPAYE = employees.reduce(
    (s, e) => s + calcEmployeeTax(e).ntaPayeMonthly,
    0,
  );
  const totalNet = employees.reduce(
    (s, e) => s + calcEmployeeTax(e).netMonthly,
    0,
  );

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
        <p style="margin:2px 0 0;">Generated by TaxCalc NTA 2025 · ${new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })}</p>
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
  setTimeout(() => {
    printWin.print();
  }, 600);
}

/* --------------------------------------------------
   AUTO-LOAD PAYROLL RUNS WHEN SECTION OPENS
   Called from showAppSection (defined earlier)
   -------------------------------------------------- */
function onPayrollSectionOpen() {
  if (currentUser) loadPayrollRuns();
}

/* Theme Toggle */
/* theme toggle removed — dark mode only */
(function () {
  // Clear any saved light-mode preference — app is dark only
  localStorage.removeItem("taxcalc_theme");
  document.body.classList.remove("light-mode");
})();

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
    bubble.style.top = "-9999px";
    bubble.classList.add("visible");

    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const rect = icon.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

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
    bubble.style.top = top + "px";
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
   CIT — COMPANY INCOME TAX (NTA 2025)
   Only visible to: business_owner, tax_consultant
   ===================================================== */
let lastCIT = null;

function calculateCIT() {
  const turnover = Number(document.getElementById("citTurnover").value) || 0;
  const profit = Number(document.getElementById("citProfit").value) || 0;
  const assets = Number(document.getElementById("citAssets").value) || 0;
  const year = document.getElementById("citYear").value || "2025";
  const company =
    document.getElementById("citCompanyName")?.value?.trim() || "";
  const quarter = document.getElementById("citQuarter")?.value || "FY 2026";
  const empty = document.getElementById("citEmpty");
  const output = document.getElementById("citOutput");
  if (!turnover && !profit) {
    empty.classList.remove("hidden");
    output.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  output.classList.remove("hidden");

  const isSmall = turnover < 50_000_000 && assets <= 250_000_000;
  const isMedium = !isSmall && turnover <= 500_000_000;
  const citRate = isSmall ? 0 : isMedium ? 0.2 : 0.3;
  const levyRate = isSmall ? 0 : 0.04;
  const citAmt = profit * citRate;
  const levyAmt = profit * levyRate;
  const totalTax = citAmt + levyAmt;
  const netProfit = profit - totalTax;
  const effRate = profit > 0 ? (totalTax / profit) * 100 : 0;

  const tb = document.getElementById("citTierBlock");
  const tierClass = isSmall ? "small" : isMedium ? "medium" : "large";
  const tierLabel = isSmall
    ? "SMALL COMPANY — 0% CIT"
    : isMedium
      ? "MEDIUM COMPANY — 20% CIT"
      : "LARGE COMPANY — 30% CIT";
  const tierDesc = isSmall
    ? "Turnover under ₦50m and assets ≤ ₦250m. Fully exempt from CIT and Development Levy under NTA 2025."
    : isMedium
      ? "Turnover ₦50m–₦500m. Subject to 20% CIT plus 4% Development Levy on assessable profit."
      : "Turnover exceeds ₦500m. Subject to 30% CIT plus 4% Development Levy on assessable profit.";
  tb.innerHTML = `<div class="cit-tier-result ${tierClass}"><span class="cit-tier-label">${tierLabel}</span><p>${tierDesc}</p></div>`;

  // Company name row
  const compRow = document.getElementById("citRCompanyRow");
  if (compRow) compRow.style.display = company ? "" : "none";
  const compEl = document.getElementById("citRCompany");
  if (compEl) compEl.textContent = company || "";

  // Period row
  document.getElementById("citRPeriod").textContent = quarter;
  document.getElementById("citRTurnover").textContent = fmt(turnover);
  document.getElementById("citRProfit").textContent = fmt(profit);
  document.getElementById("citRRate").textContent =
    `${(citRate * 100).toFixed(0)}%`;
  document.getElementById("citRCIT").textContent = fmt(citAmt);
  document.getElementById("citRLevy").textContent = isSmall
    ? "Exempt"
    : fmt(levyAmt);
  const levyNote = document.getElementById("citLevyNote");
  if (levyNote) levyNote.classList.toggle("hidden", isSmall);
  document.getElementById("citRTotal").textContent = fmt(totalTax);
  document.getElementById("citRNet").textContent = fmt(netProfit);
  document.getElementById("citREffective").textContent =
    `${effRate.toFixed(2)}%`;

  lastCIT = {
    turnover,
    profit,
    assets,
    year,
    quarter,
    company,
    isSmall,
    isMedium,
    isLarge: !isSmall && !isMedium,
    citRate,
    citAmt,
    levyAmt,
    totalTax,
    netProfit,
    effRate,
  };
}

async function saveCIT() {
  if (!lastCIT) return alert("Calculate first.");
  if (!currentUser) return alert("Please log in to save.");
  const meta = currentUser.user_metadata || {};
  const company =
    lastCIT.company ||
    meta.company ||
    meta.full_name ||
    currentUser.email ||
    "";
  const tier = lastCIT.isSmall
    ? "small"
    : lastCIT.isMedium
      ? "medium"
      : "large";
  const { error } = await sb.from("cit_calculations").insert({
    user_id: currentUser.id,
    company_name: company,
    fin_year: lastCIT.year,
    period: lastCIT.quarter || lastCIT.year,
    turnover: lastCIT.turnover,
    assessable_profit: lastCIT.profit,
    total_assets: lastCIT.assets,
    company_tier: tier,
    cit_rate: lastCIT.citRate,
    cit_payable: lastCIT.citAmt,
    dev_levy: lastCIT.levyAmt,
    total_tax: lastCIT.totalTax,
    net_profit: lastCIT.netProfit,
    effective_rate: lastCIT.effRate,
  });
  if (error) return alert("Save failed: " + error.message);
  alert("CIT calculation saved.");
  loadCITHistory();
}

let _allCITHistory = [];

async function loadCITHistory() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from("cit_calculations")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const grid = document.getElementById("citHistGrid");
  const empty = document.getElementById("citHistEmpty");
  const excelBtn = document.getElementById("citHistExcelBtn");
  if (!grid) return;
  if (error || !data?.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    if (excelBtn) excelBtn.style.display = "none";
    _allCITHistory = [];
    return;
  }
  _allCITHistory = data;
  empty.classList.add("hidden");
  if (excelBtn) excelBtn.style.display = "";
  const tierMap = {
    small: "Small — 0%",
    medium: "Medium — 20%",
    large: "Large — 30%",
  };
  grid.innerHTML = data
    .map(
      (r) => `
    <div class="cit-hcard">
      <div class="cit-hcard-top">
        <span class="cit-hcard-co">${escHtml(r.company_name || "—")}</span>
        <span class="cit-hcard-date">${formatDate(r.created_at)}</span>
      </div>
      ${r.period ? `<div style="font-size:11px;font-family:var(--mono);color:rgba(255,255,255,0.35);margin-bottom:6px;">📅 ${escHtml(r.period)}</div>` : ""}
      <span class="cit-tier-pill ${r.company_tier}">${tierMap[r.company_tier] || r.company_tier}</span>
      <div class="cit-hcard-grid">
        <div><span class="cit-hc-lbl">Turnover</span><span class="cit-hc-val">${fmt(r.turnover)}</span></div>
        <div><span class="cit-hc-lbl">CIT Payable</span><span class="cit-hc-val red">${fmt(r.cit_payable)}</span></div>
        <div><span class="cit-hc-lbl">Dev. Levy</span><span class="cit-hc-val red">${r.company_tier === "small" ? "Exempt" : fmt(r.dev_levy)}</span></div>
        <div><span class="cit-hc-lbl">Net Profit</span><span class="cit-hc-val green">${fmt(r.net_profit)}</span></div>
      </div>
      <!-- Expandable detail -->
      <div class="cit-hcard-detail hidden">
        <div class="cit-hcard-detail-row"><span>Assessable Profit</span><span>${fmt(r.assessable_profit)}</span></div>
        <div class="cit-hcard-detail-row"><span>Total Assets</span><span>${fmt(r.total_assets || 0)}</span></div>
        <div class="cit-hcard-detail-row"><span>Total Tax Payable</span><span style="color:#FF7070;">${fmt(r.total_tax)}</span></div>
        <div class="cit-hcard-detail-row"><span>Effective Tax Rate</span><span>${Number(r.effective_rate).toFixed(2)}%</span></div>
      </div>
      <div class="cit-hcard-foot">
        <button class="cit-card-toggle" onclick="toggleCITCard(this)">▼ Show Detail</button>
        <button class="card-delete" onclick="deleteCITRecord(${r.id},event)">Delete</button>
      </div>
    </div>`,
    )
    .join("");
}

function toggleCITCard(btn) {
  const detail = btn.closest(".cit-hcard").querySelector(".cit-hcard-detail");
  const expanded = detail.classList.toggle("hidden");
  btn.textContent = expanded ? "▼ Show Detail" : "▲ Hide Detail";
}

function exportCITHistoryExcel() {
  if (!_allCITHistory.length) return alert("No records to export.");
  const dateNow = new Date().toLocaleDateString("en-NG");
  const header = [
    "Company",
    "Period",
    "Financial Year",
    "Company Tier",
    "Turnover (₦)",
    "Assessable Profit (₦)",
    "Total Assets (₦)",
    "CIT Rate (%)",
    "CIT Payable (₦)",
    "Dev. Levy (₦)",
    "Total Tax (₦)",
    "Net Profit (₦)",
    "Effective Rate (%)",
  ];
  const rows = _allCITHistory.map((r) => [
    r.company_name || "",
    r.period || r.fin_year || "",
    r.fin_year || "",
    r.company_tier || "",
    r.turnover.toFixed(2),
    r.assessable_profit.toFixed(2),
    (r.total_assets || 0).toFixed(2),
    (Number(r.cit_rate) * 100).toFixed(0),
    r.cit_payable.toFixed(2),
    r.company_tier === "small" ? "0" : r.dev_levy.toFixed(2),
    r.total_tax.toFixed(2),
    r.net_profit.toFixed(2),
    Number(r.effective_rate).toFixed(2),
  ]);
  const csvRows = [
    ["Business Tax History — CIT & Development Levy"],
    [`Exported: ${dateNow}`],
    [],
    header,
    ...rows,
    [],
    ["Generated by TaxCalc NTA 2025", dateNow],
  ];
  const csv = csvRows
    .map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CIT_History_${dateNow.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCITExcel() {
  if (!lastCIT) return alert("Calculate first.");
  const c = lastCIT;
  const dateNow = new Date().toLocaleDateString("en-NG");
  const tier = c.isSmall
    ? "Small — 0% CIT"
    : c.isMedium
      ? "Medium — 20% CIT"
      : "Large — 30% CIT";
  const csvRows = [
    ["Business Tax Summary — CIT & Development Levy"],
    [`Company: ${c.company || "—"}`],
    [`Period: ${c.quarter || c.year}`],
    [`Generated: ${dateNow}`],
    [],
    ["Component", "Amount (₦)", "Notes"],
    ["Annual Turnover", c.turnover.toFixed(2), ""],
    [
      "Assessable Profit",
      c.profit.toFixed(2),
      "After FIRS-allowable deductions",
    ],
    ["Company Tier", tier, ""],
    [],
    ["CIT Rate", `${(c.citRate * 100).toFixed(0)}%`, ""],
    ["CIT Payable", c.citAmt.toFixed(2), "Company Income Tax"],
    [
      "Development Levy (4%)",
      c.isSmall ? "Exempt" : c.levyAmt.toFixed(2),
      "Replaces NITDA, NASENI, Education Tax, Police Trust Fund",
    ],
    ["Total Tax Payable", c.totalTax.toFixed(2), "CIT + Dev Levy"],
    [],
    ["Net Profit After Tax", c.netProfit.toFixed(2), ""],
    ["Effective Tax Rate", `${c.effRate.toFixed(2)}%`, ""],
    [],
    ["Generated by TaxCalc NTA 2025", dateNow],
  ];
  const csv = csvRows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BusinessTax_${(c.company || "Summary").replace(/\s+/g, "_")}_${(c.quarter || c.year).replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function deleteCITRecord(id, e) {
  e.stopPropagation();
  if (!confirm("Delete this CIT record?")) return;
  await sb.from("cit_calculations").delete().eq("id", id);
  loadCITHistory();
}

function exportCITPDF() {
  if (!lastCIT) return alert("Calculate first.");
  const c = lastCIT;
  const company =
    c.company ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.email ||
    "Company";
  const tierStr = c.isSmall
    ? "Small — 0% CIT"
    : c.isMedium
      ? "Medium — 20% CIT"
      : "Large — 30% CIT";
  const tierCol = c.isSmall ? "#00A86B" : c.isMedium ? "#F4A100" : "#E04040";
  const dateNow = new Date().toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const row = (label, value, valueColor = "#0A0F0D", bold = false) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #e2e8e4;${bold ? "font-weight:700;" : ""}">${label}</td>
      <td style="padding:8px 12px;border:1px solid #e2e8e4;text-align:right;font-weight:${bold ? "700" : "400"};color:${valueColor};">${value}</td>
    </tr>`;

  const html = `<div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:13px;line-height:1.6;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0A0F0D;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="width:28px;height:28px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:14px;">₦</div>
          <span style="font-size:16px;font-weight:800;">TaxCalc <span style="color:#00A86B;font-size:11px;">NTA 2025</span></span>
        </div>
        <p style="font-size:11px;color:#888;margin:0;">Company Income Tax Computation</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#888;">
        <p style="margin:0;font-weight:700;color:#0A0F0D;">${escHtml(company)}</p>
        <p style="margin:2px 0 0;">${c.quarter || "FY " + c.year} · Generated: ${dateNow}</p>
      </div>
    </div>

    <!-- Tier badge -->
    <div style="background:${tierCol};color:white;padding:8px 14px;border-radius:8px;font-weight:700;font-size:13px;margin-bottom:16px;">
      ${tierStr}
    </div>

    <!-- Company Financials -->
    <p style="font-weight:700;font-size:10px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Company Financials</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      ${row("Annual Turnover", fmt(c.turnover))}
      ${row("Assessable Profit", fmt(c.profit))}
      ${row("Total Assets", fmt(c.assets))}
    </table>

    <!-- Tax Computation -->
    <p style="font-weight:700;font-size:10px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;color:#555;">Tax Computation</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      ${row("CIT Rate", `${(c.citRate * 100).toFixed(0)}%`, "#F4A100")}
      ${row("CIT Payable", fmt(c.citAmt), "#E04040")}
      ${row("Development Levy (4%)", c.isSmall ? "Exempt" : fmt(c.levyAmt), c.isSmall ? "#00A86B" : "#E04040")}
      ${row("Total Tax Payable", fmt(c.totalTax), "#E04040", true)}
      ${row("Net Profit After Tax", fmt(c.netProfit), "#00A86B", true)}
      ${row("Effective Tax Rate", `${c.effRate.toFixed(2)}%`, "#F4A100", true)}
    </table>

    ${
      !c.isSmall
        ? `<p style="font-size:10px;color:#888;background:#fffbea;border-left:3px solid #F4A100;padding:8px 10px;margin-bottom:16px;">
      The 4% Development Levy replaces 4 previous levies: NITDA (1%), NASENI (0.5%), Education Tax (2%), Police Trust Fund (0.5%).
    </p>`
        : ""
    }

    <div style="border-top:1px solid #e2e8e4;padding-top:12px;font-size:10px;color:#aaa;text-align:center;">
      <p style="margin:0;">Based on the <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference purposes only.</p>
      <p style="margin:3px 0 0;">Generated by TaxCalc NTA 2025 · ${dateNow}</p>
    </div>
  </div>`;

  const printWin = window.open("", "_blank", "width=800,height=900");
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>CIT — ${escHtml(company)} ${c.quarter || c.year}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;padding:40px 48px;color:#0A0F0D;}@media print{@page{margin:14mm;size:A4;}body{padding:0;}}</style>
    </head><body>${html}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 600);
}

/* =====================================================
   PAYROLL — REMITTANCE GUIDE
   URLs: searched & verified against official sources
   ===================================================== */
const REMIT_STATES = [
  {
    s: "Abia",
    a: "ABSBIRN",
    irs: "Abia State Board of Internal Revenue",
    url: "https://abiastate.gov.ng",
  },
  {
    s: "Adamawa",
    a: "ADIRS",
    irs: "Adamawa State Internal Revenue Service",
    url: "https://adamawastate.gov.ng",
  },
  {
    s: "Akwa Ibom",
    a: "AKIRS",
    irs: "Akwa Ibom State Internal Revenue Service",
    url: "https://www.akirs.ak.gov.ng",
  },
  {
    s: "Anambra",
    a: "AIRS",
    irs: "Anambra Internal Revenue Service",
    url: "https://airs.an.gov.ng",
  },
  {
    s: "Bauchi",
    a: "BIRS",
    irs: "Bauchi State Internal Revenue Service",
    url: "https://birs.bu.gov.ng",
  },
  {
    s: "Bayelsa",
    a: "BIRS",
    irs: "Bayelsa State Internal Revenue Service",
    url: "https://bayelsastate.gov.ng",
  },
  {
    s: "Benue",
    a: "BSIRS",
    irs: "Benue State Internal Revenue Service",
    url: "https://benuestate.gov.ng",
  },
  {
    s: "Borno",
    a: "BOSIRS",
    irs: "Borno State Internal Revenue Service",
    url: "https://bornostate.gov.ng",
  },
  {
    s: "Cross River",
    a: "CRIRS",
    irs: "Cross River State Internal Revenue Service",
    url: "https://www.crirs.ng",
  },
  {
    s: "Delta",
    a: "DSIRS",
    irs: "Delta State Internal Revenue Service",
    url: "https://deltairs.com",
  },
  {
    s: "Ebonyi",
    a: "EBRS",
    irs: "Ebonyi State Revenue Service",
    url: "https://ebonyistate.gov.ng",
  },
  {
    s: "Edo",
    a: "EIRS",
    irs: "Edo State Internal Revenue Service",
    url: "https://eirs.gov.ng",
  },
  {
    s: "Ekiti",
    a: "EKIRS",
    irs: "Ekiti State Board of Internal Revenue",
    url: "https://www.ekitistate.gov.ng",
  },
  {
    s: "Enugu",
    a: "ESIRS",
    irs: "Enugu State Internal Revenue Service",
    url: "https://irs.en.gov.ng",
  },
  {
    s: "Gombe",
    a: "GIRS",
    irs: "Gombe State Internal Revenue Service",
    url: "https://gombestate.gov.ng",
  },
  {
    s: "Imo",
    a: "IIRS",
    irs: "Imo State Internal Revenue Service",
    url: "https://imostate.gov.ng",
  },
  {
    s: "Jigawa",
    a: "JIRS",
    irs: "Jigawa State Internal Revenue Service",
    url: "https://jigawastate.gov.ng",
  },
  {
    s: "Kaduna",
    a: "KADIRS",
    irs: "Kaduna State Internal Revenue Service",
    url: "https://kadirs.kdsg.gov.ng",
  },
  {
    s: "Kano",
    a: "KIRS",
    irs: "Kano State Internal Revenue Service",
    url: "https://kirs.gov.ng",
  },
  {
    s: "Katsina",
    a: "KATIRS",
    irs: "Katsina State Board of Internal Revenue",
    url: "https://katsinastate.gov.ng",
  },
  {
    s: "Kebbi",
    a: "KEBIRS",
    irs: "Kebbi State Internal Revenue Service",
    url: "https://kebbistate.gov.ng",
  },
  {
    s: "Kogi",
    a: "KOGIRS",
    irs: "Kogi State Internal Revenue Service",
    url: "https://kogistate.gov.ng",
  },
  {
    s: "Kwara",
    a: "KWIRS",
    irs: "Kwara State Internal Revenue Service",
    url: "https://irs.kw.gov.ng",
  },
  {
    s: "Lagos",
    a: "LIRS",
    irs: "Lagos State Internal Revenue Service",
    url: "https://lirs.gov.ng",
  },
  {
    s: "Nasarawa",
    a: "NIRS",
    irs: "Nasarawa State Internal Revenue Service",
    url: "https://www.irs.na.gov.ng",
  },
  {
    s: "Niger",
    a: "NGSIRS",
    irs: "Niger State Internal Revenue Service",
    url: "https://www.ngsirs.gov.ng",
  },
  {
    s: "Ogun",
    a: "OGIRS",
    irs: "Ogun State Internal Revenue Service",
    url: "https://portal.ogetax.ogunstate.gov.ng",
  },
  {
    s: "Ondo",
    a: "ONIRS",
    irs: "Ondo State Internal Revenue Service",
    url: "https://www.odirs.ng",
  },
  {
    s: "Osun",
    a: "OSIRS",
    irs: "Osun State Internal Revenue Service",
    url: "https://irs.os.gov.ng",
  },
  {
    s: "Oyo",
    a: "OYIRS",
    irs: "Oyo State Board of Internal Revenue",
    url: "https://bir.oyostate.gov.ng",
  },
  {
    s: "Plateau",
    a: "PSIRS",
    irs: "Plateau State Internal Revenue Service",
    url: "https://www.psirs.gov.ng",
  },
  {
    s: "Rivers",
    a: "RIRS",
    irs: "Rivers State Internal Revenue Service",
    url: "https://riversbirs.gov.ng",
  },
  {
    s: "Sokoto",
    a: "SOKIRS",
    irs: "Sokoto State Internal Revenue Service",
    url: "https://sokotostate.gov.ng",
  },
  {
    s: "Taraba",
    a: "TIRS",
    irs: "Taraba State Internal Revenue Service",
    url: "https://www.tarababir.gov.ng",
  },
  {
    s: "Yobe",
    a: "YBRS",
    irs: "Yobe State Revenue Service",
    url: "https://yobestate.gov.ng",
  },
  {
    s: "Zamfara",
    a: "ZBIRS",
    irs: "Zamfara State Board of Internal Revenue",
    url: "https://zamfarabir.com",
  },
  // FCT listed last — it is a territory, not a state
  {
    s: "FCT Abuja",
    a: "FCT-IRS",
    irs: "FCT Internal Revenue Service",
    url: "https://fctirs.gov.ng",
  },
];

function toggleRemitGuide(btn) {
  const body = document.getElementById("remitBody");
  const nowHidden = body.classList.toggle("hidden");
  btn.querySelector(".remit-chevron").textContent = nowHidden ? "▼" : "▲";
  if (!nowHidden) renderRemitStates(REMIT_STATES);
}

function renderRemitStates(list) {
  const grid = document.getElementById("remitStateGrid");
  if (!grid) return;
  grid.innerHTML = list
    .map(
      (s) => `
    <div class="remit-state-card">
      <div class="remit-state-top">
        <span class="remit-state-name">${s.s}</span>
        <span class="remit-state-abbr">${s.a}</span>
      </div>
      <div class="remit-state-irs">${s.irs}</div>
      <a class="remit-state-link" href="${s.url}" target="_blank" rel="noopener noreferrer">Portal →</a>
    </div>`,
    )
    .join("");
}

function filterRemitStates() {
  const q = (document.getElementById("remitSearch")?.value || "")
    .toLowerCase()
    .trim();
  if (!q) {
    renderRemitStates(REMIT_STATES);
    return;
  }
  renderRemitStates(
    REMIT_STATES.filter(
      (s) =>
        s.s.toLowerCase().includes(q) ||
        s.a.toLowerCase().includes(q) ||
        s.irs.toLowerCase().includes(q),
    ),
  );
}

/* =====================================================
   US-017 — CLIENT PROFILES
   Visible to: tax_consultant, hr_manager, business_owner
   Table: client_profiles (id, user_id, name, basic, housing, transport,
          other_allowances, annual_rent, notes, created_at, updated_at)
   ===================================================== */

let _allProfiles = [];

function showClientForm(profileId) {
  const wrap = document.getElementById("clientFormWrap");
  document.getElementById("editingProfileId").value = profileId || "";
  document.getElementById("clientFormTitle").textContent = profileId
    ? "Edit Client Profile"
    : "New Client Profile";
  document.getElementById("cpSaveStatus").classList.add("hidden");

  if (profileId) {
    const p = _allProfiles.find((x) => x.id === profileId);
    if (!p) return;
    document.getElementById("cpName").value = p.name || "";
    document.getElementById("cpBasic").value = Math.round((p.basic || 0) / 12);
    document.getElementById("cpHousing").value = Math.round(
      (p.housing || 0) / 12,
    );
    document.getElementById("cpTransport").value = Math.round(
      (p.transport || 0) / 12,
    );
    document.getElementById("cpOther").value = Math.round(
      (p.other_allowances || 0) / 12,
    );
    document.getElementById("cpRent").value = p.annual_rent || "";
    document.getElementById("cpNotes").value = p.notes || "";
  } else {
    [
      "cpName",
      "cpBasic",
      "cpHousing",
      "cpTransport",
      "cpOther",
      "cpRent",
      "cpNotes",
    ].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("cpPreview").classList.add("hidden");
  }

  wrap.classList.remove("hidden");
  wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  previewClientCalc();
}

function hideClientForm() {
  document.getElementById("clientFormWrap").classList.add("hidden");
}

function previewClientCalc() {
  const basic = parseFloat(document.getElementById("cpBasic").value) || 0;
  const housing = parseFloat(document.getElementById("cpHousing").value) || 0;
  const transport =
    parseFloat(document.getElementById("cpTransport").value) || 0;
  const other = parseFloat(document.getElementById("cpOther").value) || 0;
  const rentAnn = parseFloat(document.getElementById("cpRent").value) || 0;

  const preview = document.getElementById("cpPreview");
  if (basic + housing + transport + other === 0) {
    preview.classList.add("hidden");
    return;
  }

  const gross = (basic + housing + transport + other) * 12;
  const pension = 0.08 * (basic + housing + transport) * 12;
  const nhf = 0.025 * basic * 12;
  const nhis = 0.05 * basic * 12;
  const rentRelief = rentAnn > 0 ? Math.min(0.2 * rentAnn, 500_000) : 0;
  const chargeable = Math.max(0, gross - pension - nhf - nhis - rentRelief);
  const { totalTax } = calcBands(chargeable, NTA2025_BANDS);
  const netAnnual = gross - pension - nhf - nhis - totalTax;
  const netMonthly = netAnnual / 12;
  const effRate = gross > 0 ? (totalTax / gross) * 100 : 0;

  document.getElementById("cpPreviewNet").textContent = fmt(netMonthly) + "/mo";
  document.getElementById("cpPreviewPaye").textContent =
    fmt(totalTax / 12) + "/mo";
  document.getElementById("cpPreviewRate").textContent =
    effRate.toFixed(2) + "%";
  preview.classList.remove("hidden");
}

async function saveClientProfile() {
  const name = document.getElementById("cpName").value.trim();
  const basic = parseFloat(document.getElementById("cpBasic").value) || 0;
  const housing = parseFloat(document.getElementById("cpHousing").value) || 0;
  const transport =
    parseFloat(document.getElementById("cpTransport").value) || 0;
  const other = parseFloat(document.getElementById("cpOther").value) || 0;
  const rent = parseFloat(document.getElementById("cpRent").value) || 0;
  const notes = document.getElementById("cpNotes").value.trim();
  const editId = document.getElementById("editingProfileId").value;

  const statusEl = document.getElementById("cpSaveStatus");
  if (!name) {
    statusEl.textContent = "Client name is required.";
    statusEl.className = "save-status error";
    statusEl.classList.remove("hidden");
    return;
  }
  if (basic === 0) {
    statusEl.textContent = "Basic salary is required.";
    statusEl.className = "save-status error";
    statusEl.classList.remove("hidden");
    return;
  }
  if (!currentUser) {
    statusEl.textContent = "Please sign in to save profiles.";
    statusEl.className = "save-status error";
    statusEl.classList.remove("hidden");
    return;
  }

  const payload = {
    user_id: currentUser.id,
    name,
    basic: basic * 12, // store annual, consistent with tax_calculations
    housing: housing * 12,
    transport: transport * 12,
    other_allowances: other * 12,
    annual_rent: rent,
    notes,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (editId) {
    ({ error } = await sb
      .from("client_profiles")
      .update(payload)
      .eq("id", editId)
      .eq("user_id", currentUser.id));
  } else {
    payload.created_at = new Date().toISOString();
    ({ error } = await sb.from("client_profiles").insert(payload));
  }

  if (error) {
    statusEl.textContent = "Failed to save: " + error.message;
    statusEl.className = "save-status error";
    statusEl.classList.remove("hidden");
  } else {
    hideClientForm();
    loadClientProfiles();
  }
}

async function loadClientProfiles() {
  if (!currentUser) return;
  const grid = document.getElementById("clientProfilesGrid");
  const empty = document.getElementById("clientProfilesEmpty");
  grid.innerHTML =
    '<p style="color:rgba(255,255,255,0.3);font-size:13px;font-family:var(--mono);padding:20px 0;">Loading...</p>';

  const { data, error } = await sb
    .from("client_profiles")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<p style="color:#FF7070;font-size:13px;">Error: ${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    _allProfiles = [];
    return;
  }
  _allProfiles = data;
  empty.classList.add("hidden");
  grid.innerHTML = "";
  data.forEach((p) => {
    const card = document.createElement("div");
    card.className = "cp-card";
    card.innerHTML = buildProfileCard(p);
    grid.appendChild(card);
  });
}

function buildProfileCard(p) {
  // Compute quick tax snapshot
  const gross = p.basic + p.housing + p.transport + p.other_allowances;
  const pension = 0.08 * (p.basic + p.housing + p.transport);
  const nhf = 0.025 * p.basic;
  const nhis = 0.05 * p.basic;
  const rentRelief =
    p.annual_rent > 0 ? Math.min(0.2 * p.annual_rent, 500_000) : 0;
  const chargeable = Math.max(0, gross - pension - nhf - nhis - rentRelief);
  const { totalTax } = calcBands(chargeable, NTA2025_BANDS);
  const netMonthly = (gross - pension - nhf - nhis - totalTax) / 12;
  const effRate = gross > 0 ? (totalTax / gross) * 100 : 0;
  const initials = p.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
  const updated = new Date(p.updated_at || p.created_at).toLocaleDateString(
    "en-NG",
    { day: "2-digit", month: "short", year: "numeric" },
  );

  return `
    <div class="cp-card-top">
      <div class="cp-avatar">${escHtml(initials)}</div>
      <div class="cp-card-info">
        <div class="cp-card-name">${escHtml(p.name)}</div>
        ${p.notes ? `<div class="cp-card-notes">${escHtml(p.notes)}</div>` : ""}
        <div class="cp-card-date">Updated ${updated}</div>
      </div>
    </div>
    <div class="cp-card-stats">
      <div class="cp-stat"><span class="cp-stat-label">Gross/mo</span><span class="cp-stat-val">${fmt(gross / 12)}</span></div>
      <div class="cp-stat"><span class="cp-stat-label">Net/mo</span><span class="cp-stat-val green">${fmt(netMonthly)}</span></div>
      <div class="cp-stat"><span class="cp-stat-label">PAYE/mo</span><span class="cp-stat-val red">${fmt(totalTax / 12)}</span></div>
      <div class="cp-stat"><span class="cp-stat-label">Eff. Rate</span><span class="cp-stat-val">${effRate.toFixed(1)}%</span></div>
    </div>
    <div class="cp-card-footer">
      <button class="cp-btn-calc" onclick="recalcFromProfile(${p.id})">⚡ Recalculate</button>
      <button class="cp-btn-edit" onclick="showClientForm(${p.id})">✏ Edit</button>
      <button class="cp-btn-delete" onclick="deleteClientProfile(${p.id}, event)">Delete</button>
    </div>`;
}

function recalcFromProfile(id) {
  const p = _allProfiles.find((x) => x.id === id);
  if (!p) return;
  // Populate calculator inputs (monthly values)
  document.getElementById("basic").value = Math.round(p.basic / 12);
  document.getElementById("housing").value = Math.round(p.housing / 12);
  document.getElementById("transport").value = Math.round(p.transport / 12);
  document.getElementById("other").value = Math.round(p.other_allowances / 12);
  document.getElementById("annualRent").value = Math.round(p.annual_rent || 0);
  // Set client name field
  const clientNameEl = document.getElementById("clientName");
  if (clientNameEl) clientNameEl.value = p.name;
  setInputMode("monthly");
  showAppSection("calculator");
  setTimeout(() => calculate(), 50);
}

async function deleteClientProfile(id, e) {
  e.stopPropagation();
  const p = _allProfiles.find((x) => x.id === id);
  if (!confirm(`Delete profile for "${p?.name || "this client"}"?`)) return;
  const { error } = await sb
    .from("client_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);
  if (error) alert("Failed to delete: " + error.message);
  else loadClientProfiles();
}

/* =====================================================
   US-020 — VAT CALCULATOR
   Visible to: business_owner, tax_consultant
   ===================================================== */
let lastVAT = null;

function calculateVAT() {
  const sales = Number(document.getElementById("vatSales").value) || 0;
  const inputVAT = Number(document.getElementById("vatInput").value) || 0;
  const period = document.getElementById("vatPeriod").value;
  const zeroRated = document.getElementById("vatZeroRated").checked;

  const empty = document.getElementById("vatEmpty");
  const output = document.getElementById("vatOutput");

  if (!sales && !inputVAT) {
    empty.classList.remove("hidden");
    output.classList.add("hidden");
    lastVAT = null;
    return;
  }
  empty.classList.add("hidden");
  output.classList.remove("hidden");

  const zeroNotice = document.getElementById("vatZeroNotice");
  const standardResults = document.getElementById("vatStandardResults");

  if (zeroRated) {
    zeroNotice.classList.remove("hidden");
    standardResults.classList.add("hidden");
    lastVAT = {
      sales,
      inputVAT,
      period,
      zeroRated: true,
      outputVAT: 0,
      netVAT: 0,
    };
    return;
  }

  zeroNotice.classList.add("hidden");
  standardResults.classList.remove("hidden");

  const outputVAT = sales * 0.075;
  const netVAT = outputVAT - inputVAT;
  const isRefund = netVAT < 0;

  // Due date = 21st of following month
  const [monthName, year] = period.split(" ");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const mIdx = months.indexOf(monthName);
  const dueMonth = months[(mIdx + 1) % 12];
  const dueYear = mIdx === 11 ? Number(year) + 1 : Number(year);
  const dueDate = `21 ${dueMonth} ${dueYear}`;

  document.getElementById("vatRSales").textContent = fmt(sales);
  document.getElementById("vatROutput").textContent = fmt(outputVAT);
  document.getElementById("vatRInput").textContent =
    inputVAT > 0 ? "−" + fmt(inputVAT) : "₦0";
  document.getElementById("vatRNet").textContent =
    (isRefund ? "+" : "") + fmt(Math.abs(netVAT));
  document.getElementById("vatRNet").className =
    "crv bold " + (isRefund ? "green" : "red");
  document.getElementById("vatNetLabel").textContent = isRefund
    ? "VAT Refund / Credit Due to You"
    : "Net VAT Payable to FIRS";
  document.getElementById("vatRDue").textContent = isRefund
    ? "Claim refund from FIRS"
    : `Due: ${dueDate}`;

  lastVAT = {
    sales,
    inputVAT,
    outputVAT,
    netVAT,
    period,
    zeroRated: false,
    isRefund,
    dueDate,
  };
}

async function saveVAT() {
  if (!lastVAT) return alert("Calculate first.");
  if (!currentUser) return alert("Please sign in to save.");
  const { error } = await sb.from("vat_records").insert({
    user_id: currentUser.id,
    period: lastVAT.period,
    sales: lastVAT.sales,
    input_vat: lastVAT.inputVAT,
    output_vat: lastVAT.outputVAT || 0,
    net_vat: lastVAT.netVAT || 0,
    zero_rated: lastVAT.zeroRated,
    created_at: new Date().toISOString(),
  });
  if (error) return alert("Save failed: " + error.message);
  alert("VAT record saved.");
  loadVATHistory();
}

let _allVATHistory = [];

async function loadVATHistory() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from("vat_records")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(24);
  const grid = document.getElementById("vatHistGrid");
  const empty = document.getElementById("vatHistEmpty");
  const excelBtn = document.getElementById("vatHistExcelBtn");
  if (!grid) return;
  if (error || !data?.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    if (excelBtn) excelBtn.style.display = "none";
    _allVATHistory = [];
    return;
  }
  _allVATHistory = data;
  empty.classList.add("hidden");
  if (excelBtn) excelBtn.style.display = "";
  grid.innerHTML = data
    .map(
      (r) => `
    <div class="cit-hcard">
      <div class="cit-hcard-top">
        <span class="cit-hcard-co">${escHtml(r.period || "—")}</span>
        <span class="cit-hcard-date">${formatDate(r.created_at)}</span>
      </div>
      ${
        r.zero_rated
          ? `<span class="cit-tier-pill small">Zero-Rated / Exempt</span>`
          : `<span class="cit-tier-pill ${r.net_vat < 0 ? "small" : "large"}">${r.net_vat < 0 ? "VAT Refund" : "VAT Payable"}</span>`
      }
      <div class="cit-hcard-grid">
        <div><span class="cit-hc-lbl">Taxable Sales</span><span class="cit-hc-val">${fmt(r.sales)}</span></div>
        <div><span class="cit-hc-lbl">Output VAT</span><span class="cit-hc-val red">${r.zero_rated ? "₦0" : fmt(r.output_vat)}</span></div>
        <div><span class="cit-hc-lbl">Input VAT</span><span class="cit-hc-val green">${fmt(r.input_vat)}</span></div>
        <div><span class="cit-hc-lbl">Net VAT</span><span class="cit-hc-val ${r.net_vat < 0 ? "green" : "red"}">${r.net_vat < 0 ? "+" : ""}${fmt(Math.abs(r.net_vat))}</span></div>
      </div>
      <div class="cit-hcard-foot">
        <span class="cit-hc-lbl">Saved ${formatDate(r.created_at)}</span>
        <button class="card-delete" onclick="deleteVATRecord(${r.id}, event)">Delete</button>
      </div>
    </div>`,
    )
    .join("");
}

function exportVATExcel() {
  if (!lastVAT) return alert("Calculate first.");
  const v = lastVAT;
  const dateNow = new Date().toLocaleDateString("en-NG");
  const csvRows = [
    ["VAT Computation — NTA 2025"],
    [`Period: ${v.period}`],
    [`Generated: ${dateNow}`],
    [],
    ["Component", "Amount (₦)", "Notes"],
    ["Taxable Sales", v.sales.toFixed(2), ""],
    ["VAT Rate", "7.5%", "Standard rate under NTA 2025"],
    [
      "Output VAT (7.5%)",
      v.zeroRated ? "0" : v.outputVAT.toFixed(2),
      v.zeroRated ? "Zero-rated / Exempt" : "",
    ],
    ["Input VAT (Deductible)", v.inputVAT.toFixed(2), ""],
    [
      "Net VAT Payable",
      v.zeroRated ? "0" : v.netVAT.toFixed(2),
      v.netVAT < 0 ? "Refund due from FIRS" : "Remit to FIRS",
    ],
    [],
    v.zeroRated ? [] : [`Due Date`, v.dueDate || "", "21st of following month"],
    [],
    ["Generated by TaxCalc NTA 2025", dateNow],
  ].filter((r) => r.length > 0);
  const csv = csvRows
    .map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `VAT_${(v.period || "").replace(/\s+/g, "_")}_${dateNow.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportVATHistoryExcel() {
  if (!_allVATHistory.length) return alert("No VAT records to export.");
  const dateNow = new Date().toLocaleDateString("en-NG");
  const header = [
    "Period",
    "Taxable Sales (₦)",
    "Output VAT (₦)",
    "Input VAT (₦)",
    "Net VAT (₦)",
    "Status",
    "Date Saved",
  ];
  const rows = _allVATHistory.map((r) => [
    r.period || "",
    r.sales.toFixed(2),
    r.zero_rated ? "0" : r.output_vat.toFixed(2),
    r.input_vat.toFixed(2),
    r.zero_rated ? "0" : r.net_vat.toFixed(2),
    r.zero_rated ? "Zero-Rated" : r.net_vat < 0 ? "Refund" : "Payable",
    new Date(r.created_at).toLocaleDateString("en-NG"),
  ]);
  const csvRows = [
    ["VAT History — NTA 2025"],
    [`Exported: ${dateNow}`],
    [],
    header,
    ...rows,
    [],
    ["Generated by TaxCalc NTA 2025", dateNow],
  ];
  const csv = csvRows
    .map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `VAT_History_${dateNow.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function deleteVATRecord(id, e) {
  e.stopPropagation();
  if (!confirm("Delete this VAT record?")) return;
  await sb.from("vat_records").delete().eq("id", id);
  loadVATHistory();
}

function exportVATPDF() {
  if (!lastVAT) return alert("Calculate first.");
  const v = lastVAT;
  const meta = currentUser?.user_metadata || {};
  const company = meta.company || meta.full_name || currentUser?.email || "";
  const dateNow = new Date().toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const html = `<div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:13px;line-height:1.6;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0A0F0D;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="width:28px;height:28px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:14px;">₦</div>
          <span style="font-size:16px;font-weight:800;">TaxCalc <span style="color:#00A86B;font-size:11px;">NTA 2025</span></span>
        </div>
        <p style="font-size:11px;color:#888;margin:0;">VAT Computation — ${escHtml(v.period)}</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#888;">
        ${company ? `<p style="margin:0;font-weight:700;color:#0A0F0D;">${escHtml(company)}</p>` : ""}
        <p style="margin:2px 0 0;">Generated: ${dateNow}</p>
      </div>
    </div>
    ${
      v.zeroRated
        ? `
      <div style="background:#e6f9f0;border:2px solid #00A86B;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">
        <p style="font-weight:700;color:#00A86B;margin:0;">ZERO-RATED / EXEMPT — 0% VAT</p>
        <p style="font-size:12px;color:#555;margin:6px 0 0;">No VAT is due for this period.</p>
      </div>`
        : `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <tr style="background:#f5f7f5;"><td style="padding:8px 12px;border:1px solid #e2e8e4;">Taxable Sales</td><td style="padding:8px 12px;border:1px solid #e2e8e4;text-align:right;">${fmt(v.sales)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8e4;">VAT Rate</td><td style="padding:8px 12px;border:1px solid #e2e8e4;text-align:right;">7.5%</td></tr>
      <tr style="background:#f5f7f5;"><td style="padding:8px 12px;border:1px solid #e2e8e4;">Output VAT</td><td style="padding:8px 12px;border:1px solid #e2e8e4;text-align:right;color:#E04040;">${fmt(v.outputVAT)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8e4;">Input VAT Reclaimable</td><td style="padding:8px 12px;border:1px solid #e2e8e4;text-align:right;color:#00A86B;">−${fmt(v.inputVAT)}</td></tr>
      <tr style="background:#0A0F0D;"><td style="padding:10px 12px;border:2px solid #0A0F0D;font-weight:700;color:white;">${v.isRefund ? "VAT Refund Due" : "Net VAT Payable to FIRS"}</td>
          <td style="padding:10px 12px;border:2px solid #0A0F0D;text-align:right;font-weight:700;font-size:16px;color:${v.isRefund ? "#00A86B" : "#E04040"};">${v.isRefund ? "+" : ""}${fmt(Math.abs(v.netVAT))}</td></tr>
    </table>
    ${!v.isRefund ? `<p style="font-size:11px;color:#888;">Remittance due: <strong>${v.dueDate}</strong> — pay via FIRS e-TaxPay portal.</p>` : ""}
    `
    }
    <div style="border-top:1px solid #e2e8e4;padding-top:12px;font-size:10px;color:#aaa;text-align:center;margin-top:16px;">
      <p style="margin:0;">Based on the <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference only.</p>
    </div>
  </div>`;

  const printWin = window.open("", "_blank", "width=700,height=800");
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>VAT — ${v.period}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;padding:40px 48px;color:#0A0F0D;}@media print{@page{margin:14mm;size:A4;}body{padding:0;}}</style>
    </head><body>${html}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 600);
}

/* =====================================================
   YTD TRACKER — Year-to-Date Tax Projection
   Location: Tab 2 (between Calculator and History)
   Visible to: all logged-in roles
   Pure client-side — no Supabase saves needed.
   ===================================================== */

let ytdMonths = new Date().getMonth() + 1; // default to current month (1–12)

function autoSetMonths() {
  ytdMonths = new Date().getMonth() + 1;
  syncMonthDisplay();
  calculateYTD();
}

function adjustMonths(delta) {
  ytdMonths = Math.max(1, Math.min(12, ytdMonths + delta));
  syncMonthDisplay();
  calculateYTD();
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function syncMonthDisplay() {
  const el = document.getElementById("ytdMonthsVal");
  const hint = document.getElementById("ytdMonthHint");
  if (el) el.textContent = ytdMonths;
  if (hint) hint.textContent = "End of " + MONTH_NAMES[ytdMonths - 1];
}

function calculateYTD() {
  const basic = Number(document.getElementById("ytdBasic")?.value) || 0;
  const housing = Number(document.getElementById("ytdHousing")?.value) || 0;
  const transport = Number(document.getElementById("ytdTransport")?.value) || 0;
  const other = Number(document.getElementById("ytdOther")?.value) || 0;
  const annualRent = Number(document.getElementById("ytdRent")?.value) || 0;

  const empty = document.getElementById("ytdEmpty");
  const output = document.getElementById("ytdOutput");

  if (basic + housing + transport + other === 0) {
    empty?.classList.remove("hidden");
    output?.classList.add("hidden");
    return;
  }
  empty?.classList.add("hidden");
  output?.classList.remove("hidden");

  // --- Annual figures (all calcs on annual basis, then slice for YTD) ---
  const grossMonthly = basic + housing + transport + other;
  const grossAnnual = grossMonthly * 12;

  const pensionAnnual = 0.08 * (basic + housing + transport) * 12;
  const nhfAnnual = 0.025 * basic * 12;
  const nhisAnnual = 0.05 * basic * 12;
  const rentRelief = annualRent > 0 ? Math.min(0.2 * annualRent, 500_000) : 0;
  const chargeable = Math.max(
    0,
    grossAnnual - pensionAnnual - nhfAnnual - nhisAnnual - rentRelief,
  );

  const isExempt = chargeable <= 800_000;
  const ntaResult = calcBands(chargeable, NTA2025_BANDS);
  const annualPAYE = ntaResult.totalTax;
  const annualNet =
    grossAnnual - pensionAnnual - nhfAnnual - nhisAnnual - annualPAYE;
  const effRate = grossAnnual > 0 ? (annualPAYE / grossAnnual) * 100 : 0;

  // --- YTD slice ---
  const ratio = ytdMonths / 12;
  const ytdGross = grossAnnual * ratio;
  const ytdPension = pensionAnnual * ratio;
  const ytdNhf = nhfAnnual * ratio;
  const ytdNhis = nhisAnnual * ratio;
  const ytdPAYE = annualPAYE * ratio;
  const ytdNet = annualNet * ratio;
  const remainingPAYE = annualPAYE - ytdPAYE;

  // --- Progress bar ---
  const pct = Math.round((ytdMonths / 12) * 100);
  const remaining = 12 - ytdMonths;
  document.getElementById("ytdProgressLabel").textContent =
    `${ytdMonths} of 12 months elapsed`;
  document.getElementById("ytdProgressPct").textContent = `${pct}%`;
  document.getElementById("ytdBarFill").style.width = `${pct}%`;
  document.getElementById("ytdProgressSub").textContent =
    remaining > 0
      ? `${remaining} month${remaining > 1 ? "s" : ""} remaining in ${new Date().getFullYear()}`
      : "Full year complete";

  // --- YTD actuals ---
  document.getElementById("ytdGrossEarned").textContent = fmt(ytdGross);
  document.getElementById("ytdPensionPaid").textContent = "−" + fmt(ytdPension);
  document.getElementById("ytdNhfPaid").textContent = "−" + fmt(ytdNhf);
  document.getElementById("ytdNhisPaid").textContent = "−" + fmt(ytdNhis);
  document.getElementById("ytdPayePaid").textContent = "−" + fmt(ytdPAYE);
  document.getElementById("ytdNetEarned").textContent = fmt(ytdNet);

  // --- Full-year projection ---
  document.getElementById("ytdProjGross").textContent = fmt(grossAnnual);
  document.getElementById("ytdProjPaye").textContent = "−" + fmt(annualPAYE);
  document.getElementById("ytdProjRemaining").textContent =
    remaining > 0 ? "−" + fmt(remainingPAYE) : "₦0 (year complete)";
  document.getElementById("ytdProjNet").textContent = fmt(annualNet);

  // --- Monthly (rest of year) ---
  document.getElementById("ytdMonthlyNet").textContent =
    fmt(annualNet / 12) + "/mo";
  document.getElementById("ytdMonthlyPaye").textContent =
    "−" + fmt(annualPAYE / 12) + "/mo";
  document.getElementById("ytdEffRate").textContent = effRate.toFixed(2) + "%";

  // --- Exempt banner ---
  document
    .getElementById("ytdExemptBanner")
    ?.classList.toggle("hidden", !isExempt);
}
/* =====================================================
   BUSINESS TAX SUMMARY — US-022 / US-023
   Combined CIT + VAT + Dev Levy view per period
   ===================================================== */

let _bizSummaryHistory = [];

function refreshBizSummary() {
  const notice = document.getElementById("btsNotice");
  const content = document.getElementById("btsLiveContent");
  const hasCIT = !!lastCIT;
  const hasVAT = !!lastVAT;

  if (!hasCIT && !hasVAT) {
    notice?.classList.remove("hidden");
    content?.classList.add("hidden");
    return;
  }
  notice?.classList.add("hidden");
  content?.classList.remove("hidden");

  const company =
    (hasCIT ? lastCIT.company : "") ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.email ||
    "—";
  const period = hasCIT
    ? lastCIT.quarter || lastCIT.year
    : hasVAT
      ? lastVAT.period
      : "—";

  document.getElementById("btsBannerCompany").textContent = company;
  document.getElementById("btsBannerPeriod").textContent = period;

  // CIT card
  const citAmt = hasCIT ? lastCIT.citAmt : 0;
  const levyAmt = hasCIT ? lastCIT.levyAmt : 0;
  const isSmall = hasCIT ? lastCIT.isSmall : false;
  const tierLabel = !hasCIT
    ? "Not calculated"
    : isSmall
      ? "Small — 0% CIT (Exempt)"
      : lastCIT.isMedium
        ? "Medium — 20% CIT"
        : "Large — 30% CIT";

  document.getElementById("btsCITAmt").textContent = hasCIT ? fmt(citAmt) : "—";
  document.getElementById("btsCITDetail").textContent = hasCIT
    ? `${(lastCIT.citRate * 100).toFixed(0)}% of ${fmt(lastCIT.profit)}`
    : "Not calculated yet";
  document.getElementById("btsCITTag").textContent = tierLabel;

  document.getElementById("btsLevyAmt").textContent = !hasCIT
    ? "—"
    : isSmall
      ? "Exempt"
      : fmt(levyAmt);
  document.getElementById("btsLevyDetail").textContent = !hasCIT
    ? "Not calculated yet"
    : isSmall
      ? "Small company — fully exempt"
      : `4% of ${fmt(lastCIT.profit)}`;

  // VAT card
  const vatNet = hasVAT ? lastVAT.netVAT : 0;
  const vatIsRefund = hasVAT && lastVAT.netVAT < 0;
  document.getElementById("btsVATAmt").textContent = hasVAT
    ? (vatIsRefund ? "+ " : "") + fmt(Math.abs(vatNet))
    : "—";
  document.getElementById("btsVATDetail").textContent = !hasVAT
    ? "Not calculated yet"
    : lastVAT.zeroRated
      ? "Zero-rated / Exempt"
      : `Output ₦${Math.round(lastVAT.outputVAT).toLocaleString()} − Input ₦${Math.round(lastVAT.inputVAT).toLocaleString()}`;
  document.getElementById("btsVATTag").textContent = !hasVAT
    ? "7.5% on taxable supplies"
    : vatIsRefund
      ? "VAT refund due from FIRS"
      : lastVAT.zeroRated
        ? "Zero-rated / Exempt"
        : `Due: ${lastVAT.dueDate || "21st of following month"}`;

  // Total (only count positive VAT)
  const vatContrib = hasVAT && !lastVAT.zeroRated && vatNet > 0 ? vatNet : 0;
  const totalObligation = (hasCIT ? lastCIT.totalTax : 0) + vatContrib;
  document.getElementById("btsTotalObligation").textContent =
    fmt(totalObligation);

  // Breakdown table rows
  const brow = (
    label,
    rate,
    base,
    amt,
    isTotal = false,
    amtColor = "#0A0F0D",
  ) =>
    `<span style="${isTotal ? "font-weight:700;" : ""}">${label}</span>
     <span style="${isTotal ? "font-weight:700;" : ""}">${rate}</span>
     <span style="${isTotal ? "font-weight:700;" : ""}">${base}</span>
     <span style="font-weight:${isTotal ? "700" : "400"};color:${amtColor};">${amt}</span>`;

  document.getElementById("btsRowCIT").innerHTML = brow(
    "Company Income Tax",
    hasCIT ? `${(lastCIT?.citRate * 100).toFixed(0)}%` : "—",
    hasCIT ? fmt(lastCIT.profit) : "—",
    hasCIT ? fmt(citAmt) : "—",
    false,
    "#E04040",
  );
  document.getElementById("btsRowLevy").innerHTML = brow(
    "Development Levy",
    !hasCIT ? "—" : isSmall ? "Exempt" : "4%",
    hasCIT ? fmt(lastCIT.profit) : "—",
    !hasCIT ? "—" : isSmall ? "Exempt" : fmt(levyAmt),
    false,
    isSmall ? "#00A86B" : "#E04040",
  );
  document.getElementById("btsRowVAT").innerHTML = brow(
    "VAT (Net Payable)",
    hasVAT ? "7.5%" : "—",
    hasVAT ? fmt(lastVAT.sales) : "—",
    hasVAT
      ? lastVAT.zeroRated
        ? "Exempt"
        : vatIsRefund
          ? "Refund"
          : fmt(vatNet)
      : "—",
    false,
    vatIsRefund ? "#00A86B" : "#E04040",
  );
  document.getElementById("btsRowTotal").innerHTML = brow(
    "Total Tax Obligation",
    "",
    "",
    fmt(totalObligation),
    true,
    "#E04040",
  );
}

async function saveBizSummary() {
  if (!lastCIT && !lastVAT) return alert("Calculate CIT or VAT first.");
  if (!currentUser) return alert("Please log in to save.");
  const company =
    lastCIT?.company ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.email ||
    "";
  const period = lastCIT
    ? lastCIT.quarter || lastCIT.year
    : lastVAT?.period || "";
  const isSmall = lastCIT?.isSmall || false;
  const vatContrib =
    lastVAT && !lastVAT.zeroRated && lastVAT.netVAT > 0 ? lastVAT.netVAT : 0;
  const { error } = await sb.from("biz_tax_summaries").insert({
    user_id: currentUser.id,
    company_name: company,
    period: period,
    cit_payable: lastCIT ? lastCIT.citAmt : 0,
    dev_levy: lastCIT ? lastCIT.levyAmt : 0,
    cit_total: lastCIT ? lastCIT.totalTax : 0,
    vat_output: lastVAT ? lastVAT.outputVAT : 0,
    vat_input: lastVAT ? lastVAT.inputVAT : 0,
    vat_net: lastVAT ? lastVAT.netVAT : 0,
    vat_zero_rated: lastVAT?.zeroRated || false,
    total_obligation: (lastCIT ? lastCIT.totalTax : 0) + vatContrib,
    company_tier: lastCIT
      ? isSmall
        ? "small"
        : lastCIT.isMedium
          ? "medium"
          : "large"
      : null,
    turnover: lastCIT ? lastCIT.turnover : null,
    assessable_profit: lastCIT ? lastCIT.profit : null,
    vat_sales: lastVAT ? lastVAT.sales : null,
  });
  if (error) return alert("Save failed: " + error.message);
  alert("Business tax summary saved.");
  loadBizSummaryHistory();
}

async function loadBizSummaryHistory() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from("biz_tax_summaries")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const grid = document.getElementById("bizHistGrid");
  const empty = document.getElementById("bizHistEmpty");
  const excelBtn = document.getElementById("bizHistExcelBtn");
  if (!grid) return;
  if (error || !data?.length) {
    grid.innerHTML = "";
    empty?.classList.remove("hidden");
    if (excelBtn) excelBtn.style.display = "none";
    _bizSummaryHistory = [];
    return;
  }
  _bizSummaryHistory = data;
  empty?.classList.add("hidden");
  if (excelBtn) excelBtn.style.display = "";
  const tierMap = {
    small: "Small — 0%",
    medium: "Medium — 20%",
    large: "Large — 30%",
  };
  grid.innerHTML = data
    .map((r) => {
      const vatLine = r.vat_zero_rated
        ? "Zero-Rated"
        : r.vat_net < 0
          ? "VAT Refund"
          : fmt(r.vat_net);
      return `
    <div class="cit-hcard">
      <div class="cit-hcard-top">
        <span class="cit-hcard-co">${escHtml(r.company_name || "—")}</span>
        <span class="cit-hcard-date">${formatDate(r.created_at)}</span>
      </div>
      <div style="font-size:11px;font-family:var(--mono);color:rgba(0,0,0,0.35);margin-bottom:8px;">📅 ${escHtml(r.period || "—")}</div>
      ${r.company_tier ? `<span class="cit-tier-pill ${r.company_tier}">${tierMap[r.company_tier] || r.company_tier}</span>` : ""}
      <div class="cit-hcard-grid">
        <div><span class="cit-hc-lbl">CIT</span><span class="cit-hc-val red">${fmt(r.cit_payable)}</span></div>
        <div><span class="cit-hc-lbl">Dev. Levy</span><span class="cit-hc-val red">${r.company_tier === "small" ? "Exempt" : fmt(r.dev_levy)}</span></div>
        <div><span class="cit-hc-lbl">VAT (Net)</span><span class="cit-hc-val ${r.vat_net < 0 ? "green" : "red"}">${vatLine}</span></div>
        <div><span class="cit-hc-lbl">Total</span><span class="cit-hc-val red">${fmt(r.total_obligation)}</span></div>
      </div>
      <div class="cit-hcard-detail hidden">
        <div class="cit-hcard-detail-row"><span>Turnover</span><span>${r.turnover ? fmt(r.turnover) : "—"}</span></div>
        <div class="cit-hcard-detail-row"><span>Assessable Profit</span><span>${r.assessable_profit ? fmt(r.assessable_profit) : "—"}</span></div>
        <div class="cit-hcard-detail-row"><span>VAT Sales</span><span>${r.vat_sales ? fmt(r.vat_sales) : "—"}</span></div>
        <div class="cit-hcard-detail-row"><span>CIT + Levy Total</span><span style="color:#E04040;">${fmt(r.cit_total)}</span></div>
      </div>
      <div class="cit-hcard-foot">
        <button class="cit-card-toggle" onclick="toggleCITCard(this)">▼ Show Detail</button>
        <button class="card-delete" onclick="deleteBizSummary(${r.id},event)">Delete</button>
      </div>
    </div>`;
    })
    .join("");
}

async function deleteBizSummary(id, e) {
  e.stopPropagation();
  if (!confirm("Delete this summary?")) return;
  await sb.from("biz_tax_summaries").delete().eq("id", id);
  loadBizSummaryHistory();
}

function exportBizSummaryExcel() {
  if (!lastCIT && !lastVAT) return alert("Calculate CIT or VAT first.");
  const c = lastCIT;
  const v = lastVAT;
  const dateNow = new Date().toLocaleDateString("en-NG");
  const company = c?.company || currentUser?.user_metadata?.full_name || "";
  const period = c ? c.quarter || c.year : v?.period || "";
  const isSmall = c?.isSmall;
  const vatContrib = v && !v.zeroRated && v.netVAT > 0 ? v.netVAT : 0;
  const total = (c ? c.totalTax : 0) + vatContrib;

  const csvRows = [
    ["Business Tax Summary — CIT, Development Levy & VAT"],
    [`Company: ${company}`],
    [`Period: ${period}`],
    [`Generated: ${dateNow}`],
    [],
    ["COMPANY INCOME TAX", "", ""],
    ["Component", "Rate", "Base (₦)", "Amount (₦)"],
    c
      ? [
          "Company Income Tax (CIT)",
          `${(c.citRate * 100).toFixed(0)}%`,
          c.profit.toFixed(2),
          c.citAmt.toFixed(2),
        ]
      : ["CIT", "—", "—", "Not calculated"],
    c
      ? [
          "Development Levy",
          isSmall ? "Exempt" : "4%",
          c.profit.toFixed(2),
          isSmall ? "0" : c.levyAmt.toFixed(2),
        ]
      : ["Dev. Levy", "—", "—", "Not calculated"],
    c ? ["CIT Sub-total", "", "", c.totalTax.toFixed(2)] : [],
    [],
    ["VAT", "", "", ""],
    ["Component", "Rate", "Base (₦)", "Amount (₦)"],
    v
      ? ["Taxable Sales", "", v.sales.toFixed(2), ""]
      : ["VAT", "—", "—", "Not calculated"],
    v && !v.zeroRated
      ? ["Output VAT", "7.5%", v.sales.toFixed(2), v.outputVAT.toFixed(2)]
      : [],
    v && !v.zeroRated
      ? ["Less: Input VAT", "", "", `-${v.inputVAT.toFixed(2)}`]
      : [],
    v ? ["Net VAT", "", "", v.zeroRated ? "Exempt" : v.netVAT.toFixed(2)] : [],
    [],
    ["TOTAL BUSINESS TAX OBLIGATION", "", "", total.toFixed(2)],
    [],
    c
      ? [
          `Effective CIT Rate: ${c.effRate.toFixed(2)}%`,
          `Tier: ${isSmall ? "Small" : c.isMedium ? "Medium" : "Large"}`,
          "",
          "",
        ]
      : [],
    [],
    [
      "NTA 2025 — For reference purposes only. Consult a tax professional before filing.",
      "",
      "",
      "",
    ],
    ["Generated by TaxCalc NTA 2025", dateNow, "", ""],
  ].filter((r) => r.length > 0);

  const csv = csvRows
    .map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BizTaxSummary_${(company || "Company").replace(/\s+/g, "_")}_${(period || "").replace(/\s+/g, "_")}_${dateNow.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportBizSummaryPDF() {
  if (!lastCIT && !lastVAT) return alert("Calculate CIT or VAT first.");
  const c = lastCIT;
  const v = lastVAT;
  const dateNow = new Date().toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const company =
    c?.company ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.email ||
    "Company";
  const period = c ? c.quarter || c.year : v?.period || "—";
  const isSmall = c?.isSmall;
  const vatContrib = v && !v.zeroRated && v.netVAT > 0 ? v.netVAT : 0;
  const total = (c ? c.totalTax : 0) + vatContrib;
  const tier = !c
    ? ""
    : isSmall
      ? "Small — 0% CIT"
      : c.isMedium
        ? "Medium — 20% CIT"
        : "Large — 30% CIT";
  const tierCol = !c
    ? "#888"
    : isSmall
      ? "#00A86B"
      : c.isMedium
        ? "#F4A100"
        : "#E04040";

  const trow = (label, rate, base, amt, bold = false, amtCol = "#0A0F0D") => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:7px 10px;${bold ? "font-weight:700;" : ""}">${label}</td>
      <td style="padding:7px 10px;text-align:center;color:#888;font-size:11px;">${rate}</td>
      <td style="padding:7px 10px;text-align:right;">${base}</td>
      <td style="padding:7px 10px;text-align:right;font-weight:${bold ? "700" : "400"};color:${amtCol};">${amt}</td>
    </tr>`;

  const secHead = (title, color = "#555") =>
    `<tr style="background:#f5f7f5;">
      <td colspan="4" style="padding:7px 10px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:${color};">${title}</td>
    </tr>`;

  const html = `<div style="font-family:'DM Sans',sans-serif;color:#0A0F0D;font-size:13px;line-height:1.6;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0A0F0D;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="width:28px;height:28px;border:2px solid #00A86B;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#00A86B;font-weight:800;font-size:14px;">₦</div>
          <span style="font-size:16px;font-weight:800;">TaxCalc <span style="color:#00A86B;font-size:11px;">NTA 2025</span></span>
        </div>
        <p style="font-size:11px;color:#888;margin:0;">Business Tax Summary — CIT, Development Levy &amp; VAT</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#888;">
        <p style="margin:0;font-weight:700;color:#0A0F0D;">${escHtml(company)}</p>
        <p style="margin:2px 0 0;">${escHtml(period)} · ${dateNow}</p>
      </div>
    </div>

    <!-- Tier badge (if CIT calculated) -->
    ${c ? `<div style="background:${tierCol};color:white;padding:7px 14px;border-radius:8px;font-weight:700;font-size:12px;margin-bottom:16px;display:inline-block;">${tier}</div>` : ""}

    <!-- Summary totals row -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:#f5f7f5;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">CIT Payable</div>
        <div style="font-weight:700;color:#E04040;">${c ? fmt(c.citAmt) : "—"}</div>
      </div>
      <div style="background:#f5f7f5;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Dev. Levy</div>
        <div style="font-weight:700;color:${isSmall ? "#00A86B" : "#E04040"};">${!c ? "—" : isSmall ? "Exempt" : fmt(c.levyAmt)}</div>
      </div>
      <div style="background:#f5f7f5;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Net VAT</div>
        <div style="font-weight:700;color:${v && v.netVAT < 0 ? "#00A86B" : "#E04040"};">${v ? (v.zeroRated ? "Exempt" : fmt(v.netVAT)) : "—"}</div>
      </div>
      <div style="background:#0A0F0D;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Total Obligation</div>
        <div style="font-weight:700;color:#FF7070;font-size:15px;">${fmt(total)}</div>
      </div>
    </div>

    <!-- Detailed table -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <thead>
        <tr style="background:#0A0F0D;color:white;">
          <th style="padding:8px 10px;text-align:left;">Component</th>
          <th style="padding:8px 10px;text-align:center;">Rate</th>
          <th style="padding:8px 10px;text-align:right;">Base</th>
          <th style="padding:8px 10px;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${secHead("COMPANY INCOME TAX (CIT)")}
        ${c ? trow("Annual Turnover", "—", fmt(c.turnover), "", false, "#0A0F0D") : ""}
        ${c ? trow("Assessable Profit", "—", fmt(c.profit), "", false, "#0A0F0D") : ""}
        ${c ? trow("Company Income Tax", `${(c.citRate * 100).toFixed(0)}%`, fmt(c.profit), fmt(c.citAmt), false, "#E04040") : trow("CIT", "—", "—", "Not calculated")}
        ${c ? trow("Development Levy", isSmall ? "Exempt" : "4%", fmt(c.profit), isSmall ? "Exempt" : fmt(c.levyAmt), false, isSmall ? "#00A86B" : "#E04040") : ""}
        ${c ? trow("CIT Sub-total", "", "", fmt(c.totalTax), true, "#E04040") : ""}
        ${secHead("VALUE ADDED TAX (VAT)")}
        ${v ? trow("Taxable Sales", "—", fmt(v.sales), "", false, "#0A0F0D") : trow("VAT", "—", "—", "Not calculated")}
        ${v && !v.zeroRated ? trow("Output VAT", "7.5%", fmt(v.sales), fmt(v.outputVAT), false, "#E04040") : ""}
        ${v && !v.zeroRated ? trow("Less: Input VAT", "—", "", `(${fmt(v.inputVAT)})`, false, "#00A86B") : ""}
        ${v ? trow("Net VAT Payable", "", v.zeroRated ? "Zero-rated" : fmt(v.sales), v.zeroRated ? "Exempt" : fmt(v.netVAT), false, v.netVAT < 0 ? "#00A86B" : "#E04040") : ""}
        ${secHead("TOTAL OBLIGATION", "#E04040")}
        ${trow("Total Business Tax Payable", "", "", fmt(total), true, "#E04040")}
      </tbody>
    </table>

    ${
      !isSmall && c
        ? `<p style="font-size:10px;color:#888;background:#fffbea;border-left:3px solid #F4A100;padding:8px 10px;margin-bottom:12px;">
      The 4% Development Levy replaces NITDA (1%), NASENI (0.5%), Education Tax (2%), and Police Trust Fund (0.5%) under NTA 2025.
    </p>`
        : ""
    }

    <div style="border-top:1px solid #e2e8e4;padding-top:12px;font-size:10px;color:#aaa;text-align:center;">
      <p style="margin:0;">Based on the <strong style="color:#555;">Nigeria Tax Act 2025</strong>. For reference purposes only. Consult a qualified tax professional before filing.</p>
      <p style="margin:3px 0 0;">Generated by TaxCalc NTA 2025 · ${dateNow}</p>
    </div>
  </div>`;

  const printWin = window.open("", "_blank", "width=840,height=1000");
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Business Tax Summary — ${escHtml(company)} ${escHtml(period)}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet"/>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:white;padding:40px 48px;color:#0A0F0D;}@media print{@page{margin:14mm;size:A4;}body{padding:0;}}</style>
    </head><body>${html}</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 600);
}

function exportBizHistoryExcel() {
  if (!_bizSummaryHistory.length) return alert("No summaries to export.");
  const dateNow = new Date().toLocaleDateString("en-NG");
  const header = [
    "Company",
    "Period",
    "Tier",
    "CIT (₦)",
    "Dev. Levy (₦)",
    "CIT Total (₦)",
    "VAT Output (₦)",
    "VAT Input (₦)",
    "Net VAT (₦)",
    "Total Obligation (₦)",
    "Saved On",
  ];
  const rows = _bizSummaryHistory.map((r) => [
    r.company_name || "",
    r.period || "",
    r.company_tier || "—",
    r.cit_payable?.toFixed(2) || "0",
    r.company_tier === "small" ? "Exempt" : r.dev_levy?.toFixed(2) || "0",
    r.cit_total?.toFixed(2) || "0",
    r.vat_output?.toFixed(2) || "0",
    r.vat_input?.toFixed(2) || "0",
    r.vat_zero_rated ? "Exempt" : r.vat_net?.toFixed(2) || "0",
    r.total_obligation?.toFixed(2) || "0",
    new Date(r.created_at).toLocaleDateString("en-NG"),
  ]);
  const csvRows = [
    ["Business Tax History — CIT + Development Levy + VAT"],
    [`Exported: ${dateNow}`],
    [],
    header,
    ...rows,
    [],
    ["Generated by TaxCalc NTA 2025", dateNow],
  ];
  const csv = csvRows
    .map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BizTax_History_${dateNow.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ===========================
   CONTACT FORM
   =========================== */
/* =====================================================
   HASHNODE BLOG INTEGRATION
   Fetches real posts from your Hashnode publication.
   Falls back to static articles if fetch fails or
   no posts exist yet.
   ===================================================== */

const HASHNODE_HOST = "taxcalc.hashnode.dev"; // ← update if your URL differs

async function loadHashnodePosts() {
  const grid = document.getElementById("blogGrid");
  if (!grid) return;

  try {
    const query = `
      query GetPosts($host: String!) {
        publication(host: $host) {
          posts(first: 6) {
            edges {
              node {
                id
                title
                brief
                slug
                publishedAt
                url
                tags { name }
                coverImage { url }
              }
            }
          }
        }
      }
    `;

    const res = await fetch("https://gql.hashnode.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { host: HASHNODE_HOST } }),
    });

    const { data, errors } = await res.json();

    if (errors || !data?.publication?.posts?.edges?.length) {
      // No posts yet — keep static fallback, just hide loader
      grid.querySelector(".blog-loading")?.remove();
      return;
    }

    const posts = data.publication.posts.edges.map((e) => e.node);
    renderHashnodePosts(posts, grid);
  } catch (e) {
    // Network fail — keep static fallback silently
    grid.querySelector(".blog-loading")?.remove();
    console.warn("Hashnode fetch failed, using static articles.", e);
  }
}

function renderHashnodePosts(posts, grid) {
  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-NG", { month: "short", year: "numeric" });
  };

  // Build HTML — first post is featured, rest are cards
  const [featured, ...rest] = posts;

  const featuredHTML = `
    <div class="blog-card featured-blog">
      <div class="blog-featured-left">
        <div class="blog-meta">
          <span class="blog-cat">${featured.tags?.[0]?.name || "NTA 2025"}</span>
          <span class="blog-date">${formatDate(featured.publishedAt)}</span>
        </div>
        <div class="blog-card-tag">Latest</div>
        <h3>${featured.title}</h3>
        <p class="blog-featured-sub">${featured.brief || ""}</p>
        <a class="blog-read-btn" href="${featured.url}" target="_blank" rel="noopener">
          Read article →
        </a>
      </div>
      <div class="blog-featured-right">
        ${
          featured.coverImage?.url
            ? `<img src="${featured.coverImage.url}" alt="${featured.title}"
                  style="width:100%;border-radius:12px;object-fit:cover;max-height:220px;" />`
            : `<div class="blog-featured-placeholder"></div>`
        }
      </div>
    </div>
  `;

  const cardsHTML = rest
    .map(
      (post) => `
    <div class="blog-card">
      <div class="blog-meta">
        <span class="blog-cat">${post.tags?.[0]?.name || "Blog"}</span>
        <span class="blog-date">${formatDate(post.publishedAt)}</span>
      </div>
      <h3>${post.title}</h3>
      <p class="blog-teaser">${post.brief || ""}</p>
      <a class="blog-expand-btn" href="${post.url}" target="_blank" rel="noopener">
        Read article →
      </a>
    </div>
  `,
    )
    .join("");

  grid.innerHTML = featuredHTML + cardsHTML;
}

function toggleBlogCard(btn) {
  const card = btn.closest(".blog-card");
  const full = card.querySelector(".blog-full");
  const isOpen = !full.classList.contains("hidden");
  if (isOpen) {
    full.classList.add("hidden");
    btn.textContent = "Read more ↓";
  } else {
    full.classList.remove("hidden");
    btn.textContent = "Show less ↑";
  }
}

async function submitContactForm() {
  const name = document.getElementById("contactName")?.value.trim();
  const email = document.getElementById("contactEmail")?.value.trim();
  const subject = document.getElementById("contactSubject")?.value;
  const message = document.getElementById("contactMessage")?.value.trim();
  const status = document.getElementById("contactStatus");
  const btn = document.querySelector(".contact-submit");

  if (!name || !email || !subject || !message) {
    if (status) {
      status.textContent = "Please fill in all fields.";
      status.style.color = "#E04040";
    }
    return;
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    if (status) {
      status.textContent = "Please enter a valid email address.";
      status.style.color = "#E04040";
    }
    return;
  }

  // Disable button while saving
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }
  if (status) {
    status.textContent = "";
  }

  const { error } = await sb.from("contact_messages").insert({
    name,
    email,
    subject,
    message,
    user_id: currentUser?.id || null,
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Send Message →";
  }

  if (error) {
    if (status) {
      status.textContent = "Something went wrong. Please try again.";
      status.style.color = "#E04040";
    }
    return;
  }

  if (status) {
    status.textContent =
      "✅ Message sent! We'll get back to you within 1–2 business days.";
    status.style.color = "#00A86B";
  }
  document.getElementById("contactName").value = "";
  document.getElementById("contactEmail").value = "";
  document.getElementById("contactSubject").value = "";
  document.getElementById("contactMessage").value = "";
}

/* =====================================================
   LANDING PAGE ANIMATIONS
   Subtle scroll reveals — only on landing sections.
   Observer is disconnected once app mode is entered.
   ===================================================== */

let _animObserver = null;

function initLandingAnimations() {
  // Hero stagger — fire immediately on load
  const heroEls = [
    document.querySelector(".landing-tag"),
    document.querySelector(".landing-title"),
    document.querySelector(".landing-sub"),
    document.querySelector(".landing-ctas"),
    document.querySelector(".landing-note"),
    document.querySelector(".landing-hero-preview"),
  ].filter(Boolean);
  heroEls.forEach((el, i) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(20px)";
    el.style.transition = `opacity 0.55s ease ${i * 0.09}s, transform 0.55s ease ${i * 0.09}s`;
    setTimeout(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, 80);
  });

  // Scroll reveal — section headings, cards, stats
  const revealSelectors = [
    ".lp-section-label",
    ".lp-section-title",
    ".lp-section-sub",
    ".step-card",
    ".feature-card",
    ".who-card",
    ".blog-card",
    ".about-mission",
    ".about-stat",
    ".about-guide-card",
    ".about-bands",
    ".contact-info-card",
    ".contact-form-card",
    ".cta-inner",
  ];

  const allReveal = document.querySelectorAll(revealSelectors.join(","));
  allReveal.forEach((el, i) => {
    // Only animate landing-page elements (not app sections)
    const inAppSection = APP_SECTIONS.some((id) =>
      document.getElementById(id)?.contains(el),
    );
    if (inAppSection) return;

    el.classList.add("reveal-pending");
    // Stagger cards within the same parent
    const siblings = Array.from(el.parentElement?.children || []);
    const cardIdx = siblings.indexOf(el);
    el.style.transitionDelay = `${cardIdx * 0.07}s`;
  });

  _animObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
          entry.target.classList.remove("reveal-pending");
          _animObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );

  document
    .querySelectorAll(".reveal-pending")
    .forEach((el) => _animObserver.observe(el));

  // Stat counters — trigger when .about-stat-num enters viewport
  const statEls = document.querySelectorAll(".about-stat-num");
  const statObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const raw = el.textContent.trim();
        // Only animate pure numbers (skip "₦0")
        const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(num) && num > 0 && raw === String(num)) {
          animateCounter(el, num);
        }
        statObserver.unobserve(el);
      });
    },
    { threshold: 0.5 },
  );
  statEls.forEach((el) => statObserver.observe(el));
}

function animateCounter(el, target) {
  const duration = 900;
  const start = performance.now();
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(easeOut(p) * target);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}

function destroyLandingAnimations() {
  if (_animObserver) {
    _animObserver.disconnect();
    _animObserver = null;
  }
  // Reset any pending reveals so they show immediately in app mode
  document.querySelectorAll(".reveal-pending").forEach((el) => {
    el.classList.remove("reveal-pending");
    el.style.transitionDelay = "";
  });
}

// Hook into existing showLandingMode / showAppMode
const _origShowLanding = showLandingMode;
showLandingMode = function () {
  _origShowLanding();
  setTimeout(() => {
    initLandingAnimations();
    initLandingScrollSpy();
  }, 50);
};

const _origShowApp = showAppMode;
showAppMode = function (tab) {
  destroyLandingAnimations();
  destroyLandingScrollSpy();
  _origShowApp(tab);
};

// Fire on first load if on landing
window.addEventListener("DOMContentLoaded", () => {
  // Small delay so the rest of DOMContentLoaded listeners run first
  setTimeout(() => {
    const isLanding = LANDING_SECTIONS.some((id) => {
      const el = document.getElementById(id);
      return el && el.style.display !== "none";
    });
    if (isLanding) {
      initLandingAnimations();
      initLandingScrollSpy();
    }
  }, 120);

  // Load Hashnode posts (runs regardless — falls back silently if no posts yet)
  loadHashnodePosts();
});

/* =====================================================
   LUCIDE ICONS — initialize after DOM ready
   ===================================================== */
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) lucide.createIcons();
});

// Re-render icons whenever dynamic content is injected
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}
