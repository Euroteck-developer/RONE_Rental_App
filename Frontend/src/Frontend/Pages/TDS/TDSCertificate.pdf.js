import autoTable from 'jspdf-autotable';

// ─── Page geometry ────────────────────────────────────────────────────────────
export const A4       = { W: 210, H: 297 };
const MARGIN          = 14;
const CONTENT_W       = A4.W - MARGIN * 2;
const HEADER_H        = 28;
const FOOTER_H        = 20;
const CONTENT_TOP     = HEADER_H + 7;
const SYSTEM_MSG_H    = 7;

// ─── Colour palette ───────────────────────────────────────────────────────────
const CLR = {
  navy:        [15,  40, 100],
  navyMid:     [30,  65, 155],
  navyLight:   [44,  90, 190],
  white:       [255, 255, 255],
  offWhite:    [248, 250, 253],
  tableHead:   [235, 240, 252],
  tableHeadTx: [22,  40,  90],
  rowEven:     [255, 255, 255],
  rowOdd:      [245, 247, 252],
  totalBg:     [225, 232, 248],
  totalTx:     [15,  40, 100],
  netPaidBg:   [220, 242, 230],
  netPaidTx:   [18,  90,  50],
  border:      [210, 218, 235],
  textDark:    [22,  32,  58],
  textMuted:   [100, 112, 145],
  labelBg:     [234, 239, 252],
  footerTxt:   [160, 182, 232],
  green:       [22, 115,  68],
  red:         [192,  40,  40],
  cardBg:      [252, 253, 255],
  sysMsgBg:    [240, 244, 255],
  sysMsgTx:    [70,  90, 160],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const r2 = (v) => Math.round(parseFloat(v) || 0);

const setFont = (doc, size, style = 'normal', color = CLR.textDark) => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

const txt = (doc, text, x, y, opts = {}) =>
  doc.text(String(text ?? ''), x, y, { baseline: 'middle', ...opts });

const rRect = (doc, x, y, w, h, r, style = 'F') =>
  doc.roundedRect(x, y, w, h, r, r, style);

const isValidBase64Image = (b64) =>
  typeof b64 === 'string' &&
  b64.startsWith('data:image/') &&
  b64.includes(';base64,') &&
  b64.length > 500;

// ─── Formatters ───────────────────────────────────────────────────────────────
export const fmtMoney = (v) =>
  `Rs.${r2(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const fmtMonth = (ym) => {
  if (!ym) return '';
  const M = {
    '01': 'January',  '02': 'February', '03': 'March',    '04': 'April',
    '05': 'May',      '06': 'June',     '07': 'July',     '08': 'August',
    '09': 'September','10': 'October',  '11': 'November', '12': 'December',
  };
  const [y, m] = ym.split('-');
  return `${M[m] || m} ${y}`;
};

export const fmtDate = (d) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return String(d); }
};

// ─── GST calculation ──────────────────────────────────────────────────────────
// Priority order:
//   1. Pre-computed _cgstAmt / _sgstAmt attached by aggregatePayments (from SQL)
//   2. Backend cgst_amount / sgst_amount / gst_amount fields
//   3. Derive from rates applied to net_payout (fallback only)
export const calcGST = (p) => {
  if (p._cgstAmt !== undefined && p._sgstAmt !== undefined) {
    const cgstAmt  = r2(p._cgstAmt);
    const sgstAmt  = r2(p._sgstAmt);
    const gstTotal = r2(p._gstTotal !== undefined ? p._gstTotal : cgstAmt + sgstAmt);
    return { hasGST: cgstAmt > 0 || sgstAmt > 0, cgstAmt, sgstAmt, gstTotal };
  }
  if (p.cgst_amount !== undefined && p.sgst_amount !== undefined) {
    const cgstAmt  = r2(p.cgst_amount);
    const sgstAmt  = r2(p.sgst_amount);
    const gstTotal = r2(p.gst_amount !== undefined ? p.gst_amount : cgstAmt + sgstAmt);
    return { hasGST: cgstAmt > 0 || sgstAmt > 0, cgstAmt, sgstAmt, gstTotal };
  }
  const net     = r2(p.net_payout);
  const cgstPc  = parseFloat(p.cgst) || 0;
  const sgstPc  = parseFloat(p.sgst) || 0;
  const hasGST  = !!(p.gst_no && (cgstPc > 0 || sgstPc > 0));
  const cgstAmt = hasGST ? r2(net * cgstPc / 100) : 0;
  const sgstAmt = hasGST ? r2(net * sgstPc / 100) : 0;
  return { hasGST, cgstAmt, sgstAmt, gstTotal: r2(cgstAmt + sgstAmt) };
};

// ─── Group payments by month ──────────────────────────────────────────────────
// Combines multiple installments (Inst 1/2, Inst 2/2) into one row per month.
// This ensures "Gross Rent" in the PDF table equals the full combined gross,
// not just the installment that happened to carry TDS.
//
// Input:  certData.payments — may be flat (one record per installment) or
//         already pre-grouped (one record per month) depending on caller.
// Output: sorted array with one entry per payment_month, amounts summed.
const groupPaymentsByMonth = (payments) => {
  const map = {};
  payments.forEach((p) => {
    const mk = p.payment_month;
    if (!map[mk]) {
      map[mk] = {
        payment_month: mk,
        gross_amount:  0,
        tds_amount:    0,
        net_payout:    0,
        _cgstAmt:      0,
        _sgstAmt:      0,
        _gstTotal:     0,
        tds_rate:      p.tds_rate || 10,
        gst_no:        p.gst_no,
        cgst:          p.cgst,
        sgst:          p.sgst,
      };
    }
    const row     = map[mk];
    const gross   = r2(p.gross_amount);
    const tds     = r2(p.tds_amount);
    const net     = r2(p.net_payout);

    // Prefer pre-computed GST amounts; fall back to deriving
    const gst     = calcGST(p);

    row.gross_amount = r2(row.gross_amount + gross);
    row.tds_amount   = r2(row.tds_amount   + tds);
    row.net_payout   = r2(row.net_payout   + net);
    row._cgstAmt     = r2(row._cgstAmt     + gst.cgstAmt);
    row._sgstAmt     = r2(row._sgstAmt     + gst.sgstAmt);
    row._gstTotal    = r2(row._gstTotal    + gst.gstTotal);
  });

  return Object.values(map).sort((a, b) => a.payment_month.localeCompare(b.payment_month));
};

// ─── FY helper ────────────────────────────────────────────────────────────────
export const getCurrentFY = () => {
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();
  return m >= 4
    ? { startYear: y,     endYear: y + 1, label: `${y}-${y + 1}` }
    : { startYear: y - 1, endYear: y,     label: `${y - 1}-${y}` };
};

// ─── Image loader ─────────────────────────────────────────────────────────────
export const loadImageAsBase64 = (imgSrc) =>
  new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = imgSrc;
  });

// ─── Header ───────────────────────────────────────────────────────────────────
const _plainHeader = (doc, pageW) => {
  doc.setFillColor(...CLR.navy);
  doc.rect(0, 0, pageW, HEADER_H, 'F');
  setFont(doc, 11, 'bold', CLR.white);
  txt(doc, 'R-ONE PROPERTY MANAGEMENT', pageW / 2, HEADER_H / 2 - 3, { align: 'center' });
  setFont(doc, 7, 'normal', [180, 200, 240]);
  txt(doc, 'Corporate Office  |  TDS Certificate Division', pageW / 2, HEADER_H / 2 + 4, { align: 'center' });
};

const drawHeader = (doc, b64, pageW) => {
  if (isValidBase64Image(b64)) {
    try { doc.addImage(b64, 'PNG', 0, 0, pageW, HEADER_H); }
    catch { _plainHeader(doc, pageW); }
  } else {
    _plainHeader(doc, pageW);
  }
  doc.setDrawColor(...CLR.navyLight);
  doc.setLineWidth(0.4);
  doc.line(0, HEADER_H, pageW, HEADER_H);
};

// ─── Footer ───────────────────────────────────────────────────────────────────
const _plainFooter = (doc, pageW, fY) => {
  doc.setFillColor(...CLR.navy);
  doc.rect(0, fY, pageW, FOOTER_H, 'F');
};

const drawFooter = (doc, b64, pageW, pageH) => {
  const fY = pageH - FOOTER_H;
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.4);
  doc.line(0, fY, pageW, fY);
  if (isValidBase64Image(b64)) {
    try { doc.addImage(b64, 'PNG', 0, fY, pageW, FOOTER_H); }
    catch { _plainFooter(doc, pageW, fY); }
  } else {
    _plainFooter(doc, pageW, fY);
  }
  setFont(doc, 6.5, 'italic', CLR.footerTxt);
};

// ─── System notice (above footer) ────────────────────────────────────────────
const drawSystemNotice = (doc, pageW, pageH) => {
  const noticeY = pageH - FOOTER_H - SYSTEM_MSG_H - 1;
  doc.setFillColor(...CLR.sysMsgBg);
  doc.rect(MARGIN, noticeY, CONTENT_W, SYSTEM_MSG_H, 'F');
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, noticeY, CONTENT_W, SYSTEM_MSG_H, 'S');
  setFont(doc, 6.8, 'italic', CLR.sysMsgTx);
  txt(
    doc,
    '* This is a system generated TDS Certificate. No physical signature required.',
    pageW / 2,
    noticeY + SYSTEM_MSG_H / 2,
    { align: 'center' },
  );
};

// ─── Full page chrome (background + header + footer + system notice) ──────────
const paintPage = (doc, hB64, fB64, pageW, pageH) => {
  doc.setFillColor(...CLR.offWhite);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawHeader(doc, hB64, pageW);
  drawFooter(doc, fB64, pageW, pageH);
  drawSystemNotice(doc, pageW, pageH);
};

// Bottom limit = last safe Y before system-notice + footer zone.
// All content must stay above this line.
const getBottomLimit = (pageH) => pageH - FOOTER_H - SYSTEM_MSG_H - 6;

// ─── Section heading bar ──────────────────────────────────────────────────────
const sectionHeading = (doc, label, y) => {
  doc.setFillColor(...CLR.labelBg);
  doc.rect(MARGIN, y, CONTENT_W, 7.5, 'F');
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, CONTENT_W, 7.5, 'S');
  doc.setFillColor(...CLR.navy);
  doc.rect(MARGIN, y, 3.5, 7.5, 'F');
  setFont(doc, 8, 'bold', CLR.navy);
  txt(doc, label, MARGIN + 8, y + 3.75);
  return y + 10;
};

// ─── Two-column detail row ────────────────────────────────────────────────────
const detailRow = (doc, label, value, x, y, colW, rowH = 6.8) => {
  const LW = 26;
  setFont(doc, 7, 'bold', CLR.navyMid);
  txt(doc, `${label}:`, x + 3, y + rowH / 2);
  setFont(doc, 7.5, 'normal', CLR.textDark);
  const lines = doc.splitTextToSize(String(value ?? '-'), colW - LW - 6);
  lines.forEach((ln, i) => txt(doc, ln, x + LW, y + rowH / 2 + i * 4));
};

// ─── Summary cards ────────────────────────────────────────────────────────────
const drawSummaryCards = (doc, hasGST, certData, y) => {
  const net          = r2(certData.totalNet);
  const cgstAmt      = r2(certData.totalCGST);
  const sgstAmt      = r2(certData.totalSGST);
  const totalPayable = r2(net + cgstAmt + sgstAmt);

  const cards = hasGST
    ? [
        { label: 'Gross Rent',      value: fmtMoney(certData.totalGross), color: CLR.navy    },
        { label: 'TDS Deducted',    value: fmtMoney(certData.totalTDS),   color: CLR.red     },
        { label: 'Net (after TDS)', value: fmtMoney(net),                 color: CLR.navyMid },
        { label: 'CGST (on Net)',   value: fmtMoney(cgstAmt),             color: CLR.navyMid },
        { label: 'SGST (on Net)',   value: fmtMoney(sgstAmt),             color: CLR.navyMid },
        { label: 'Total Payable',   value: fmtMoney(totalPayable),        color: CLR.green   },
      ]
    : [
        { label: 'Gross Rent',        value: fmtMoney(certData.totalGross), color: CLR.navy  },
        { label: 'TDS Deducted @10%', value: fmtMoney(certData.totalTDS),  color: CLR.red   },
        { label: 'Net Paid to You',   value: fmtMoney(net),                color: CLR.green },
      ];

  const gap = 3;
  const cW  = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  const cH  = 18;

  cards.forEach((c, i) => {
    const cx = MARGIN + i * (cW + gap);
    doc.setFillColor(...CLR.cardBg);
    rRect(doc, cx, y, cW, cH, 2);
    doc.setDrawColor(...CLR.border);
    doc.setLineWidth(0.25);
    rRect(doc, cx, y, cW, cH, 2, 'S');
    doc.setFillColor(...c.color);
    doc.rect(cx, y, cW, 2.5, 'F');
    setFont(doc, 5.8, 'normal', CLR.textMuted);
    txt(doc, c.label.toUpperCase(), cx + cW / 2, y + 8, { align: 'center' });
    setFont(doc, 7.5, 'bold', c.color);
    txt(doc, c.value, cx + cW / 2, y + 14, { align: 'center' });
  });

  return y + cH + 5;
};

// =============================================================================
// MAIN BUILDER
// =============================================================================
export const buildTDSCertificate = (doc, certData, options) => {
  const {
    selectedQuarter,
    quarterInfo,
    fy,
    pageIndex = 0,
    headerBase64,
    footerBase64,
  } = options;

  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const botLim = getBottomLimit(pageH);

  const isNRI  = (certData.nriStatus || '').toLowerCase() === 'yes';
  const hasGST = !!(certData.gstNo && (r2(certData.totalCGST) > 0 || r2(certData.totalSGST) > 0));

  const certNo    = `TDS-${selectedQuarter}-${fy.label}-${certData.customerId || (pageIndex + 1)}`;
  const issueDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  // ── Adds a new page and repaints full chrome; returns CONTENT_TOP ──────────
  const addFreshPage = () => {
    doc.addPage();
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    paintPage(doc, headerBase64, footerBase64, pw, ph);
    return CONTENT_TOP;
  };

  // ── Ensure the next block (height h) fits; if not, start a fresh page ──────
  const ensureSpace = (y, h) => (y + h > botLim ? addFreshPage() : y);

  // ─── Paint first page ──────────────────────────────────────────────────────
  paintPage(doc, headerBase64, footerBase64, pageW, pageH);
  let y = CONTENT_TOP;

  // ─── Title block ──────────────────────────────────────────────────────────
  y = ensureSpace(y, 40);
  doc.setFillColor(...CLR.navy);
  rRect(doc, MARGIN, y, CONTENT_W, 13, 2);
  setFont(doc, 12, 'bold', CLR.white);
  txt(doc, 'FORM 16C  -  TDS CERTIFICATE', pageW / 2, y + 6.5, { align: 'center' });
  y += 15;

  y = ensureSpace(y, 6);
  setFont(doc, 7, 'normal', CLR.textMuted);
  txt(
    doc,
    `Certificate of Deduction of Tax at Source u/s 194-IB  |  FY ${fy.label}  |  ${quarterInfo.label}  |  Due: ${quarterInfo.dueDate}`,
    pageW / 2, y, { align: 'center' },
  );
  y += 5;

  // Meta ribbon
  y = ensureSpace(y, 10);
  doc.setFillColor(...CLR.labelBg);
  rRect(doc, MARGIN, y, CONTENT_W, 8, 2);
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.25);
  rRect(doc, MARGIN, y, CONTENT_W, 8, 2, 'S');
  setFont(doc, 7.5, 'bold', CLR.navy);
  txt(doc, `Certificate No: ${certNo}`, MARGIN + 5, y + 4);
  setFont(doc, 7.5, 'normal', CLR.textMuted);
  txt(doc, `Issued: ${issueDate}`, pageW / 2, y + 4, { align: 'center' });
  txt(doc, `FY ${fy.label}`, MARGIN + CONTENT_W - 5, y + 4, { align: 'right' });
  if (isNRI) {
    doc.setFillColor(192, 30, 30);
    rRect(doc, MARGIN + CONTENT_W - 42, y + 1, 20, 6, 1.5);
    setFont(doc, 6.5, 'bold', CLR.white);
    txt(doc, 'NRI', MARGIN + CONTENT_W - 32, y + 4, { align: 'center' });
  }
  y += 12;

  // ─── Two-column info cards ─────────────────────────────────────────────────
  const colW  = (CONTENT_W - 6) / 2;
  const ROW_H = 6.8;
  const HDR_H = 9;

  const deductorRows = [
    ['Name',    'R-ONE Property Management'],
    ['PAN',     'AAACP1234A'],
    ['TAN',     'MUMB12345A'],
    ['Address', 'R-ONE Tower, Hyderabad - 500001'],
    ['Email',   'accounts@rentalapp.com'],
  ];

  const deducteeRows = [
    ['Name',       certData.customerName      || '-'],
    ['PAN',        certData.panNumber         || '-'],
    ['Bank A/C',   certData.bankAccountNumber || '-'],
    ['IFSC',       certData.ifscCode          || '-'],
    ['Agreement',  certData.agreementType     || '-'],
    ['Floor/Unit', `${certData.floorNo || '-'} / ${certData.unitNo || '-'}`],
  ];
  if (isNRI) deducteeRows.push(['Status', 'Non-Resident Indian (NRI)']);
  if (hasGST) {
    deducteeRows.push(['GST No', certData.gstNo || '-']);
    deducteeRows.push(['CGST',   `${parseFloat(certData.cgst || 0).toFixed(1)}%`]);
    deducteeRows.push(['SGST',   `${parseFloat(certData.sgst || 0).toFixed(1)}%`]);
  }

  const maxRows = Math.max(deductorRows.length, deducteeRows.length);
  const cardH   = HDR_H + maxRows * ROW_H + 4;
  const col1x   = MARGIN;
  const col2x   = MARGIN + colW + 6;

  y = ensureSpace(y, cardH + 10);

  // Deductor card
  doc.setFillColor(...CLR.white);
  rRect(doc, col1x, y, colW, cardH, 2);
  doc.setDrawColor(...CLR.border); doc.setLineWidth(0.3);
  rRect(doc, col1x, y, colW, cardH, 2, 'S');
  doc.setFillColor(...CLR.navy);
  rRect(doc, col1x, y, colW, HDR_H, 2);
  doc.rect(col1x, y + HDR_H - 2, colW, 2, 'F');
  setFont(doc, 7.5, 'bold', CLR.white);
  txt(doc, 'DEDUCTOR  (LANDLORD / COMPANY)', col1x + colW / 2, y + HDR_H / 2, { align: 'center' });
  deductorRows.forEach(([lbl, val], i) =>
    detailRow(doc, lbl, val, col1x, y + HDR_H + i * ROW_H, colW));

  // Deductee card
  doc.setFillColor(...CLR.white);
  rRect(doc, col2x, y, colW, cardH, 2);
  doc.setDrawColor(...CLR.border); doc.setLineWidth(0.3);
  rRect(doc, col2x, y, colW, cardH, 2, 'S');
  doc.setFillColor(...CLR.navyMid);
  rRect(doc, col2x, y, colW, HDR_H, 2);
  doc.rect(col2x, y + HDR_H - 2, colW, 2, 'F');
  setFont(doc, 7.5, 'bold', CLR.white);
  txt(doc, 'DEDUCTEE  (TENANT / CUSTOMER)', col2x + colW / 2, y + HDR_H / 2, { align: 'center' });
  deducteeRows.forEach(([lbl, val], i) =>
    detailRow(doc, lbl, val, col2x, y + HDR_H + i * ROW_H, colW));

  y += cardH + 8;

  // ─── Payment details table ─────────────────────────────────────────────────
  // KEY FIX: group into one row per payment_month before building the table.
  // This combines Inst 1 + Inst 2 gross/tds/net into a single combined row,
  // so "Gross Rent" in the table equals the full month's combined gross rent.
  const monthlyRows = groupPaymentsByMonth(certData.payments || []);

  y = ensureSpace(y, 20);
  y = sectionHeading(doc, 'PAYMENT DETAILS', y);

  let tableHead, tableBody, tableFoot, colStyles;

  if (hasGST) {
    tableHead = [['Month', 'Gross\n(A)', 'TDS\n(B)', 'Net\n(A-B)', 'CGST\non Net', 'SGST\non Net', 'Total\nPayable']];
    tableBody = monthlyRows.map((p) => {
      const gross  = r2(p.gross_amount);
      const tdsAmt = r2(p.tds_amount);
      const net    = r2(p.net_payout);
      const g      = calcGST(p);
      return [
        fmtMonth(p.payment_month),
        fmtMoney(gross),
        fmtMoney(tdsAmt),
        fmtMoney(net),
        fmtMoney(g.cgstAmt),
        fmtMoney(g.sgstAmt),
        fmtMoney(r2(net + g.cgstAmt + g.sgstAmt)),
      ];
    });

    const footNet     = r2(certData.totalNet);
    const footCGST    = r2(certData.totalCGST);
    const footSGST    = r2(certData.totalSGST);
    const footPayable = r2(footNet + footCGST + footSGST);

    tableFoot = [[
      'TOTAL',
      fmtMoney(r2(certData.totalGross)),
      fmtMoney(r2(certData.totalTDS)),
      fmtMoney(footNet),
      fmtMoney(footCGST),
      fmtMoney(footSGST),
      fmtMoney(footPayable),
    ]];
    colStyles = {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: 26, halign: 'right'  },
      2: { cellWidth: 24, halign: 'right'  },
      3: { cellWidth: 26, halign: 'right'  },
      4: { cellWidth: 24, halign: 'right'  },
      5: { cellWidth: 24, halign: 'right'  },
      6: { cellWidth: 32, halign: 'right'  },
    };
  } else {
    tableHead = [['Month', 'Gross Rent\n(A)', 'TDS Rate', 'TDS Deducted\n(B)', 'Net Paid\n(A-B)']];
    tableBody = monthlyRows.map((p) => {
      const gross  = r2(p.gross_amount);
      const tdsAmt = r2(p.tds_amount);
      const net    = r2(p.net_payout);
      return [
        fmtMonth(p.payment_month),
        fmtMoney(gross),
        `${parseFloat(p.tds_rate) || 10}%`,
        fmtMoney(tdsAmt),
        fmtMoney(net),
      ];
    });
    tableFoot = [[
      'TOTAL',
      fmtMoney(r2(certData.totalGross)),
      '',
      fmtMoney(r2(certData.totalTDS)),
      fmtMoney(r2(certData.totalNet)),
    ]];
    colStyles = {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 36, halign: 'right'  },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 40, halign: 'right'  },
      4: { cellWidth: 58, halign: 'right'  },
    };
  }

  // autoTable handles its own page breaks via `margin.bottom`.
  // `willDrawPage` + `didDrawPage` repaint the chrome on every new page.
  autoTable(doc, {
    startY: y,
    head:   tableHead,
    body:   tableBody,
    foot:   tableFoot,

    headStyles: {
      fillColor:   CLR.tableHead,
      textColor:   CLR.tableHeadTx,
      fontStyle:   'bold',
      fontSize:    8,
      halign:      'center',
      valign:      'middle',
      lineColor:   CLR.border,
      lineWidth:   0.3,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize:    8,
      textColor:   CLR.textDark,
      valign:      'middle',
      fillColor:   CLR.rowEven,
      lineColor:   CLR.border,
      lineWidth:   0.2,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: CLR.rowOdd },
    footStyles: {
      fillColor:   CLR.totalBg,
      textColor:   CLR.totalTx,
      fontStyle:   'bold',
      fontSize:    8.5,
      valign:      'middle',
      lineColor:   CLR.border,
      lineWidth:   0.3,
      cellPadding: { top: 4.5, bottom: 4.5, left: 3, right: 3 },
    },

    didParseCell: (hook) => {
      if (hook.section !== 'foot') return;
      if (hook.column.index === 0) { hook.cell.styles.halign = 'left'; return; }
      const lastCol = hasGST ? 6 : 4;
      if (hook.column.index === lastCol) {
        hook.cell.styles.fillColor = CLR.netPaidBg;
        hook.cell.styles.textColor = CLR.netPaidTx;
        hook.cell.styles.fontStyle = 'bold';
      }
    },

    columnStyles:   colStyles,
    tableLineColor: CLR.border,
    tableLineWidth: 0.2,

    // margin.bottom keeps rows above the footer+system-notice zone on every page
    margin: {
      top:    CONTENT_TOP,
      left:   MARGIN,
      right:  MARGIN,
      bottom: FOOTER_H + SYSTEM_MSG_H + 10,
    },

    willDrawPage: (hook) => {
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      // Repaint background on continuation pages (page 1 already painted above)
      if (hook.pageNumber > 1) {
        doc.setFillColor(...CLR.offWhite);
        doc.rect(0, 0, pw, ph, 'F');
      }
      // Always reset startY for continuation pages so content begins below header
      hook.settings.startY = CONTENT_TOP;
    },

    didDrawPage: () => {
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      // Repaint chrome over anything autoTable drew near the edges
      drawHeader(doc, headerBase64, pw);
      drawFooter(doc, footerBase64, pw, ph);
      drawSystemNotice(doc, pw, ph);
    },

    pageBreak:    'auto',
    rowPageBreak: 'auto',
    showFoot:     'lastPage',
  });

  y = doc.lastAutoTable.finalY + 8;

  // ─── Summary cards ─────────────────────────────────────────────────────────
  y = ensureSpace(y, 26);
  y = drawSummaryCards(doc, hasGST, certData, y);

  // ─── Total banner ──────────────────────────────────────────────────────────
  y = ensureSpace(y, 14);

  const netFinal     = r2(certData.totalNet);
  const totalPayable = r2(netFinal + r2(certData.totalCGST) + r2(certData.totalSGST));

  const bannerText = hasGST
    ? `Gross: ${fmtMoney(certData.totalGross)}  |  TDS: ${fmtMoney(certData.totalTDS)}  |  Net (after TDS): ${fmtMoney(netFinal)}  |  Total Payable (Net+GST): ${fmtMoney(totalPayable)}`
    : `Gross Rent: ${fmtMoney(certData.totalGross)}  |  TDS Deducted @ 10%: ${fmtMoney(certData.totalTDS)}  |  Net Paid to You: ${fmtMoney(netFinal)}`;

  doc.setFillColor(...CLR.labelBg);
  rRect(doc, MARGIN, y, CONTENT_W, 10, 2);
  doc.setDrawColor(...CLR.border);
  doc.setLineWidth(0.25);
  rRect(doc, MARGIN, y, CONTENT_W, 10, 2, 'S');
  setFont(doc, 7, 'bold', CLR.navy);
  txt(doc, bannerText, pageW / 2, y + 5, { align: 'center' });
  // y += 12;  // no further content — cert ends here
};