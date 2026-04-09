import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import customerService from '../../Services/customer.service';
import { formatDate } from '../../Utils/helpers';

// ─── Rounding helper — always 2 decimal places (paise precision) ─────────────
const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const getCurrentFinancialYear = () => {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (m >= 4) return { start: `${y}-04`, end: `${y + 1}-03`, label: `FY ${y}-${y + 1}` };
  return { start: `${y - 1}-04`, end: `${y}-03`, label: `FY ${y - 1}-${y}` };
};

const getQuarterRange = (fy, quarter) => {
  const y = parseInt(fy.start.split('-')[0]);
  return {
    Q1: { start: `${y}-04-01`,     end: `${y}-06-30`     },
    Q2: { start: `${y}-07-01`,     end: `${y}-09-30`     },
    Q3: { start: `${y}-10-01`,     end: `${y}-12-31`     },
    Q4: { start: `${y + 1}-01-01`, end: `${y + 1}-03-31` },
  }[quarter];
};

// ─── GST on net_payout (after TDS) ───────────────────────────────────────────
const calcGST = (p) => {
  if (p.cgst_amount !== undefined && p.sgst_amount !== undefined) {
    const cgstAmt  = r2(p.cgst_amount);
    const sgstAmt  = r2(p.sgst_amount);
    const gstTotal = r2(p.gst_amount !== undefined ? p.gst_amount : cgstAmt + sgstAmt);
    return { hasGST: cgstAmt > 0 || sgstAmt > 0, cgstAmt, sgstAmt, gstTotal };
  }
  const net      = r2(p.net_payout);
  const cgstRate = parseFloat(p.cgst) || 0;
  const sgstRate = parseFloat(p.sgst) || 0;
  const hasGST   = !!(p.gst_no && (cgstRate > 0 || sgstRate > 0));
  const cgstAmt  = hasGST ? r2(net * cgstRate / 100) : 0;
  const sgstAmt  = hasGST ? r2(net * sgstRate / 100) : 0;
  return { hasGST, cgstAmt, sgstAmt, gstTotal: r2(cgstAmt + sgstAmt) };
};

// ─── Payout split helpers ─────────────────────────────────────────────────────
const parseSplits = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length ? raw : null;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) && p.length ? p : null; }
    catch { return null; }
  }
  return null;
};

/** Mirror of backend splitPayoutForPayment. Last entry absorbs rounding remainder. */
const splitPayout = (netPayout, splits) => {
  if (!Array.isArray(splits) || !splits.length) return null;
  if (splits.length === 1) return [{ ...splits[0], amount: r2(netPayout) }];
  let remaining = r2(netPayout);
  return splits.map((sp, i) => {
    const isLast = i === splits.length - 1;
    const amount = isLast ? r2(remaining) : r2(netPayout * (parseFloat(sp.percentage) || 0) / 100);
    remaining = r2(remaining - amount);
    return { ...sp, amount };
  });
};

// ─── Split column definitions ─────────────────────────────────────────────────
/**
 * For each split slot we generate 5 columns with clean generic headers:
 *   "Split 1 – Name" | "Split 1 – Bank" | "Split 1 – A/C No" | "Split 1 – IFSC" | "Split 1 (₹)"
 *   "Split 2 – Name" | ...
 * Plus one final column: "Total Split (₹)" = sum of all split amounts.
 */
const buildSplitColDefs = (grp) => {
  const maxSlots = Math.max(0, ...grp.map((g) => (g._splitBreakdown ? g._splitBreakdown.length : 0)));
  if (!maxSlots) return [];
  return Array.from({ length: maxSlots }, (_, i) => ({
    index:    i,
    colName:  `Split ${i + 1} – Name`,
    colBank:  `Split ${i + 1} – Bank`,
    colAccNo: `Split ${i + 1} – A/C No`,
    colIFSC:  `Split ${i + 1} – IFSC`,
    colAmt:   `Split ${i + 1} (₹)`,
  }));
};

/**
 * Per-row split fields — 5 cols per slot.
 * Empty string when row has fewer splits than maxSlots.
 */
const splitFields = (g, colDefs) => {
  const out = {};
  colDefs.forEach((col) => {
    const s = g._splitBreakdown?.[col.index];
    out[col.colName]  = s ? (s.accountHolderName || '') : '';
    out[col.colBank]  = s ? (s.bankName          || '') : '';
    out[col.colAccNo] = s ? (s.bankAccountNumber || '') : '';
    out[col.colIFSC]  = s ? (s.ifscCode          || '') : '';
    out[col.colAmt]   = s != null ? r2(s._total)        : '';
  });
  return out;
};

