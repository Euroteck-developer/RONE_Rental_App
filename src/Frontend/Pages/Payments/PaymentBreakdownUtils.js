'use strict';

/* ─── Formatting helpers ─────────────────────────────────────────────────── */

export const toFloat = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const round2  = (v) => Math.round(toFloat(v) * 100) / 100;
export const roundRent = (v) => Math.round(toFloat(v));

export const fmtINR = (v) =>
  roundRent(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (v) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(v); }
};

export const toMonthLabel = (monthKey) => {
  if (!monthKey) return '';
  try { return new Date(`${monthKey}-01`).toLocaleString('default', { month: 'long', year: 'numeric' }); }
  catch { return monthKey; }
};

/* ─── Safe array helper — guards against null from API ──────────────────── */
// IMPORTANT: destructuring default `= []` only fires for `undefined`, NOT `null`.
// The API sends `installmentBreakdown: null` for full-payment customers, which
// bypasses the default and causes `.reduce()` to throw.
// Always use this helper instead of relying on destructuring defaults.
const safeArr = (v) => (Array.isArray(v) ? v : []);

/* ─── HTML report (used by View + Print only) ────────────────────────────── */

const REPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; padding: 32px 16px 64px; color: #1e293b; font-size: 13px; line-height: 1.5; }
  .wrap { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.10); overflow: hidden; }
  .report-header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #fff; padding: 28px 32px 20px; }
  .report-header h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .report-header .sub { opacity: .80; font-size: 12px; margin-top: 2px; }
  .report-header .badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-blue   { background: rgba(255,255,255,.2); color: #fff; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }
  .badge-green  { background: #d1fae5; color: #065f46; }
  .badge-teal   { background: #ccfbf1; color: #0f766e; }
  .body { padding: 28px 32px; }
  .sec { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
  .sec-title { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 8px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #64748b; }
  .sec-body { padding: 0; }
  .row-item { display: flex; justify-content: space-between; align-items: center; padding: 9px 16px; border-bottom: 1px solid #f1f5f9; gap: 12px; }
  .row-item:last-child { border-bottom: none; }
  .row-item .lbl { color: #64748b; font-size: 12px; }
  .row-item .val { font-weight: 600; text-align: right; }
  .t-amber { color: #d97706; } .t-blue { color: #2563eb; } .t-green { color: #16a34a; }
  .t-red { color: #dc2626; } .t-teal { color: #0891b2; } .t-purple { color: #7c3aed; } .t-muted { color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #2563eb; color: #fff; font-weight: 600; white-space: nowrap; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.total-row td { background: #fef9c3; font-weight: 700; }
  .total-box { background: linear-gradient(135deg,#1e3a5f,#1e4976); color: #fff; border-radius: 10px; padding: 24px 28px; margin-top: 20px; text-align: center; page-break-inside: avoid; }
  .total-box .label { font-size: 12px; opacity: .75; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 6px; }
  .total-box .main-amount { font-size: 38px; font-weight: 800; color: #4ade80; letter-spacing: -1px; }
  .total-box .formula { font-size: 11px; opacity: .7; margin-top: 8px; }
  .gst-strip { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
  .gst-chip { background: rgba(255,255,255,.15); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .alert { border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; }
  .alert-warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
  .alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #14532d; }
  .alert-info    { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; text-align: center; page-break-inside: avoid; }
  .card .c-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; margin-bottom: 4px; }
  .card .c-val   { font-size: 18px; font-weight: 700; }
  .card .c-sub   { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .card-blue  { border-color: #bfdbfe; background: #eff6ff; } .card-blue  .c-val { color: #2563eb; }
  .card-green { border-color: #bbf7d0; background: #f0fdf4; } .card-green .c-val { color: #16a34a; }
  .card-amber { border-color: #fde68a; background: #fffbeb; } .card-amber .c-val { color: #d97706; }
  .card-red   { border-color: #fecaca; background: #fef2f2; } .card-red   .c-val { color: #dc2626; }
  .card-teal  { border-color: #99f6e4; background: #f0fdfa; } .card-teal  .c-val { color: #0d9488; }
  footer { margin-top: 28px; padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 11px; color: #94a3b8; }
  @media print {
    body { background: #fff; padding: 0; }
    .wrap { box-shadow: none; border-radius: 0; }
    .total-box, th, .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export const generateBreakdownHTML = ({ calculation, paymentDate }) => {
  if (!calculation) return '';

  const {
    customerName = '', customerCode = '', agreementType = '', rentMonth = '',
    paymentMode = '', partialSubType = '',
    grossAmount = 0, tdsAmount = 0, netPayout = 0,
    tdsApplied = false, tdsExempt = false, tdsRate = 10, tdsThreshold = 50000,
    escalationRate = 0, yearsElapsed = 0,
    hasGst = false, gstNo = '', cgstRate = 9, sgstRate = 9, totalGstRate = 18,
    cgstAmount = 0, sgstAmount = 0, totalGstAmount = 0, totalInvoice = 0, netBankTransfer = 0,
    totalSale = 0, totalReceived = 0, receivedPct = 0, is100Pct = false,
    activeInstallments = 0, totalInstallments = 0,
    rentCalculationDetails: d = {},
  } = calculation;

  // ── KEY FIX: safeArr guards against null (destructuring `= []` only covers undefined) ──
  const installmentBreakdown = safeArr(calculation.installmentBreakdown);

  const isPartialFin  = paymentMode === 'partial' && partialSubType === 'financial';
  const isPartialInst = paymentMode === 'partial' && partialSubType === 'installment';
  const isAnyPartial  = isPartialFin || isPartialInst;
  const hasEscalation = escalationRate > 0;

  // Safe reduces — installmentBreakdown is guaranteed to be an array here
  const pBase  = isAnyPartial ? Math.round(installmentBreakdown.reduce((s, i) => s + toFloat(i.base_rent        || 0), 0)) : 0;
  const pEsc   = isAnyPartial ? Math.round(installmentBreakdown.reduce((s, i) => s + toFloat(i.escalation_amount || 0), 0)) : 0;
  const pGross = isAnyPartial ? Math.round(installmentBreakdown.reduce((s, i) => s + toFloat(i.gross_amount      || 0), 0)) : 0;
  const pTds   = isPartialFin
    ? Math.round(tdsAmount)
    : Math.round(installmentBreakdown.reduce((s, i) => s + toFloat(i.tds_amount || 0), 0));
  const pNet   = Math.round(pGross - pTds);

  const activeGross = isAnyPartial ? pGross : Math.round(grossAmount);
  const activeTds   = isAnyPartial ? pTds   : Math.round(tdsAmount);
  const activeNet   = isAnyPartial ? pNet   : Math.round(netPayout);
  const activeNetBT = Math.round(netBankTransfer);

  const tdsLabel     = tdsExempt ? 'Exempt (N)' : tdsApplied ? `Auto-deducted (≥ ₹${tdsThreshold.toLocaleString('en-IN')})` : `Not applicable (< ₹${tdsThreshold.toLocaleString('en-IN')})`;
  const modeLabel    = isPartialFin ? 'Partial — Financial' : isPartialInst ? 'Partial — Instalment' : 'Full Payment';
  const rentMonthDisplay = toMonthLabel(rentMonth) || rentMonth;
  const escCol       = hasEscalation ? '<th>Escalation</th>' : '';

  const instRows = (isPartialFin || isPartialInst)
    ? installmentBreakdown.map((i) => {
        const isProrated  = i.days_charged && i.total_days && i.days_charged < i.total_days;
        const entryHasEsc = (i.escalation_amount || 0) > 0;
        if (isPartialFin) return `<tr>
          <td>${i.installment_no}</td>
          <td>${fmtINR(i.bank_amount)}</td>
          <td class="t-teal">${fmtINR(i.tds_received)}</td>
          <td>${fmtINR(i.amount_received)}</td>
          <td>${i.closure_date || '—'}</td>
          <td class="${isProrated ? 't-amber' : 't-green'}">${i.days_charged ? `${i.days_charged}/${i.total_days}` : '—'}</td>
          <td class="t-blue">${fmtINR(i.base_rent)}</td>
          ${hasEscalation ? `<td class="t-purple">${entryHasEsc ? '+' + fmtINR(i.escalation_amount) : '—'}</td>` : ''}
          <td class="t-amber"><strong>${fmtINR(i.gross_amount)}</strong></td>
        </tr>`;
        return `<tr>
          <td>${i.installment_no}/${installmentBreakdown.length}</td>
          <td>${i.description}</td>
          <td>${i.percentage}%</td>
          <td class="t-amber">${fmtINR(i.gross_amount)}</td>
          <td class="t-red">${i.tds_amount > 0 ? `−${fmtINR(i.tds_amount)}` : '—'}</td>
          <td class="t-green"><strong>${fmtINR(i.net_payout)}</strong></td>
          <td>${i.scheduled_date || '—'}</td>
        </tr>`;
      }).join('')
    : '';

  const instTable = () => {
    if (!installmentBreakdown.length) return '';
    if (isPartialFin) return `
      <div class="sec" style="margin-top:0">
        <div class="sec-title">Installment Breakdown (${activeInstallments} active of ${totalInstallments})</div>
        <div class="sec-body" style="overflow-x:auto">
          <table>
            <thead><tr><th>#</th><th>Bank</th><th>TDS Rcvd</th><th>Total</th><th>Closure Date</th><th>Days</th><th>Base Rent</th>${escCol}<th>Entry Gross</th></tr></thead>
            <tbody>
              ${instRows}
              <tr class="total-row">
                <td colspan="6">Combined Total</td>
                <td>₹${fmtINR(pBase)}</td>
                ${hasEscalation ? `<td class="t-purple">+₹${fmtINR(pEsc)}</td>` : ''}
                <td>₹${fmtINR(pGross)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
    if (isPartialInst) return `
      <div class="sec" style="margin-top:0">
        <div class="sec-title">Instalment Schedule</div>
        <div class="sec-body" style="overflow-x:auto">
          <table>
            <thead><tr><th>#</th><th>Description</th><th>%</th><th>Gross</th><th>TDS</th><th>Net Payout</th><th>Due Date</th></tr></thead>
            <tbody>
              ${instRows}
              <tr class="total-row">
                <td colspan="3">Total</td>
                <td>₹${fmtINR(pGross)}</td>
                <td class="t-red">−₹${fmtINR(pTds)}</td>
                <td class="t-green">₹${fmtINR(pNet)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
    return '';
  };

  const summaryCards = () => {
    if (isPartialFin) return `
      <div class="cards">
        <div class="card card-blue"><div class="c-label">Total Sale</div><div class="c-val">₹${fmtINR(totalSale)}</div><div class="c-sub">Property</div></div>
        <div class="card card-${is100Pct ? 'green' : 'amber'}"><div class="c-label">Received</div><div class="c-val">₹${fmtINR(totalReceived)}</div><div class="c-sub">${receivedPct}%</div></div>
        <div class="card card-amber"><div class="c-label">Gross Rent</div><div class="c-val">₹${fmtINR(pGross)}</div><div class="c-sub">Combined</div></div>
        <div class="card card-${tdsApplied ? 'red' : 'teal'}"><div class="c-label">TDS</div><div class="c-val">₹${fmtINR(pTds)}</div><div class="c-sub">${tdsLabel}</div></div>
        <div class="card card-blue"><div class="c-label">Net Rent</div><div class="c-val">₹${fmtINR(pNet)}</div><div class="c-sub">After TDS</div></div>
        <div class="card card-green"><div class="c-label">Net Transfer</div><div class="c-val">₹${fmtINR(activeNetBT)}</div><div class="c-sub">Final</div></div>
      </div>`;
    return `
      <div class="cards">
        <div class="card card-amber"><div class="c-label">Gross Rent</div><div class="c-val">₹${fmtINR(activeGross)}</div><div class="c-sub">${d.rentType === 'prorated_closure_month' ? 'Prorated' : 'Full month'}</div></div>
        <div class="card card-${tdsApplied ? 'red' : 'teal'}"><div class="c-label">TDS</div><div class="c-val">₹${fmtINR(activeTds)}</div><div class="c-sub">${tdsExempt ? 'Exempt' : tdsApplied ? '10% auto' : 'Below ₹50k'}</div></div>
        <div class="card card-blue"><div class="c-label">Net Rent</div><div class="c-val">₹${fmtINR(activeNet)}</div><div class="c-sub">After TDS</div></div>
        ${hasGst ? `<div class="card card-teal"><div class="c-label">GST (${totalGstRate}%)</div><div class="c-val">₹${fmtINR(cgstAmount + sgstAmount)}</div><div class="c-sub">On Net Rent</div></div>` : ''}
        <div class="card card-green"><div class="c-label">Net Transfer</div><div class="c-val">₹${fmtINR(activeNetBT)}</div><div class="c-sub">Final</div></div>
      </div>`;
  };

  const rentNote = () => {
    if (d.rentType === 'prorated_closure_month')
      return `<div class="alert alert-warning">📅 <strong>Prorated closure month:</strong> Charging <strong>${d.daysFromClosure} of ${d.daysInClosureMonth} days</strong>. Formula: ₹${fmtINR(d.monthlyRent)} × (${d.daysFromClosure}/${d.daysInClosureMonth}) = ₹${fmtINR(d.proratedRent)}</div>`;
    if (d.rentType === 'full_month')
      return `<div class="alert alert-success">✅ <strong>Full month rent</strong> — ₹${fmtINR(d.monthlyRent)} for ${rentMonthDisplay}</div>`;
    return '';
  };

  const gstNote  = hasGst
    ? `<div class="alert alert-info">💡 <strong>GST Note:</strong> CGST &amp; SGST are on <strong>Net Rent after TDS</strong>. Formula: Net ₹${fmtINR(activeNet)} → CGST ${cgstRate}% = ₹${fmtINR(cgstAmount)}, SGST ${sgstRate}% = ₹${fmtINR(sgstAmount)}</div>`
    : '';
  const tdsNote  = tdsExempt
    ? `<div class="alert alert-info">🔒 <strong>TDS Exempt</strong> — Customer marked TDS Not Applicable (N).</div>`
    : tdsApplied
      ? `<div class="alert alert-warning">⚠ <strong>TDS @ ${tdsRate}% auto-applied</strong> — ${isAnyPartial ? 'Combined ' : ''}Gross ₹${fmtINR(activeGross)} ≥ ₹${tdsThreshold.toLocaleString('en-IN')} → TDS = ₹${fmtINR(activeTds)}</div>`
      : `<div class="alert alert-success">✅ <strong>No TDS</strong> — ${isAnyPartial ? 'Combined ' : ''}Gross ₹${fmtINR(activeGross)} &lt; ₹${tdsThreshold.toLocaleString('en-IN')}</div>`;

  const finalTable = () => `
    <div class="sec">
      <div class="sec-title">Payment Summary</div>
      <div class="sec-body">
        <div class="row-item"><span class="lbl">Gross Rent${isAnyPartial ? ' (Combined)' : ''}</span><span class="val t-amber">₹${fmtINR(activeGross)}</span></div>
        <div class="row-item"><span class="lbl">− TDS @ ${tdsRate}% ${tdsExempt ? '(Exempt)' : !tdsApplied ? `(Below ₹${tdsThreshold.toLocaleString('en-IN')})` : ''}</span><span class="val ${tdsApplied ? 't-red' : 't-muted'}">${tdsApplied ? `−₹${fmtINR(activeTds)}` : '₹0'}</span></div>
        <div class="row-item"><span class="lbl">Net Rent (after TDS)</span><span class="val t-blue">₹${fmtINR(activeNet)}</span></div>
        ${hasGst ? `
          <div class="row-item"><span class="lbl">+ CGST @ ${cgstRate}% (on Net Rent)</span><span class="val t-teal">+₹${fmtINR(cgstAmount)}</span></div>
          <div class="row-item"><span class="lbl">+ SGST @ ${sgstRate}% (on Net Rent)</span><span class="val t-teal">+₹${fmtINR(sgstAmount)}</span></div>` : ''}
        <div class="row-item" style="background:#fffbeb"><span class="lbl"><strong>Total Invoice ${hasGst ? `(Net + ${totalGstRate}% GST)` : '(= Net Rent)'}</strong></span><span class="val" style="font-size:15px">₹${fmtINR(totalInvoice)}</span></div>
        <div class="row-item" style="background:#f0fdf4"><span class="lbl" style="font-weight:700">Net Bank Transfer</span><span class="val t-green" style="font-size:17px">₹${fmtINR(activeNetBT)}</span></div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Payment Breakdown — ${customerName}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="report-header">
    <h1>Payment Breakdown</h1>
    <div class="sub">Rent for <strong>${rentMonthDisplay}</strong> &nbsp;·&nbsp; Generated ${fmtDate(new Date())} at ${new Date().toLocaleTimeString('en-IN')}</div>
    <div class="badge-row">
      <span class="badge badge-blue">${customerName}${customerCode ? ` (${customerCode})` : ''}</span>
      <span class="badge badge-yellow">${agreementType}</span>
      <span class="badge badge-${hasGst ? 'teal' : 'blue'}">${hasGst ? `GST: ${gstNo}` : 'No GST'}</span>
      <span class="badge badge-${tdsExempt ? 'blue' : tdsApplied ? 'yellow' : 'green'}">${tdsExempt ? 'TDS Exempt' : tdsApplied ? 'TDS Auto-Applied' : 'No TDS'}</span>
      <span class="badge badge-blue">${modeLabel}</span>
      ${hasEscalation ? `<span class="badge badge-yellow">Escalation: ${escalationRate}%</span>` : ''}
    </div>
  </div>
  <div class="body">
    <div class="sec">
      <div class="sec-title">Customer &amp; Agreement Details</div>
      <div class="sec-body">
        <div class="row-item"><span class="lbl">Customer Name</span><span class="val">${customerName}</span></div>
        <div class="row-item"><span class="lbl">Agreement Type</span><span class="val">${agreementType}</span></div>
        <div class="row-item"><span class="lbl">Payment Mode</span><span class="val">${modeLabel}</span></div>
        <div class="row-item"><span class="lbl">Rent Month</span><span class="val t-blue">${rentMonthDisplay} (${rentMonth})</span></div>
        <div class="row-item"><span class="lbl">Initiation Date</span><span class="val">${fmtDate(paymentDate)}</span></div>
        <div class="row-item"><span class="lbl">Area (sq.ft)</span><span class="val">${d.sqft || '—'}</span></div>
        <div class="row-item"><span class="lbl">Rental Rate / SFT</span><span class="val">₹${d.rentalValuePerSft || '—'}</span></div>
        <div class="row-item"><span class="lbl">Full Monthly Rent</span><span class="val t-amber">₹${fmtINR(d.monthlyRent)}</span></div>
        ${hasEscalation ? `<div class="row-item"><span class="lbl">Escalation Rate</span><span class="val t-purple">${escalationRate}% (${Math.round(yearsElapsed)} yr elapsed)</span></div>` : ''}
        <div class="row-item"><span class="lbl">TDS</span><span class="val">${tdsLabel}</span></div>
        <div class="row-item"><span class="lbl">GST</span><span class="val">${hasGst ? `GSTIN: ${gstNo} — CGST ${cgstRate}% + SGST ${sgstRate}% = ${totalGstRate}% on Net Rent` : 'Not registered'}</span></div>
      </div>
    </div>
    ${isPartialFin ? `
    <div class="sec">
      <div class="sec-title">Collection Summary</div>
      <div class="sec-body">
        <div class="row-item"><span class="lbl">Total Sale Consideration</span><span class="val">₹${fmtINR(totalSale)}</span></div>
        <div class="row-item"><span class="lbl">Total Received</span><span class="val ${is100Pct ? 't-green' : 't-amber'}">₹${fmtINR(totalReceived)} (${receivedPct}%)${is100Pct ? ' ✅' : ''}</span></div>
        <div class="row-item"><span class="lbl">Active / Total Installments</span><span class="val">${activeInstallments} / ${totalInstallments}</span></div>
      </div>
    </div>` : ''}
    ${tdsNote}
    ${rentNote()}
    ${gstNote}
    ${instTable()}
    ${summaryCards()}
    ${finalTable()}
    <div class="total-box">
      <div class="label">Net Bank Transfer · ${rentMonthDisplay}</div>
      <div class="main-amount">₹${fmtINR(activeNetBT)}</div>
      <div class="formula">Gross ₹${fmtINR(activeGross)} − TDS ₹${fmtINR(activeTds)} = Net ₹${fmtINR(activeNet)}${hasGst ? ` + GST ₹${fmtINR(cgstAmount + sgstAmount)}` : ''}</div>
      ${hasGst ? `
      <div class="gst-strip">
        <span class="gst-chip">CGST ${cgstRate}% = ₹${fmtINR(cgstAmount)}</span>
        <span class="gst-chip">SGST ${sgstRate}% = ₹${fmtINR(sgstAmount)}</span>
        <span class="gst-chip">on Net ₹${fmtINR(activeNet)}</span>
      </div>` : ''}
    </div>
  </div>
  <footer>
    <span>Computer-generated — no signature required.</span>
    <span>Rental Management System &nbsp;·&nbsp; ${new Date().toLocaleString('en-IN')}</span>
  </footer>
</div>
</body>
</html>`;
};

/* ─── View / Print (HTML-based) ─────────────────────────────────────────── */

export const viewBreakdown = (payload) => {
  const html = generateBreakdownHTML(payload);
  if (!html) return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const printBreakdown = (payload) => {
  const html = generateBreakdownHTML(payload);
  if (!html) return;
  const w = window.open('', '_blank', 'width=900,height=700,noopener');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch {} }, 400);
};

/* ═══════════════════════════════════════════════════════════════════════════
 * PDF DOWNLOAD — Pure jsPDF drawing API (no html2canvas, no DOM screenshots)
 * ═══════════════════════════════════════════════════════════════════════════ */

const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

const loadJsPDF = () =>
  new Promise((resolve, reject) => {
    if (window.jspdf?.jsPDF) { resolve(window.jspdf.jsPDF); return; }
    const s = document.createElement('script');
    s.src = JSPDF_CDN; s.async = true;
    s.onload  = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF not found after load'));
    s.onerror = () => reject(new Error('Failed to load jsPDF CDN'));
    document.head.appendChild(s);
  });

/* ─── A4 layout constants ─────────────────────────────────────────────────── */
const PW = 210, PH = 297;
const ML = 12, MR = 12, MT = 12, MB = 14;
const CW = PW - ML - MR;

/* ─── Colour palette ──────────────────────────────────────────────────────── */
const C = {
  primary:  [37,  99, 235],
  dark:     [30,  41,  59],
  muted:    [100,116, 139],
  amber:    [217,119,   6],
  green:    [22, 163,  74],
  red:      [220, 38,  38],
  teal:     [8,  145, 178],
  purple:   [124, 58, 237],
  white:    [255,255, 255],
  lightGray:[241,245, 249],
  midGray:  [226,232, 240],
  headerBg: [30,  58, 138],
  totalBg:  [15,  30,  70],
  warnBg:   [255,251, 235],
  successBg:[240,253, 244],
  infoBg:   [239,246, 255],
};

/* ─── PdfBuilder ─────────────────────────────────────────────────────────── */
class PdfBuilder {
  constructor(JsPDF) {
    this.doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    this.y   = MT;
  }

  need(h) {
    if (this.y + h > PH - MB) { this.doc.addPage(); this.y = MT; }
  }

  txt(s, x, y, { size = 9, bold = false, color = C.dark, align = 'left' } = {}) {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    this.doc.text(String(s ?? ''), x, y, { align, baseline: 'middle' });
  }

  rect(x, y, w, h, color) {
    this.doc.setFillColor(...color);
    this.doc.rect(x, y, w, h, 'F');
  }

  rRect(x, y, w, h, r, fillColor, strokeColor = null) {
    if (fillColor)   { this.doc.setFillColor(...fillColor);   this.doc.roundedRect(x, y, w, h, r, r, 'F'); }
    if (strokeColor) { this.doc.setDrawColor(...strokeColor); this.doc.setLineWidth(0.2); this.doc.roundedRect(x, y, w, h, r, r, 'S'); }
  }

  hr(color = C.midGray, lw = 0.2) {
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(lw);
    this.doc.line(ML, this.y, ML + CW, this.y);
  }

  secBar(title) {
    this.need(8);
    this.rect(ML, this.y, CW, 7, C.lightGray);
    this.doc.setDrawColor(...C.midGray); this.doc.setLineWidth(0.2);
    this.doc.rect(ML, this.y, CW, 7, 'S');
    this.txt(title.toUpperCase(), ML + 3, this.y + 3.5, { size: 7.5, bold: true, color: C.muted });
    this.y += 7;
  }

  kv(label, value, valueColor = C.dark) {
    const h = 7;
    this.need(h);
    this.doc.setDrawColor(...C.lightGray); this.doc.setLineWidth(0.15);
    this.doc.line(ML, this.y + h, ML + CW, this.y + h);
    this.txt(label, ML + 3, this.y + h / 2, { size: 8, color: C.muted });
    this.txt(value, ML + CW - 3, this.y + h / 2, { size: 8, bold: true, color: valueColor, align: 'right' });
    this.y += h;
  }

  note(text, type = 'info') {
    const bgMap  = { info: C.infoBg, success: C.successBg, warning: C.warnBg, danger: [254, 242, 242] };
    const clrMap = { info: C.primary, success: C.green, warning: C.amber, danger: C.red };
    const lines  = this.doc.setFontSize(8) && this.doc.splitTextToSize(text, CW - 10);
    const bh     = Math.max(8, lines.length * 4.5 + 4);
    this.need(bh + 2);
    this.rRect(ML, this.y, CW, bh, 2, bgMap[type] || C.infoBg, clrMap[type] || C.primary);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8);
    this.doc.setTextColor(...(clrMap[type] || C.primary));
    lines.forEach((l, i) => this.doc.text(l, ML + 4, this.y + 4.5 + i * 4.5, { baseline: 'middle' }));
    this.y += bh + 3;
  }

  amtRow(label, value, { bold = false, valColor = C.dark, bg = null, h = 7, borderTop = false } = {}) {
    this.need(h);
    if (bg) this.rect(ML, this.y, CW, h, bg);
    if (borderTop) { this.doc.setDrawColor(...C.midGray); this.doc.setLineWidth(0.3); this.doc.line(ML, this.y, ML + CW, this.y); }
    else { this.doc.setDrawColor(...C.lightGray); this.doc.setLineWidth(0.15); this.doc.line(ML, this.y + h, ML + CW, this.y + h); }
    this.txt(label, ML + 3, this.y + h / 2, { size: 8.5, bold, color: C.muted });
    this.txt(value, ML + CW - 3, this.y + h / 2, { size: 8.5, bold: true, color: valColor, align: 'right' });
    this.y += h;
  }

  statCards(cards) {
    const cw = CW / cards.length, ch = 18;
    this.need(ch + 3);
    const colorMap = {
      blue:  { bg: C.infoBg,    val: C.primary },
      green: { bg: C.successBg, val: C.green   },
      amber: { bg: C.warnBg,    val: C.amber   },
      red:   { bg: [254,242,242], val: C.red   },
      teal:  { bg: [240,253,250], val: C.teal  },
    };
    cards.forEach((c, i) => {
      const x  = ML + i * cw;
      const cl = colorMap[c.color] || colorMap.blue;
      this.rRect(x + 0.5, this.y, cw - 1, ch, 2, cl.bg, C.midGray);
      this.txt(c.label, x + cw / 2, this.y + 4,  { size: 6,   color: C.muted,  align: 'center' });
      this.txt(c.value, x + cw / 2, this.y + 10, { size: 8.5, bold: true, color: cl.val, align: 'center' });
      if (c.sub) this.txt(c.sub, x + cw / 2, this.y + 15, { size: 6, color: C.muted, align: 'center' });
    });
    this.y += ch + 4;
  }

  table(headers, rows, widths, { totalRow = null, colColors = [], fontSize = 7.5, rowH = 6.5, headH = 8 } = {}) {
    const PAD = 2.5;
    const anchor = (cx, w, align) => {
      if (align === 'right')  return cx + w - PAD;
      if (align === 'center') return cx + w / 2;
      return cx + PAD;
    };
    const drawCells = (cells, y, h, bgColor, opts) => {
      let cx = ML;
      cells.forEach((cell, ci) => {
        const w  = widths[ci];
        const op = opts[ci] || {};
        const al = op.align || 'left';
        this.doc.setFillColor(...bgColor);
        this.doc.rect(cx, y, w, h, 'F');
        this.doc.setDrawColor(...C.midGray); this.doc.setLineWidth(0.15);
        this.doc.rect(cx, y, w, h, 'S');
        this.doc.setFont('helvetica', op.bold ? 'bold' : 'normal');
        this.doc.setFontSize(op.size || fontSize);
        this.doc.setTextColor(...(op.color || C.dark));
        this.doc.text(String(cell ?? ''), anchor(cx, w, al), y + h / 2, { align: al, baseline: 'middle' });
        cx += w;
      });
    };

    this.need(headH + rows.length * rowH + (totalRow ? rowH : 0) + 2);

    let cx = ML;
    headers.forEach((h, i) => {
      const w  = widths[i];
      const al = colColors[i]?.headerAlign || 'center';
      this.doc.setFillColor(...C.primary);
      this.doc.rect(cx, this.y, w, headH, 'F');
      this.doc.setDrawColor(20, 60, 180); this.doc.setLineWidth(0.2);
      this.doc.rect(cx, this.y, w, headH, 'S');
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(fontSize - 0.5);
      this.doc.setTextColor(...C.white);
      this.doc.text(String(h), anchor(cx, w, al), this.y + headH / 2, { align: al, baseline: 'middle' });
      cx += w;
    });
    this.y += headH;

    rows.forEach((row, ri) => {
      this.need(rowH);
      drawCells(row, this.y, rowH, ri % 2 === 0 ? C.white : C.lightGray, colColors);
      this.y += rowH;
    });

    if (totalRow) {
      this.need(rowH);
      drawCells(totalRow, this.y, rowH, [254, 249, 195], colColors.map(cc => ({ ...cc, bold: true, color: C.dark })));
      this.y += rowH;
    }
    this.y += 2;
  }

  gap(mm = 3) { this.y += mm; }
  save(name)  { this.doc.save(name); }
}

/* ─── downloadBreakdown ──────────────────────────────────────────────────── */
export const downloadBreakdown = async (payload, onProgress) => {
  const { calculation, paymentDate } = payload;
  if (!calculation) return;

  const rawName  = (calculation.customerName || 'Customer').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
  const filename = `Payment_${rawName}_${calculation.rentMonth || 'Month'}.pdf`;

  try {
    onProgress?.('loading');
    const JsPDF = await loadJsPDF();
    onProgress?.('rendering');

    const {
      customerName = '', agreementType = '', rentMonth = '',
      paymentMode = '', partialSubType = '',
      grossAmount = 0, tdsAmount = 0, netPayout = 0,
      tdsApplied = false, tdsExempt = false, tdsRate = 10, tdsThreshold = 50000,
      escalationRate = 0, yearsElapsed = 0,
      hasGst = false, gstNo = '', cgstRate = 9, sgstRate = 9, totalGstRate = 18,
      cgstAmount = 0, sgstAmount = 0, totalGstAmount = 0, totalInvoice = 0, netBankTransfer = 0,
      totalSale = 0, totalReceived = 0, receivedPct = 0, is100Pct = false,
      activeInstallments = 0, totalInstallments = 0,
      rentCalculationDetails: d = {},
    } = calculation;

    // ── KEY FIX: same null guard as HTML path ──
    const instBD = safeArr(calculation.installmentBreakdown);

    const isPartialFin  = paymentMode === 'partial' && partialSubType === 'financial';
    const isPartialInst = paymentMode === 'partial' && partialSubType === 'installment';
    const isAnyPartial  = isPartialFin || isPartialInst;
    const hasEsc        = escalationRate > 0;
    const modeLabel     = isPartialFin ? 'Partial (Financial)' : isPartialInst ? 'Partial (Instalment)' : 'Full Payment';
    const monthDisplay  = toMonthLabel(rentMonth) || rentMonth;

    const pGross = isAnyPartial ? Math.round(instBD.reduce((s, i) => s + toFloat(i.gross_amount || 0), 0)) : 0;
    const pTds   = isPartialFin ? Math.round(tdsAmount) : Math.round(instBD.reduce((s, i) => s + toFloat(i.tds_amount || 0), 0));
    const pNet   = Math.round(pGross - pTds);
    const pBase  = Math.round(instBD.reduce((s, i) => s + toFloat(i.base_rent || 0), 0));
    const pEsc   = Math.round(instBD.reduce((s, i) => s + toFloat(i.escalation_amount || 0), 0));
    const aGross = isAnyPartial ? pGross : Math.round(grossAmount);
    const aTds   = isAnyPartial ? pTds   : Math.round(tdsAmount);
    const aNet   = isAnyPartial ? pNet   : Math.round(netPayout);
    const aNBT   = Math.round(netBankTransfer);

    const R = (v) => `Rs.${fmtINR(v)}`;

    const pb  = new PdfBuilder(JsPDF);
    const doc = pb.doc;

    /* ── PAGE HEADER ── */
    pb.rect(0, 0, PW, 36, C.headerBg);
    pb.rect(0, 36, PW, 1.5, C.primary);
    pb.txt('Payment Breakdown', ML, 11, { size: 17, bold: true, color: C.white });
    pb.txt(`Rent for ${monthDisplay}  |  Generated ${fmtDate(new Date())}  |  ${new Date().toLocaleTimeString('en-IN')}`, ML, 19, { size: 8, color: [180,200,255] });

    const badges = [
      customerName, agreementType, modeLabel,
      tdsExempt ? 'TDS Exempt' : tdsApplied ? 'TDS 10% Applied' : 'No TDS',
      hasGst ? `GST ${gstNo}` : 'No GST',
      ...(hasEsc ? [`Esc ${escalationRate}%`] : []),
    ];
    let bx = ML;
    doc.setFontSize(6.5);
    badges.forEach(b => {
      const tw = doc.getTextWidth(b) + 6;
      if (bx + tw > PW - MR) return;
      pb.rect(bx, 24, tw, 6, [40, 65, 145]);
      pb.rRect(bx, 24, tw, 6, 1.5, null, [80, 110, 200]);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...C.white);
      doc.text(b, bx + 3, 27, { baseline: 'middle' });
      bx += tw + 2;
    });
    pb.y = 42;

    /* ── CUSTOMER DETAILS ── */
    pb.secBar('Customer & Agreement Details');
    pb.kv('Customer Name',    customerName);
    pb.kv('Agreement Type',   agreementType);
    pb.kv('Payment Mode',     modeLabel);
    pb.kv('Rent Month',       `${monthDisplay} (${rentMonth})`, C.primary);
    pb.kv('Initiation Date',  fmtDate(paymentDate));
    if (d.sqft)              pb.kv('Area',        `${d.sqft} sq.ft`);
    if (d.rentalValuePerSft) pb.kv('Rate / SFT',  `Rs.${d.rentalValuePerSft}`);
    pb.kv('Full Monthly Rent', R(d.monthlyRent), C.amber);
    if (hasEsc) pb.kv('Escalation', `${escalationRate}% (${Math.round(toFloat(yearsElapsed))} yr elapsed)`, C.purple);
    pb.kv('TDS', tdsExempt ? 'Exempt (N)' : tdsApplied ? `Auto-deducted (>= Rs.${tdsThreshold.toLocaleString('en-IN')})` : `Not applicable (< Rs.${tdsThreshold.toLocaleString('en-IN')})`);
    pb.kv('GST', hasGst ? `GSTIN: ${gstNo} - CGST ${cgstRate}% + SGST ${sgstRate}% on Net Rent` : 'Not registered');
    pb.gap(3);

    /* ── COLLECTION SUMMARY (partial fin) ── */
    if (isPartialFin) {
      pb.secBar('Collection Summary');
      pb.kv('Total Sale Consideration', R(totalSale));
      pb.kv('Total Received', `${R(totalReceived)} (${receivedPct}%)${is100Pct ? ' 100%' : ''}`, is100Pct ? C.green : C.amber);
      pb.kv('Active / Total Installments', `${activeInstallments} / ${totalInstallments}`);
      pb.gap(3);
    }

    /* ── ALERTS ── */
    if (tdsExempt) {
      pb.note('TDS Exempt - Customer is marked Not Applicable (N). No TDS deducted.', 'info');
    } else if (tdsApplied) {
      pb.note(`TDS @ ${tdsRate}% Auto-Applied - ${isAnyPartial ? 'Combined ' : ''}Gross ${R(aGross)} >= Rs.${tdsThreshold.toLocaleString('en-IN')} -> TDS = ${R(aTds)}`, 'warning');
    } else {
      pb.note(`No TDS - ${isAnyPartial ? 'Combined ' : ''}Gross ${R(aGross)} < Rs.${tdsThreshold.toLocaleString('en-IN')}`, 'success');
    }
    if (d.rentType === 'prorated_closure_month') {
      pb.note(`Prorated Closure Month: Charging ${d.daysFromClosure} of ${d.daysInClosureMonth} days. Formula: ${R(d.monthlyRent)} x (${d.daysFromClosure}/${d.daysInClosureMonth}) = ${R(d.proratedRent)}`, 'warning');
    } else if (d.rentType === 'full_month') {
      pb.note(`Full Month Rent - ${R(d.monthlyRent)} for ${monthDisplay}`, 'success');
    }
    if (hasGst) {
      pb.note(`GST Note: CGST & SGST are calculated on Net Rent after TDS (not Gross). Base = ${R(aNet)} -> CGST ${cgstRate}% = ${R(cgstAmount)},  SGST ${sgstRate}% = ${R(sgstAmount)}`, 'info');
    }

    /* ── INSTALLMENT TABLES ── */
    if (isPartialFin && instBD.length) {
      pb.secBar(`Installment Breakdown (${activeInstallments} active of ${totalInstallments})`);
      const hasEscCol = hasEsc;
      const W = hasEscCol ? [8,26,22,24,24,12,24,18,28] : [8,30,24,26,28,14,28,28];
      const H = hasEscCol
        ? ['#','Bank','TDS Rcvd','Total','Closure','Days','Base Rent','Esc.','Entry Gross']
        : ['#','Bank','TDS Rcvd','Total','Closure Date','Days','Base Rent','Entry Gross'];
      const baseCC = [
        { align: 'center' }, { align: 'left' }, { align: 'right' }, { align: 'right' },
        { align: 'center' }, { align: 'center' }, { align: 'right' }, { align: 'right' },
      ];
      const CC = hasEscCol ? [...baseCC.slice(0,7), { align:'right' }, { align:'right' }] : baseCC;

      const rows = instBD.map(i => {
        const r = [
          String(i.installment_no),
          fmtINR(i.bank_amount),
          fmtINR(i.tds_received),
          fmtINR(i.amount_received),
          i.closure_date || '-',
          i.days_charged ? `${i.days_charged}/${i.total_days}` : '-',
          fmtINR(i.base_rent),
        ];
        if (hasEscCol) r.push((i.escalation_amount || 0) > 0 ? `+${fmtINR(i.escalation_amount)}` : '-');
        r.push(fmtINR(i.gross_amount));
        return r;
      });
      const tot = ['','','','','','Total', fmtINR(pBase)];
      if (hasEscCol) tot.push(`+${fmtINR(pEsc)}`);
      tot.push(fmtINR(pGross));
      pb.table(H, rows, W, { totalRow: tot, colColors: CC, fontSize: 7.2, rowH: 7, headH: 8 });
      pb.gap(2);
    }

    if (isPartialInst && instBD.length) {
      pb.secBar('Instalment Schedule');
      const W = [12,46,16,28,22,28,20];
      const H = ['#','Description','%','Gross','TDS','Net Payout','Due'];
      const rows = instBD.map(i => [
        `${i.installment_no}/${instBD.length}`, i.description, `${i.percentage}%`,
        fmtINR(i.gross_amount), i.tds_amount > 0 ? `-${fmtINR(i.tds_amount)}` : '-',
        fmtINR(i.net_payout), i.scheduled_date || '-',
      ]);
      pb.table(H, rows, W, {
        totalRow: ['','','Total', fmtINR(pGross), `-${fmtINR(pTds)}`, fmtINR(pNet), ''],
        colColors: [{},{},{ align:'right' },{ align:'right',color:C.amber },{ align:'right',color:C.red },{ align:'right',color:C.green },{}],
        fontSize: 7.5, rowH: 6.5, headH: 7.5,
      });
      pb.gap(2);
    }

    /* ── STAT CARDS ── */
    pb.secBar('Summary');
    const cards = isPartialFin ? [
      { label:'Total Sale',   value:R(totalSale),    sub:'Property', color:'blue' },
      { label:'Received',     value:R(totalReceived),sub:`${receivedPct}%`, color:is100Pct?'green':'amber' },
      { label:'Gross Rent',   value:R(pGross),       sub:'Combined', color:'amber' },
      { label:'TDS',          value:R(pTds),         sub:tdsExempt?'Exempt':tdsApplied?'10% auto':'Below 50k', color:tdsApplied?'red':'teal' },
      { label:'Net Rent',     value:R(pNet),         sub:'After TDS', color:'blue' },
      { label:'Net Transfer', value:R(aNBT),         sub:'Final', color:'green' },
    ] : [
      { label:'Gross Rent',   value:R(aGross), sub:d.rentType==='prorated_closure_month'?'Prorated':'Full month', color:'amber' },
      { label:'TDS',          value:R(aTds),   sub:tdsExempt?'Exempt':tdsApplied?'10% auto':'Below 50k', color:tdsApplied?'red':'teal' },
      { label:'Net Rent',     value:R(aNet),   sub:'After TDS', color:'blue' },
      ...(hasGst ? [{ label:`GST ${totalGstRate}%`, value:R(cgstAmount+sgstAmount), sub:'On Net Rent', color:'teal' }] : []),
      { label:'Net Transfer', value:R(aNBT),   sub:'Final', color:'green' },
    ];
    pb.statCards(cards);

    /* ── PAYMENT SUMMARY ── */
    pb.secBar('Payment Summary');
    pb.amtRow(`Gross Rent${isAnyPartial?' (Combined)':''}`, R(aGross), { valColor: C.amber });
    pb.amtRow(`- TDS @ ${tdsRate}% ${tdsExempt?'(Exempt)':!tdsApplied?`(Below Rs.${tdsThreshold.toLocaleString('en-IN')})`:''} `, tdsApplied?`-${R(aTds)}`:'Rs.0.00', { valColor: tdsApplied ? C.red : C.muted });
    pb.amtRow('Net Rent (after TDS)', R(aNet), { valColor: C.primary });
    if (hasGst) {
      pb.amtRow(`+ CGST @ ${cgstRate}% (on Net Rent)`, `+${R(cgstAmount)}`, { valColor: C.teal });
      pb.amtRow(`+ SGST @ ${sgstRate}% (on Net Rent)`, `+${R(sgstAmount)}`, { valColor: C.teal });
    }
    pb.amtRow(`Total Invoice${hasGst?` (Net + ${totalGstRate}% GST)`:''}`, R(totalInvoice), { bg: C.warnBg, bold: true, valColor: C.amber, h: 8 });
    pb.amtRow('Net Bank Transfer', R(aNBT), { bg: C.successBg, bold: true, valColor: C.green, h: 9, borderTop: true });
    pb.gap(5);

    /* ── TOTAL BOX ── */
    pb.need(42);
    pb.rRect(ML, pb.y, CW, 40, 3, C.totalBg, null);
    pb.txt(`NET BANK TRANSFER  |  ${monthDisplay}`, PW/2, pb.y+8, { size:7.5, color:[180,200,255], align:'center' });
    pb.txt(R(aNBT), PW/2, pb.y+20, { size:24, bold:true, color:[74,222,128], align:'center' });
    const formula = `Gross ${R(aGross)}  -  TDS ${R(aTds)}  =  Net ${R(aNet)}${hasGst?`  +  GST ${R(cgstAmount+sgstAmount)}`:''}`;
    pb.txt(formula, PW/2, pb.y+30, { size:7, color:[180,200,255], align:'center' });
    if (hasGst) pb.txt(`CGST ${cgstRate}% = ${R(cgstAmount)}   |   SGST ${sgstRate}% = ${R(sgstAmount)}   |   on Net ${R(aNet)}`, PW/2, pb.y+36, { size:6.5, color:[180,200,255], align:'center' });
    pb.y += 43;

    /* ── FOOTER on every page ── */
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      pb.rect(0, PH-10, PW, 10, C.lightGray);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...C.muted);
      doc.text('Computer-generated - no signature required.', ML, PH-5, { baseline:'middle' });
      doc.text(`Rental Management System  |  ${new Date().toLocaleString('en-IN')}  |  Page ${p}/${totalPages}`, PW-MR, PH-5, { baseline:'middle', align:'right' });
    }

    pb.save(filename);
    onProgress?.('done');

  } catch (err) {
    onProgress?.('error');
    console.error('[PDF error]', err);
    // Fallback: HTML download
    try {
      const html = generateBreakdownHTML(payload);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename.replace('.pdf', '.html');
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {}
    throw err;
  }
};