/**
 * "Total Split (₹)" for a single row.
 * Returns '-' when the row has NO split breakdown configured.
 * Returns the numeric sum when splits exist.
 */
const splitSumField = (g, colDefs) => {
  if (!colDefs.length) return {};
  if (!g._splitBreakdown || !g._splitBreakdown.length)
    return { 'Total Split (₹)': '-' };
  const total = colDefs.reduce((sum, col) => {
    const s = g._splitBreakdown[col.index];
    return s != null ? r2(sum + r2(s._total)) : sum;
  }, 0);
  return { 'Total Split (₹)': total };
};

/**
 * Totals row — blank text cols, column-sum for each split amount.
 */
const splitTotalsFields = (grp, colDefs) => {
  const out = {};
  colDefs.forEach((col) => {
    out[col.colName]  = '';
    out[col.colBank]  = '';
    out[col.colAccNo] = '';
    out[col.colIFSC]  = '';
    out[col.colAmt]   = grp.reduce((sum, g) => {
      const s = g._splitBreakdown?.[col.index];
      return s != null ? r2(sum + r2(s._total)) : sum;
    }, 0) || '';
  });
  return out;
};

/**
 * "Total Split (₹)" grand total for the totals row — sum across all rows and all slots.
 */
const splitSumTotalField = (grp, colDefs) => {
  if (!colDefs.length) return {};
  const grand = colDefs.reduce((acc, col) => {
    const colSum = grp.reduce((sum, g) => {
      const s = g._splitBreakdown?.[col.index];
      return s != null ? r2(sum + r2(s._total)) : sum;
    }, 0);
    return r2(acc + colSum);
  }, 0);
  return { 'Total Split (₹)': grand || '' };
};

/**
 * Inject split widths (5 per slot + 1 for Total Split) BEFORE the last `trailingCount` cols.
 */
const injectSplitWidths = (baseCols, colDefs, trailingCount = 1) => {
  if (!colDefs.length) return baseCols;
  const trailing = baseCols.splice(-trailingCount);
  colDefs.forEach(() => {
    baseCols.push({ wch: 22 }); // Name
    baseCols.push({ wch: 20 }); // Bank
    baseCols.push({ wch: 18 }); // A/C No
    baseCols.push({ wch: 13 }); // IFSC
    baseCols.push({ wch: 14 }); // Amount
  });
  baseCols.push({ wch: 16 }); // Total Split (₹)
  trailing.forEach((c) => baseCols.push(c));
  return baseCols;
};

/** Append split widths at end (no trailing cols — used when last col is a split col). */
const appendSplitWidths = (baseCols, colDefs) => {
  if (!colDefs.length) return baseCols;
  colDefs.forEach(() => {
    baseCols.push({ wch: 22 });
    baseCols.push({ wch: 20 });
    baseCols.push({ wch: 18 });
    baseCols.push({ wch: 13 });
    baseCols.push({ wch: 14 });
  });
  baseCols.push({ wch: 16 }); // Total Split (₹)
  return baseCols;
};

// ─── Group raw payments into combined rows per customer+month ─────────────────
const groupPayments = (payments, { tdsOnly = false } = {}) => {
  const tdsKeys = new Set();
  if (tdsOnly) {
    payments.forEach((p) => {
      if (r2(p.tds_amount) > 0)
        tdsKeys.add(`${p.customer_code || p.customer_name}_${p.payment_month}`);
    });
  }
  const eligible = tdsOnly
    ? payments.filter((p) =>
        tdsKeys.has(`${p.customer_code || p.customer_name}_${p.payment_month}`)
      )
    : payments;

  const map = {};
  eligible.forEach((p) => {
    const key = `${p.customer_id || p.customer_code}_${p.payment_month}`;
    const gst = calcGST(p);
    const net = r2(p.net_payout);

    const rawSplits = parseSplits(
      p.payout_splits ?? p.payment_payout_splits ?? p.customer_payout_splits
    );
    const breakdown = rawSplits ? splitPayout(net, rawSplits) : null;

    if (!map[key]) {
      map[key] = {
        ...p,
        _gross:    r2(p.gross_amount),
        _tds:      r2(p.tds_amount),
        _net:      net,
        _cgstAmt:  gst.cgstAmt,
        _sgstAmt:  gst.sgstAmt,
        _gstTotal: gst.gstTotal,
        _count:    1,
        _splitBreakdown: breakdown
          ? breakdown.map((b) => ({ ...b, _total: b.amount }))
          : null,
      };
    } else {
      const g = map[key];
      g._gross    = r2(g._gross    + r2(p.gross_amount));
      g._tds      = r2(g._tds      + r2(p.tds_amount));
      g._net      = r2(g._net      + net);
      g._cgstAmt  = r2(g._cgstAmt  + gst.cgstAmt);
      g._sgstAmt  = r2(g._sgstAmt  + gst.sgstAmt);
      g._gstTotal = r2(g._gstTotal + gst.gstTotal);
      g._count++;
      if (breakdown && g._splitBreakdown) {
        breakdown.forEach((b, i) => {
          if (g._splitBreakdown[i])
            g._splitBreakdown[i]._total = r2(g._splitBreakdown[i]._total + b.amount);
        });
      }
    }
  });
  return Object.values(map);
};

// ─── Excel styling helpers ────────────────────────────────────────────────────
const styleHeader = (ws, cols) => {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' } },
      fill:      { fgColor: { rgb: '1E3A8A' } },
      alignment: { horizontal: 'center', wrapText: true },
      border:    { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} },
    };
  }
  ws['!cols'] = cols;
};

const styleTotalsRow = (ws, rowIdx, color = 'FEF9C3') => {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = 0; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font:   { bold: true },
      fill:   { fgColor: { rgb: color } },
      border: { top:{style:'medium'}, bottom:{style:'medium'}, left:{style:'thin'}, right:{style:'thin'} },
    };
  }
};

// ─── Component ────────────────────────────────────────────────────────────────
const Reports = () => {
  const fy = getCurrentFinancialYear();
  const [loading,          setLoading]          = useState({});
  const [monthlyMonth,     setMonthlyMonth]     = useState(getCurrentMonth());
  const [monthlyAgreement, setMonthlyAgreement] = useState('');
  const [tdsQuarter,       setTdsQuarter]       = useState('Q1');
  const [customerReportId, setCustomerReportId] = useState('');
  const [customers,        setCustomers]        = useState([]);
  const [customersLoaded,  setCustomersLoaded]  = useState(false);

  const setLoad = (key, val) => setLoading((prev) => ({ ...prev, [key]: val }));

  const loadCustomers = async () => {
    if (customersLoaded) return;
    try {
      const res = await customerService.getAllCustomers({ limit: 1000 });
      setCustomers(res.data.customers);
      setCustomersLoaded(true);
    } catch { toast.error('Failed to load customers'); }
  };

  // ── Monthly ───────────────────────────────────────────────────────────────
  const generateMonthlyReport = async () => {
    setLoad('monthly', true);
    try {
      const result = await paymentService.getPaymentHistory({
        month: monthlyMonth, agreementType: monthlyAgreement || undefined, limit: 1000,
      });
      const raw = result.data.payments || [];
      if (!raw.length) { toast.warning('No data for this month'); return; }

      const grp       = groupPayments(raw);
      const hasGst    = grp.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(grp);

      const rows = grp.map((g, i) => ({
        'S.No':            i + 1,
        'Customer Name':   g.customer_name || '',
        'Customer ID':     g.customer_code || '',
        'PAN Number':      g.pan_number    || '',
        'Bank Account No': g.bank_account_number || '',
        'Property':        g.property_name || '',
        'Agreement Type':  g.agreement_type || '',
        'Payment Date':    g.payment_date ? formatDate(g.payment_date) : '',
        'Period':          g.payment_month || '',
        'Inst Count':      g._count,
        'Base Rent (₹)':   r2(g.base_rent) || 0,
        'Escalation (%)':  parseFloat(g.escalation_rate) || 0,
        'Gross Rent (₹)':  g._gross,
        'TDS (₹)':         g._tds,
        'Net Rent (₹)':    g._net,
        ...(hasGst ? {
          'GST No':           g.gst_no || '-',
          'CGST Amt (₹)':     g._cgstAmt,
          'SGST Amt (₹)':     g._sgstAmt,
          'Total GST (₹)':    g._gstTotal,
          'Net Transfer (₹)': r2(g._net + g._gstTotal),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),   // ← Total Split (₹)  or  '-'
        'Status': g.status || '',
      }));

      const tG   = grp.reduce((s, g) => s + g._gross,    0);
      const tT   = grp.reduce((s, g) => s + g._tds,      0);
      const tN   = grp.reduce((s, g) => s + g._net,      0);
      const tGst = grp.reduce((s, g) => s + g._gstTotal, 0);

      rows.push({
        'S.No': '', 'Customer Name': 'TOTAL', 'Customer ID': '', 'PAN Number': '',
        'Bank Account No': '', 'Property': '', 'Agreement Type': '', 'Payment Date': '',
        'Period': '', 'Inst Count': '', 'Base Rent (₹)': '', 'Escalation (%)': '',
        'Gross Rent (₹)': tG, 'TDS (₹)': tT, 'Net Rent (₹)': tN,
        ...(hasGst ? {
          'GST No': '', 'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
          'Total GST (₹)': tGst, 'Net Transfer (₹)': r2(tN + tGst),
        } : {}),
        ...splitTotalsFields(grp, splitCols),
        ...splitSumTotalField(grp, splitCols),
        'Status': '',
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      const baseCols = hasGst
        ? [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:16},{wch:16},{wch:13},{wch:12},
           {wch:6},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},
           {wch:16},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}]
        : [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:16},{wch:16},{wch:13},{wch:12},
           {wch:6},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:10}];
      styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
      styleTotalsRow(ws, rows.length);
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');

      const summaryWs = XLSX.utils.aoa_to_sheet([
        ['Monthly Rental Report'], [''],
        ['Month',         monthlyMonth],
        ['Agreement',     monthlyAgreement || 'All'],
        ['Generated',     new Date().toLocaleString()], [''],
        ['Total Customers (grouped)', grp.length],
        ['Total Gross',   tG],
        ['Total TDS',     tT],
        ['Total Net Rent',tN],
        ...(hasGst ? [['Total GST', tGst], ['Total Payable', r2(tN + tGst)]] : []),
        ...(splitCols.length ? [
          [''],
          ['Payout Split Slots'],
          ...splitCols.map((c, i) => [`Slot ${i + 1}`, `${c.colName} | ${c.colBank} | ${c.colAccNo} | ${c.colIFSC} | ${c.colAmt}`]),
          ['', '"Total Split (₹)" column = sum of all split slot amounts'],
        ] : []),
      ]);
      summaryWs['!cols'] = [{ wch: 22 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      XLSX.writeFile(wb, `Monthly_Report_${monthlyMonth}.xlsx`);
      toast.success('Monthly report downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate monthly report'); }
    finally { setLoad('monthly', false); }
  };

  // ── Annual ────────────────────────────────────────────────────────────────
  const generateAnnualReport = async () => {
    setLoad('annual', true);
    try {
      const result = await paymentService.getPaymentHistory({
        startDate: fy.start + '-01', endDate: fy.end + '-31', limit: 5000,
      });
      const raw = result.data.payments || [];
      if (!raw.length) { toast.warning('No data for this financial year'); return; }

      const grp       = groupPayments(raw);
      const hasGst    = grp.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(grp);

      const rows = grp.map((g, i) => ({
        'S.No':            i + 1,
        'Month':           g.payment_month || '',
        'Customer Name':   g.customer_name || '',
        'PAN Number':      g.pan_number    || '',
        'Bank Account No': g.bank_account_number || '',
        'Property':        g.property_name || '',
        'Agreement Type':  g.agreement_type || '',
        'Inst Count':      g._count,
        'Gross Rent (₹)':  g._gross,
        'TDS (₹)':         g._tds,
        'Net Rent (₹)':    g._net,
        ...(hasGst ? {
          'GST Total (₹)':    g._gstTotal,
          'Net Transfer (₹)': r2(g._net + g._gstTotal),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),
        'Status': g.status || '',
      }));

      const tG   = grp.reduce((s, g) => s + g._gross,    0);
      const tT   = grp.reduce((s, g) => s + g._tds,      0);
      const tN   = grp.reduce((s, g) => s + g._net,      0);
      const tGst = grp.reduce((s, g) => s + g._gstTotal, 0);

      rows.push({
        'S.No': '', 'Month': '', 'Customer Name': 'GRAND TOTAL', 'PAN Number': '',
        'Bank Account No': '', 'Property': '', 'Agreement Type': '', 'Inst Count': '',
        'Gross Rent (₹)': tG, 'TDS (₹)': tT, 'Net Rent (₹)': tN,
        ...(hasGst ? { 'GST Total (₹)': tGst, 'Net Transfer (₹)': r2(tN + tGst) } : {}),
        ...splitTotalsFields(grp, splitCols),
        ...splitSumTotalField(grp, splitCols),
        'Status': '',
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      const baseCols = hasGst
        ? [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:16},{wch:16},{wch:6},
           {wch:14},{wch:12},{wch:14},{wch:14},{wch:14},{wch:10}]
        : [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:16},{wch:16},{wch:6},
           {wch:14},{wch:12},{wch:14},{wch:10}];
      styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
      styleTotalsRow(ws, rows.length, 'DCFCE7');
      XLSX.utils.book_append_sheet(wb, ws, 'All Payments');

      // Monthly summary tab
      const mmap = {};
      grp.forEach((g) => {
        const m = g.payment_month || 'Unknown';
        if (!mmap[m]) mmap[m] = { count: 0, gross: 0, tds: 0, net: 0, gst: 0 };
        mmap[m].count++;
        mmap[m].gross += g._gross;
        mmap[m].tds   += g._tds;
        mmap[m].net   += g._net;
        mmap[m].gst   += g._gstTotal;
      });
      const mRows = Object.entries(mmap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d], i) => ({
          'S.No': i + 1, 'Month': month, 'Customers': d.count,
          'Gross (₹)': d.gross, 'TDS (₹)': d.tds, 'Net (₹)': d.net,
          ...(hasGst ? { 'GST (₹)': d.gst, 'Transfer (₹)': r2(d.net + d.gst) } : {}),
        }));
      const wsM = XLSX.utils.json_to_sheet(mRows);
      styleHeader(wsM, hasGst
        ? [{wch:5},{wch:12},{wch:10},{wch:16},{wch:12},{wch:16},{wch:14},{wch:16}]
        : [{wch:5},{wch:12},{wch:10},{wch:16},{wch:12},{wch:16}]
      );
      XLSX.utils.book_append_sheet(wb, wsM, 'Monthly Summary');

      XLSX.writeFile(wb, `Annual_Report_${fy.label.replace(/ /g, '_')}.xlsx`);
      toast.success('Annual report downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate annual report'); }
    finally { setLoad('annual', false); }
  };

  // ── TDS Report ────────────────────────────────────────────────────────────
  const generateTDSReport = async () => {
    setLoad('tds', true);
    try {
      const range  = getQuarterRange(fy, tdsQuarter);
      const result = await paymentService.getPaymentHistory({
        startDate: range.start, endDate: range.end, limit: 5000,
      });
      const raw = result.data.payments || [];

      const grp      = groupPayments(raw, { tdsOnly: true });
      const eligible = grp.filter((g) => g._tds > 0);
      if (!eligible.length) { toast.warning('No TDS data for this quarter'); return; }

      const hasGst    = eligible.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(eligible);

      // Detail sheet
      const dRows = eligible.map((g, i) => ({
        'S.No':            i + 1,
        'Payment Month':   g.payment_month || '',
        'Customer Name':   g.customer_name || '',
        'PAN Number':      g.pan_number    || '',
        'Bank Account No': g.bank_account_number || '',
        'Property':        g.property_name || '',
        'NRI':             (g.nri_status || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
        'Inst Count':      g._count,
        'Gross Rent (₹)':  g._gross,
        'TDS Rate (%)':    parseFloat(g.tds_rate) || 10,
        'TDS Amount (₹)':  g._tds,
        'Net Rent (₹)':    g._net,
        ...(hasGst ? {
          'GST No':           g.gst_no || '-',
          'CGST Amt (₹)':     g._cgstAmt,
          'SGST Amt (₹)':     g._sgstAmt,
          'Total GST (₹)':    g._gstTotal,
          'Net Transfer (₹)': r2(g._net + g._gstTotal),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),
      }));

      const tG   = eligible.reduce((s, g) => s + g._gross,    0);
      const tT   = eligible.reduce((s, g) => s + g._tds,      0);
      const tN   = eligible.reduce((s, g) => s + g._net,      0);
      const tGst = eligible.reduce((s, g) => s + g._gstTotal, 0);

      dRows.push({
        'S.No': '', 'Payment Month': '', 'Customer Name': 'TOTAL', 'PAN Number': '',
        'Bank Account No': '', 'Property': '', 'NRI': '', 'Inst Count': '',
        'Gross Rent (₹)': tG, 'TDS Rate (%)': '', 'TDS Amount (₹)': tT, 'Net Rent (₹)': tN,
        ...(hasGst ? {
          'GST No': '', 'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
          'Total GST (₹)': tGst, 'Net Transfer (₹)': r2(tN + tGst),
        } : {}),
        ...splitTotalsFields(eligible, splitCols),
        ...splitSumTotalField(eligible, splitCols),
      });

      const wb  = XLSX.utils.book_new();
      const wsD = XLSX.utils.json_to_sheet(dRows);
      const detailBase = hasGst
        ? [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:16},{wch:5},{wch:6},
           {wch:14},{wch:10},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}]
        : [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:16},{wch:5},{wch:6},
           {wch:14},{wch:10},{wch:14},{wch:14}];
      appendSplitWidths(detailBase, splitCols);
      styleHeader(wsD, detailBase);
      styleTotalsRow(wsD, dRows.length, 'FEE2E2');
      XLSX.utils.book_append_sheet(wb, wsD, `${tdsQuarter} Detail`);

      // Customer Summary sheet
      const custMap = {};
      eligible.forEach((g) => {
        const k = g.customer_code || g.customer_name;
        if (!custMap[k]) {
          custMap[k] = {
            name: g.customer_name, pan: g.pan_number,
            bank: g.bank_account_number, property: g.property_name,
            gstNo: g.gst_no,
            gross: 0, tds: 0, net: 0, cgst: 0, sgst: 0, gst: 0, months: 0,
            splitBreakdown: g._splitBreakdown
              ? g._splitBreakdown.map((s) => ({ ...s, _total: r2(s._total) }))
              : null,
          };
        } else {
          if (custMap[k].splitBreakdown && g._splitBreakdown) {
            g._splitBreakdown.forEach((b, i) => {
              if (custMap[k].splitBreakdown[i])
                custMap[k].splitBreakdown[i]._total =
                  r2(custMap[k].splitBreakdown[i]._total + b._total);
            });
          }
        }
        custMap[k].gross  += g._gross;
        custMap[k].tds    += g._tds;
        custMap[k].net    += g._net;
        custMap[k].cgst   += g._cgstAmt;
        custMap[k].sgst   += g._sgstAmt;
        custMap[k].gst    += g._gstTotal;
        custMap[k].months++;
      });

      const custArr       = Object.values(custMap);
      const custSplitCols = buildSplitColDefs(
        custArr.map((c) => ({ _splitBreakdown: c.splitBreakdown }))
      );

      const cRows = custArr.map((c, i) => ({
        'S.No': i + 1,
        'Customer Name':      c.name,
        'PAN Number':         c.pan  || '',
        'Bank Account No':    c.bank || '',
        'Property':           c.property,
        'Months':             c.months,
        'Total Gross (₹)':    c.gross,
        'Total TDS (₹)':      c.tds,
        'Total Net (₹)':      c.net,
        ...(hasGst ? {
          'GST No':             c.gstNo || '-',
          'CGST Amt (₹)':       c.cgst,
          'SGST Amt (₹)':       c.sgst,
          'Total GST (₹)':      c.gst,
          'Total Transfer (₹)': r2(c.net + c.gst),
        } : {}),
        ...splitFields({ _splitBreakdown: c.splitBreakdown }, custSplitCols),
        ...splitSumField({ _splitBreakdown: c.splitBreakdown }, custSplitCols),
      }));

      const custBase = hasGst
        ? [{wch:5},{wch:28},{wch:13},{wch:20},{wch:16},{wch:8},
           {wch:14},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}]
        : [{wch:5},{wch:28},{wch:13},{wch:20},{wch:16},{wch:8},{wch:14},{wch:14},{wch:14}];
      appendSplitWidths(custBase, custSplitCols);

      const wsC = XLSX.utils.json_to_sheet(cRows);
      styleHeader(wsC, custBase);
      XLSX.utils.book_append_sheet(wb, wsC, 'Customer Summary');

      XLSX.writeFile(wb, `TDS_Report_${tdsQuarter}_${fy.label.replace(/ /g, '_')}.xlsx`);
      toast.success('TDS report downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate TDS report'); }
    finally { setLoad('tds', false); }
  };

  // ── Customer Statement ────────────────────────────────────────────────────
  const generateCustomerStatement = async () => {
    if (!customerReportId) { toast.warning('Please select a customer'); return; }
    setLoad('customer', true);
    try {
      const result = await paymentService.getPaymentHistory({
        customerId: customerReportId, limit: 1000,
      });
      const raw = result.data.payments || [];
      if (!raw.length) { toast.warning('No payment history for this customer'); return; }

      const grp       = groupPayments(raw);
      const hasGst    = grp.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(grp);

      const rows = grp.map((g, i) => ({
        'S.No':            i + 1,
        'Payment Month':   g.payment_month || '',
        'Payment Date':    g.payment_date ? formatDate(g.payment_date) : '',
        'Period / Type':   g.payment_period || g.agreement_type || '',
        'Inst Count':      g._count,
        'Base Rent (₹)':   r2(g.base_rent) || 0,
        'Escalation (%)':  parseFloat(g.escalation_rate) || 0,
        'Gross Rent (₹)':  g._gross,
        'TDS (₹)':         g._tds,
        'Net Rent (₹)':    g._net,
        ...(hasGst ? {
          'CGST Amt (₹)':     g._cgstAmt,
          'SGST Amt (₹)':     g._sgstAmt,
          'Total GST (₹)':    g._gstTotal,
          'Net Transfer (₹)': r2(g._net + g._gstTotal),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),
        'Status': g.status || '',
      }));

      const tG   = grp.reduce((s, g) => s + g._gross,    0);
      const tT   = grp.reduce((s, g) => s + g._tds,      0);
      const tN   = grp.reduce((s, g) => s + g._net,      0);
      const tGst = grp.reduce((s, g) => s + g._gstTotal, 0);

      rows.push({
        'S.No': '', 'Payment Month': '', 'Payment Date': '', 'Period / Type': 'TOTAL',
        'Inst Count': '', 'Base Rent (₹)': '', 'Escalation (%)': '',
        'Gross Rent (₹)': tG, 'TDS (₹)': tT, 'Net Rent (₹)': tN,
        ...(hasGst ? {
          'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
          'Total GST (₹)': tGst, 'Net Transfer (₹)': r2(tN + tGst),
        } : {}),
        ...splitTotalsFields(grp, splitCols),
        ...splitSumTotalField(grp, splitCols),
        'Status': '',
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      const baseCols = hasGst
        ? [{wch:5},{wch:14},{wch:14},{wch:26},{wch:6},{wch:14},{wch:12},
           {wch:14},{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}]
        : [{wch:5},{wch:14},{wch:14},{wch:26},{wch:6},{wch:14},{wch:12},
           {wch:14},{wch:12},{wch:14},{wch:10}];
      styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
      styleTotalsRow(ws, rows.length, 'E0F2FE');
      XLSX.utils.book_append_sheet(wb, ws, 'Statement');

      const customer = customers.find((c) => c.id === customerReportId);
      const infoWs = XLSX.utils.aoa_to_sheet([
        ['Customer Payment Statement'], [''],
        ['Customer Name', customer?.customer_name  || ''],
        ['Customer ID',   customer?.customer_id    || ''],
        ['PAN Number',    customer?.pan_number     || ''],
        ['Property',      customer?.property_name  || ''],
        ['Agreement',     customer?.agreement_type || ''],
        ['Generated On',  new Date().toLocaleString()], [''],
        ['Total Payments (grouped)', grp.length],
        ['Total Gross',   tG],
        ['Total TDS',     tT],
        ['Total Net Rent',tN],
        ...(hasGst ? [['Total GST', tGst], ['Total Net Transfer', r2(tN + tGst)]] : []),
      ]);
      infoWs['!cols'] = [{ wch: 28 }, { wch: 36 }];
      XLSX.utils.book_append_sheet(wb, infoWs, 'Customer Info');

      XLSX.writeFile(wb,
        `Statement_${(customer?.customer_name || 'Customer').replace(/\s+/g, '_')}.xlsx`
      );
      toast.success('Statement downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate statement'); }
    finally { setLoad('customer', false); }
  };

  // ─── Report Card UI ────────────────────────────────────────────────────────
  const ReportCard = ({
    icon, title, description, badge, badgeColor = 'primary',
    accentColor, children, onGenerate, loadKey,
  }) => (
    <div className="card border-0 shadow-sm h-100" style={{ borderTop: `4px solid ${accentColor}` }}>
      <div className="card-body d-flex flex-column">
        <div className="d-flex align-items-start gap-3 mb-3">
          <div
            className="rounded-3 p-2 d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ background: accentColor + '18', width: 48, height: 48 }}
          >
            <i className={`bi ${icon} fs-4`} style={{ color: accentColor }}></i>
          </div>
          <div>
            <h5 className="fw-bold mb-1">{title}</h5>
            <p className="text-muted small mb-0">{description}</p>
          </div>
          {badge && <span className={`badge bg-${badgeColor} ms-auto`}>{badge}</span>}
        </div>
        <div className="flex-grow-1">{children}</div>
        <button
          className="btn btn-sm mt-3 fw-semibold w-100"
          style={{ background: accentColor, color: '#fff', border: 'none' }}
          onClick={onGenerate}
          disabled={loading[loadKey]}
        >
          {loading[loadKey]
            ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
            : <><i className="bi bi-file-earmark-excel me-2"></i>Download Excel</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="container-fluid">
      <div className="mb-4">
        <h4 className="fw-bold mb-1">
          <i className="bi bi-bar-chart-line text-primary me-2"></i>Reports
        </h4>
        <p className="text-muted small mb-0">
          Generate and download Excel reports — installments combined per customer per month
        </p>
      </div>

      <div className="row g-4">
        <div className="col-md-6">
          <ReportCard
            icon="bi-calendar-month" title="Monthly Report"
            description="Combined payment records for a selected month"
            badge={monthlyMonth} badgeColor="primary" accentColor="#2563EB"
            onGenerate={generateMonthlyReport} loadKey="monthly"
          >
            <div className="row g-2">
              <div className="col-7">
                <label className="form-label small fw-semibold">Month</label>
                <input type="month" className="form-control form-control-sm"
                  value={monthlyMonth} onChange={(e) => setMonthlyMonth(e.target.value)} />
              </div>
              <div className="col-5">
                <label className="form-label small fw-semibold">Agreement</label>
                <select className="form-select form-select-sm" value={monthlyAgreement}
                  onChange={(e) => setMonthlyAgreement(e.target.value)}>
                  <option value="">All</option>
                  <option value="Construction">Construction</option>
                  <option value="9-Year">9-Year</option>
                </select>
              </div>
            </div>
            <div className="mt-2 p-2 rounded-2" style={{ background: '#EFF6FF', fontSize: '0.78rem' }}>
              <strong>Includes:</strong> Gross, TDS, Net · Split 1 (Name/Bank/A/C/IFSC/₹) ·
              Split 2 … · <strong>Total Split (₹)</strong> · Status
            </div>
          </ReportCard>
        </div>

        <div className="col-md-6">
          <ReportCard
            icon="bi-calendar-range" title="Annual Report"
            description="Full financial year combined payment summary"
            badge={fy.label} badgeColor="success" accentColor="#16A34A"
            onGenerate={generateAnnualReport} loadKey="annual"
          >
            <div className="p-2 rounded-2 mb-2" style={{ background: '#F0FDF4', fontSize: '0.78rem' }}>
              <strong>FY:</strong> {fy.label} &nbsp;|&nbsp;
              <strong>Period:</strong> {fy.start} → {fy.end}
            </div>
            <div className="p-2 rounded-2" style={{ background: '#F0FDF4', fontSize: '0.78rem' }}>
              <strong>Sheets:</strong> All Payments + Monthly Summary. Split detail columns
              + <strong>Total Split (₹)</strong> auto-added. GST columns when applicable.
            </div>
          </ReportCard>
        </div>

        <div className="col-md-6">
          <ReportCard
            icon="bi-percent" title="TDS Report"
            description="Quarterly TDS — combined installments per customer per month"
            accentColor="#DC2626" onGenerate={generateTDSReport} loadKey="tds"
          >
            <label className="form-label small fw-semibold">Quarter ({fy.label})</label>
            <div className="d-flex gap-2 flex-wrap mb-2">
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <button key={q} type="button"
                  className={`btn btn-sm ${tdsQuarter === q ? 'btn-danger' : 'btn-outline-danger'}`}
                  onClick={() => setTdsQuarter(q)}>
                  {q}
                  <small className="d-block" style={{ fontSize: '0.65rem' }}>
                    {q === 'Q1' ? 'Apr–Jun' : q === 'Q2' ? 'Jul–Sep' : q === 'Q3' ? 'Oct–Dec' : 'Jan–Mar'}
                  </small>
                </button>
              ))}
            </div>
            <div className="p-2 rounded-2" style={{ background: '#FEF2F2', fontSize: '0.78rem' }}>
              <strong>Sheets:</strong> Detail + Customer Summary. Split columns +
              <strong> Total Split (₹)</strong> in both sheets.
            </div>
          </ReportCard>
        </div>

        <div className="col-md-6">
          <ReportCard
            icon="bi-person-lines-fill" title="Customer Statement"
            description="Complete combined payment history for a single customer"
            accentColor="#7C3AED" onGenerate={generateCustomerStatement} loadKey="customer"
          >
            <label className="form-label small fw-semibold">Select Customer</label>
            <select className="form-select form-select-sm" value={customerReportId}
              onChange={(e) => setCustomerReportId(e.target.value)} onFocus={loadCustomers}>
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.customer_name} ({c.customer_id})</option>
              ))}
            </select>
            <div className="mt-2 p-2 rounded-2" style={{ background: '#F5F3FF', fontSize: '0.78rem' }}>
              <strong>Sheets:</strong> Statement + Customer Info. Split columns +
              <strong> Total Split (₹)</strong> auto-included when configured.
            </div>
          </ReportCard>
        </div>
      </div>

      <div className="card border-0 shadow-sm mt-4">
        <div className="card-body py-3">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <small className="text-muted fw-semibold">
              <i className="bi bi-info-circle me-1"></i>All reports include:
            </small>
            {[
              'Gross Rent', 'TDS', 'Net Rent', 'GST (if applicable)', 'Net Transfer',
              'Split 1 – Name', 'Split 1 – Bank', 'Split 1 – A/C No', 'Split 1 – IFSC', 'Split 1 (₹)',
              'Split 2 – …', 'Total Split (₹)  ← "-" if no splits', 'Status',
            ].map((item) => (
              <span key={item} className="badge bg-light text-dark border">{item}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;