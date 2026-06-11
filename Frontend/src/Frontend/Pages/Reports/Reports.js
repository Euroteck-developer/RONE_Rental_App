// import React, { useState, useEffect, useMemo, useCallback } from 'react';
// import * as XLSX from 'xlsx';
// import Select from 'react-select';
// import { toast } from 'react-toastify';
// import paymentService  from '../../Services/payment.service';
// import customerService from '../../Services/customer.service';
// import { formatDate }  from '../../Utils/helpers';

// // ─── Rounding helpers ─────────────────────────────────────────────────────────
// const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
// const r0 = (v) => Math.round(parseFloat(v) || 0);

// const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

// const getCurrentFinancialYear = () => {
//   const now = new Date();
//   const m = now.getMonth() + 1;
//   const y = now.getFullYear();
//   if (m >= 4) return { start: `${y}-04`, end: `${y + 1}-03`, label: `FY ${y}-${y + 1}` };
//   return { start: `${y - 1}-04`, end: `${y}-03`, label: `FY ${y - 1}-${y}` };
// };

// const getQuarterRange = (fy, quarter) => {
//   const y = parseInt(fy.start.split('-')[0]);
//   return {
//     Q1: { start: `${y}-04-01`,     end: `${y}-06-30`     },
//     Q2: { start: `${y}-07-01`,     end: `${y}-09-30`     },
//     Q3: { start: `${y}-10-01`,     end: `${y}-12-31`     },
//     Q4: { start: `${y + 1}-01-01`, end: `${y + 1}-03-31` },
//   }[quarter];
// };

// // ─── GST on net_payout (after TDS) ───────────────────────────────────────────
// const calcGST = (p) => {
//   if (p.cgst_amount !== undefined && p.sgst_amount !== undefined) {
//     const cgstAmt  = r2(p.cgst_amount);
//     const sgstAmt  = r2(p.sgst_amount);
//     const gstTotal = r2(p.gst_amount !== undefined ? p.gst_amount : cgstAmt + sgstAmt);
//     return { hasGST: cgstAmt > 0 || sgstAmt > 0, cgstAmt, sgstAmt, gstTotal };
//   }
//   const net      = r2(p.net_payout);
//   const cgstRate = parseFloat(p.cgst) || 0;
//   const sgstRate = parseFloat(p.sgst) || 0;
//   const hasGST   = !!(p.gst_no && (cgstRate > 0 || sgstRate > 0));
//   const cgstAmt  = hasGST ? r2(net * cgstRate / 100) : 0;
//   const sgstAmt  = hasGST ? r2(net * sgstRate / 100) : 0;
//   return { hasGST, cgstAmt, sgstAmt, gstTotal: r2(cgstAmt + sgstAmt) };
// };

// // ─── Payout split helpers ─────────────────────────────────────────────────────
// const parseSplits = (raw) => {
//   if (!raw) return null;
//   if (Array.isArray(raw)) return raw.length ? raw : null;
//   if (typeof raw === 'string') {
//     try { const p = JSON.parse(raw); return Array.isArray(p) && p.length ? p : null; }
//     catch { return null; }
//   }
//   return null;
// };

// const splitPayout = (netPayout, splits) => {
//   if (!Array.isArray(splits) || !splits.length) return null;
//   if (splits.length === 1) return [{ ...splits[0], amount: r2(netPayout) }];
//   let remaining = r2(netPayout);
//   return splits.map((sp, i) => {
//     const isLast = i === splits.length - 1;
//     const amount = isLast ? r2(remaining) : r2(netPayout * (parseFloat(sp.percentage) || 0) / 100);
//     remaining = r2(remaining - amount);
//     return { ...sp, amount };
//   });
// };

// // ─── Split column definitions ─────────────────────────────────────────────────
// const buildSplitColDefs = (grp) => {
//   const maxSlots = Math.max(0, ...grp.map((g) => (g._splitBreakdown ? g._splitBreakdown.length : 0)));
//   if (!maxSlots) return [];
//   return Array.from({ length: maxSlots }, (_, i) => ({
//     index: i,
//     colName:  `Split ${i + 1} – Name`,
//     colBank:  `Split ${i + 1} – Bank`,
//     colAccNo: `Split ${i + 1} – A/C No`,
//     colIFSC:  `Split ${i + 1} – IFSC`,
//     colAmt:   `Split ${i + 1} (₹)`,
//   }));
// };

// const splitFields = (g, colDefs) => {
//   const out = {};
//   colDefs.forEach((col) => {
//     const s = g._splitBreakdown?.[col.index];
//     out[col.colName]  = s ? (s.accountHolderName || '') : '';
//     out[col.colBank]  = s ? (s.bankName          || '') : '';
//     out[col.colAccNo] = s ? (s.bankAccountNumber || '') : '';
//     out[col.colIFSC]  = s ? (s.ifscCode          || '') : '';
//     out[col.colAmt]   = s != null ? r0(s._total)         : '';
//   });
//   return out;
// };

// const splitSumField = (g, colDefs) => {
//   if (!colDefs.length) return {};
//   if (!g._splitBreakdown || !g._splitBreakdown.length)
//     return { 'Total Split (₹)': '-' };
//   const total = colDefs.reduce((sum, col) => {
//     const s = g._splitBreakdown[col.index];
//     return s != null ? r2(sum + r2(s._total)) : sum;
//   }, 0);
//   return { 'Total Split (₹)': r0(total) };
// };

// const splitTotalsFields = (grp, colDefs) => {
//   const out = {};
//   colDefs.forEach((col) => {
//     out[col.colName]  = '';
//     out[col.colBank]  = '';
//     out[col.colAccNo] = '';
//     out[col.colIFSC]  = '';
//     out[col.colAmt]   = r0(grp.reduce((sum, g) => {
//       const s = g._splitBreakdown?.[col.index];
//       return s != null ? r2(sum + r2(s._total)) : sum;
//     }, 0)) || '';
//   });
//   return out;
// };

// const splitSumTotalField = (grp, colDefs) => {
//   if (!colDefs.length) return {};
//   const grand = colDefs.reduce((acc, col) => {
//     const colSum = grp.reduce((sum, g) => {
//       const s = g._splitBreakdown?.[col.index];
//       return s != null ? r2(sum + r2(s._total)) : sum;
//     }, 0);
//     return r2(acc + colSum);
//   }, 0);
//   return { 'Total Split (₹)': r0(grand) || '' };
// };

// const injectSplitWidths = (baseCols, colDefs, trailingCount = 1) => {
//   if (!colDefs.length) return baseCols;
//   const trailing = baseCols.splice(-trailingCount);
//   colDefs.forEach(() => {
//     baseCols.push({ wch: 22 });
//     baseCols.push({ wch: 20 });
//     baseCols.push({ wch: 18 });
//     baseCols.push({ wch: 13 });
//     baseCols.push({ wch: 14 });
//   });
//   baseCols.push({ wch: 16 });
//   trailing.forEach((c) => baseCols.push(c));
//   return baseCols;
// };

// const appendSplitWidths = (baseCols, colDefs) => {
//   if (!colDefs.length) return baseCols;
//   colDefs.forEach(() => {
//     baseCols.push({ wch: 22 });
//     baseCols.push({ wch: 20 });
//     baseCols.push({ wch: 18 });
//     baseCols.push({ wch: 13 });
//     baseCols.push({ wch: 14 });
//   });
//   baseCols.push({ wch: 16 });
//   return baseCols;
// };

// // ─── Group raw payments into combined rows per customer+month ─────────────────
// const groupPayments = (payments, { tdsOnly = false } = {}) => {
//   const tdsKeys = new Set();
//   if (tdsOnly) {
//     payments.forEach((p) => {
//       if (r2(p.tds_amount) > 0)
//         tdsKeys.add(`${p.customer_code || p.customer_name}_${p.payment_month}`);
//     });
//   }
//   const eligible = tdsOnly
//     ? payments.filter((p) =>
//         tdsKeys.has(`${p.customer_code || p.customer_name}_${p.payment_month}`)
//       )
//     : payments;

//   const map = {};
//   eligible.forEach((p) => {
//     const key = `${p.customer_id || p.customer_code}_${p.payment_month}`;
//     const gst = calcGST(p);
//     const net = r2(p.net_payout);
//     const rawSplits = parseSplits(p.payout_splits ?? p.payment_payout_splits ?? p.customer_payout_splits);
//     const breakdown = rawSplits ? splitPayout(net, rawSplits) : null;

//     if (!map[key]) {
//       map[key] = {
//         ...p,
//         _gross:    r2(p.gross_amount),
//         _tds:      r2(p.tds_amount),
//         _net:      net,
//         _cgstAmt:  gst.cgstAmt,
//         _sgstAmt:  gst.sgstAmt,
//         _gstTotal: gst.gstTotal,
//         _count:    1,
//         _splitBreakdown: breakdown
//           ? breakdown.map((b) => ({ ...b, _total: b.amount }))
//           : null,
//       };
//     } else {
//       const g = map[key];
//       g._gross    = r2(g._gross    + r2(p.gross_amount));
//       g._tds      = r2(g._tds      + r2(p.tds_amount));
//       g._net      = r2(g._net      + net);
//       g._cgstAmt  = r2(g._cgstAmt  + gst.cgstAmt);
//       g._sgstAmt  = r2(g._sgstAmt  + gst.sgstAmt);
//       g._gstTotal = r2(g._gstTotal + gst.gstTotal);
//       g._count++;
//       if (breakdown && g._splitBreakdown) {
//         breakdown.forEach((b, i) => {
//           if (g._splitBreakdown[i])
//             g._splitBreakdown[i]._total = r2(g._splitBreakdown[i]._total + b.amount);
//         });
//       }
//     }
//   });
//   return Object.values(map);
// };

// // ─── Excel styling helpers ────────────────────────────────────────────────────
// const styleHeader = (ws, cols) => {
//   const range = XLSX.utils.decode_range(ws['!ref']);
//   for (let c = 0; c <= range.e.c; c++) {
//     const addr = XLSX.utils.encode_cell({ r: 0, c });
//     if (!ws[addr]) continue;
//     ws[addr].s = {
//       font:      { bold: true, color: { rgb: 'FFFFFF' } },
//       fill:      { fgColor: { rgb: '1E3A8A' } },
//       alignment: { horizontal: 'center', wrapText: true },
//       border:    { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} },
//     };
//   }
//   ws['!cols'] = cols;
// };

// const styleTotalsRow = (ws, rowIdx, color = 'FEF9C3') => {
//   const range = XLSX.utils.decode_range(ws['!ref']);
//   for (let c = 0; c <= range.e.c; c++) {
//     const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
//     if (!ws[addr]) continue;
//     ws[addr].s = {
//       font:   { bold: true },
//       fill:   { fgColor: { rgb: color } },
//       border: { top:{style:'medium'}, bottom:{style:'medium'}, left:{style:'thin'}, right:{style:'thin'} },
//     };
//   }
// };

// // ─── React-Select styles ──────────────────────────────────────────────────────
// const selectStyles = {
//   control: (base, state) => ({
//     ...base,
//     borderColor: state.isFocused ? '#86b7fe' : '#ced4da',
//     boxShadow:   state.isFocused ? '0 0 0 0.25rem rgba(13,110,253,.25)' : 'none',
//     minHeight: 32,
//     fontSize: '0.85rem',
//   }),
//   menu:    (base) => ({ ...base, zIndex: 9999, fontSize: '0.85rem' }),
//   option:  (base, { isFocused, isSelected }) => ({
//     ...base,
//     backgroundColor: isSelected ? '#0d6efd' : isFocused ? '#f0f4ff' : '#fff',
//     color: isSelected ? '#fff' : '#212529',
//     padding: '6px 10px',
//   }),
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// //  MAIN COMPONENT
// // ═══════════════════════════════════════════════════════════════════════════════
// const Reports = () => {
//   const fy = getCurrentFinancialYear();

//   const [loading,          setLoading]          = useState({});
//   const [customers,        setCustomers]        = useState([]);
//   const [customersLoaded,  setCustomersLoaded]  = useState(false);
//   const [customersLoading, setCustomersLoading] = useState(false);

//   // Per-report customer filters
//   const [monthlyCustomer,  setMonthlyCustomer]  = useState(null);
//   const [annualCustomer,   setAnnualCustomer]   = useState(null);
//   const [tdsCustomer,      setTdsCustomer]      = useState(null);
//   const [stmtCustomer,     setStmtCustomer]     = useState(null);

//   // Monthly report controls
//   const [monthlyMonth,     setMonthlyMonth]     = useState(getCurrentMonth());
//   const [monthlyAgreement, setMonthlyAgreement] = useState('');

//   // TDS quarter
//   const [tdsQuarter,       setTdsQuarter]       = useState('Q1');

//   const setLoad = (key, val) => setLoading((prev) => ({ ...prev, [key]: val }));

//   // ── Load all customers once ───────────────────────────────────────────────
//   useEffect(() => { loadCustomers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

//   const loadCustomers = async () => {
//     if (customersLoaded || customersLoading) return;
//     setCustomersLoading(true);
//     try {
//       const res = await customerService.getAllCustomers({ limit: 5000 });
//       setCustomers(res.data.customers || []);
//       setCustomersLoaded(true);
//     } catch { toast.error('Failed to load customer list'); }
//     finally { setCustomersLoading(false); }
//   };

//   // ── React-Select options ──────────────────────────────────────────────────
//   const customerOptions = useMemo(() =>
//     customers.map((c) => ({
//       value:    c.id,
//       label:    `${c.customer_name}  ·  ${c.customer_ref || c.customer_id}  ·  F${c.floor_no || '?'} U${c.unit_no || '?'}`,
//       customer: c,
//     })), [customers]);

//   const filterOption = useCallback((option, inputValue) => {
//     if (!inputValue) return true;
//     const q  = inputValue.toLowerCase();
//     const c  = option.data?.customer;
//     if (!c) return false;
//     return (
//       (c.customer_name || '').toLowerCase().includes(q) ||
//       (c.customer_ref  || '').toLowerCase().includes(q) ||
//       (c.customer_id   || '').toLowerCase().includes(q) ||
//       (c.unit_no       || '').toLowerCase().includes(q) ||
//       (c.floor_no      || '').toLowerCase().includes(q) ||
//       (c.pan_number    || '').toLowerCase().includes(q) ||
//       (c.email         || '').toLowerCase().includes(q)
//     );
//   }, []);

//   // ── Customer filter UI ────────────────────────────────────────────────────
//   const CustomerFilter = ({ value, onChange, placeholder = 'All customers (search to filter)' }) => (
//     <div className="mb-2">
//       <label className="form-label small fw-semibold mb-1">Customer Filter (optional)</label>
//       <Select
//         options={customerOptions}
//         value={value}
//         onChange={onChange}
//         filterOption={filterOption}
//         styles={selectStyles}
//         isClearable
//         isSearchable
//         isLoading={customersLoading}
//         placeholder={
//           <span className="text-muted" style={{ fontSize: '0.82rem' }}>
//             <i className="bi bi-search me-1" />
//             {placeholder}
//           </span>
//         }
//         noOptionsMessage={({ inputValue }) =>
//           inputValue ? `No customer found for "${inputValue}"` : 'No customers'
//         }
//       />
//     </div>
//   );

//   // ── Filter payments by selected customer ────────────────────────────────
//   const applyCustomerFilter = (payments, selectedOption) => {
//     if (!selectedOption) return payments;
//     const cust = selectedOption.customer;
//     return payments.filter((p) =>
//       p.customer_id === cust.customer_id ||
//       p.customer_id === cust.id          ||
//       p.customer_code === cust.customer_ref ||
//       p.customer_code === cust.customer_id  ||
//       (p.customer_name || '').toLowerCase() === (cust.customer_name || '').toLowerCase()
//     );
//   };

//   // ── MONTHLY REPORT ────────────────────────────────────────────────────────
//   const generateMonthlyReport = async () => {
//     setLoad('monthly', true);
//     try {
//       const result = await paymentService.getPaymentHistory({
//         month:         monthlyMonth,
//         agreementType: monthlyAgreement || undefined,
//         limit:         5000,
//       });
//       let raw = result.data.payments || [];
//       raw = applyCustomerFilter(raw, monthlyCustomer);

//       if (!raw.length) {
//         toast.warning(monthlyCustomer
//           ? `No payments found for "${monthlyCustomer.customer.customer_name}" in ${monthlyMonth}`
//           : 'No data for this month');
//         return;
//       }

//       const grp       = groupPayments(raw);
//       const hasGst    = grp.some((g) => g._gstTotal > 0);
//       const splitCols = buildSplitColDefs(grp);

//       const rows = grp.map((g, i) => ({
//         'S.No':            i + 1,
//         'Customer Name':   g.customer_name || '',
//         'Customer ID':     g.customer_code || '',
//         'PAN Number':      g.pan_number    || '',
//         'Bank Account No': g.bank_account_number || '',
//         'Unit No':         g.unit_no       || '',                // ← added
//         'Agreement Type':  g.agreement_type || '',
//         'Payment Date':    g.payment_date ? formatDate(g.payment_date) : '',
//         'Period':          g.payment_month || '',
//         'Inst Count':      g._count,
//         'Base Rent (₹)':   r0(g.base_rent),
//         'Escalation (%)':  parseFloat(g.escalation_rate) || 0,
//         'Gross Rent (₹)':  r0(g._gross),
//         'TDS (₹)':         r0(g._tds),
//         'Net Rent (₹)':    r0(g._net),
//         ...(hasGst ? {
//           'GST No':            g.gst_no || '-',
//           'CGST Amt (₹)':      r0(g._cgstAmt),
//           'SGST Amt (₹)':      r0(g._sgstAmt),
//           'Total GST (₹)':     r0(g._gstTotal),
//           'Net Transfer (₹)':  r0(r2(g._net + g._gstTotal)),
//         } : {}),
//         ...splitFields(g, splitCols),
//         ...splitSumField(g, splitCols),
//         'Status': g.status || '',
//       }));

//       const tG   = r0(grp.reduce((s, g) => r2(s + g._gross),    0));
//       const tT   = r0(grp.reduce((s, g) => r2(s + g._tds),      0));
//       const tN   = r0(grp.reduce((s, g) => r2(s + g._net),      0));
//       const tGst = r0(grp.reduce((s, g) => r2(s + g._gstTotal), 0));

//       rows.push({
//         'S.No': '', 'Customer Name': 'TOTAL', 'Customer ID': '', 'PAN Number': '',
//         'Bank Account No': '', 'Unit No': '', 'Agreement Type': '',              // ← updated
//         'Payment Date': '', 'Period': '', 'Inst Count': grp.length,
//         'Base Rent (₹)': '', 'Escalation (%)': '',
//         'Gross Rent (₹)': tG, 'TDS (₹)': tT, 'Net Rent (₹)': tN,
//         ...(hasGst ? {
//           'GST No': '', 'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
//           'Total GST (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)),
//         } : {}),
//         ...splitTotalsFields(grp, splitCols),
//         ...splitSumTotalField(grp, splitCols),
//         'Status': '',
//       });

//       const wb = XLSX.utils.book_new();
//       const ws = XLSX.utils.json_to_sheet(rows);
//       // Unit No col (wch:10) replaces Property col (wch:16) — same position
//       const baseCols = hasGst
//         ? [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:10},{wch:16},{wch:13},{wch:12},
//            {wch:6},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},
//            {wch:16},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}]
//         : [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:10},{wch:16},{wch:13},{wch:12},
//            {wch:6},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:10}];
//       styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
//       styleTotalsRow(ws, rows.length);
//       XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');

//       const custLabel = monthlyCustomer ? monthlyCustomer.customer.customer_name : 'All';
//       const summaryWs = XLSX.utils.aoa_to_sheet([
//         ['Monthly Rental Report'], [''],
//         ['Month',         monthlyMonth],
//         ['Agreement',     monthlyAgreement || 'All'],
//         ['Customer',      custLabel],
//         ['Generated',     new Date().toLocaleString()], [''],
//         ['Total Customers (grouped)', grp.length],
//         ['Total Gross (₹)',    tG],
//         ['Total TDS (₹)',      tT],
//         ['Total Net Rent (₹)', tN],
//         ...(hasGst ? [['Total GST (₹)', tGst], ['Total Payable (₹)', r0(r2(tN + tGst))]] : []),
//       ]);
//       summaryWs['!cols'] = [{ wch: 22 }, { wch: 50 }];
//       XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

//       const custSuffix = monthlyCustomer ? `_${monthlyCustomer.customer.customer_name.replace(/\s+/g,'_')}` : '';
//       XLSX.writeFile(wb, `Monthly_Report_${monthlyMonth}${custSuffix}.xlsx`);
//       toast.success('Monthly report downloaded!');
//     } catch (err) { console.error(err); toast.error('Failed to generate monthly report'); }
//     finally { setLoad('monthly', false); }
//   };

//   // ── ANNUAL REPORT ─────────────────────────────────────────────────────────
//   const generateAnnualReport = async () => {
//     setLoad('annual', true);
//     try {
//       const result = await paymentService.getPaymentHistory({
//         startDate: fy.start + '-01', endDate: fy.end + '-31', limit: 5000,
//       });
//       let raw = result.data.payments || [];
//       raw = applyCustomerFilter(raw, annualCustomer);

//       if (!raw.length) {
//         toast.warning(annualCustomer
//           ? `No payments for "${annualCustomer.customer.customer_name}" this FY`
//           : 'No data for this financial year');
//         return;
//       }

//       const grp       = groupPayments(raw);
//       const hasGst    = grp.some((g) => g._gstTotal > 0);
//       const splitCols = buildSplitColDefs(grp);

//       const rows = grp.map((g, i) => ({
//         'S.No':            i + 1,
//         'Month':           g.payment_month || '',
//         'Customer Name':   g.customer_name || '',
//         'PAN Number':      g.pan_number    || '',
//         'Bank Account No': g.bank_account_number || '',
//         'Unit No':         g.unit_no       || '',                // ← added
//         'Agreement Type':  g.agreement_type || '',
//         'Inst Count':      g._count,
//         'Gross Rent (₹)':  r0(g._gross),
//         'TDS (₹)':         r0(g._tds),
//         'Net Rent (₹)':    r0(g._net),
//         ...(hasGst ? {
//           'GST Total (₹)':    r0(g._gstTotal),
//           'Net Transfer (₹)': r0(r2(g._net + g._gstTotal)),
//         } : {}),
//         ...splitFields(g, splitCols),
//         ...splitSumField(g, splitCols),
//         'Status': g.status || '',
//       }));

//       const tG   = r0(grp.reduce((s, g) => r2(s + g._gross),    0));
//       const tT   = r0(grp.reduce((s, g) => r2(s + g._tds),      0));
//       const tN   = r0(grp.reduce((s, g) => r2(s + g._net),      0));
//       const tGst = r0(grp.reduce((s, g) => r2(s + g._gstTotal), 0));

//       rows.push({
//         'S.No': '', 'Month': '', 'Customer Name': 'GRAND TOTAL', 'PAN Number': '',
//         'Bank Account No': '', 'Unit No': '', 'Agreement Type': '',              // ← updated
//         'Inst Count': grp.length,
//         'Gross Rent (₹)': tG, 'TDS (₹)': tT, 'Net Rent (₹)': tN,
//         ...(hasGst ? { 'GST Total (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)) } : {}),
//         ...splitTotalsFields(grp, splitCols),
//         ...splitSumTotalField(grp, splitCols),
//         'Status': '',
//       });

//       const wb = XLSX.utils.book_new();
//       const ws = XLSX.utils.json_to_sheet(rows);
//       // Unit No col (wch:10) replaces Property col (wch:16) — same position
//       const baseCols = hasGst
//         ? [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:10},{wch:16},{wch:6},
//            {wch:14},{wch:12},{wch:14},{wch:14},{wch:14},{wch:10}]
//         : [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:10},{wch:16},{wch:6},
//            {wch:14},{wch:12},{wch:14},{wch:10}];
//       styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
//       styleTotalsRow(ws, rows.length, 'DCFCE7');
//       XLSX.utils.book_append_sheet(wb, ws, 'All Payments');

//       // Monthly summary tab
//       const mmap = {};
//       grp.forEach((g) => {
//         const m = g.payment_month || 'Unknown';
//         if (!mmap[m]) mmap[m] = { count: 0, gross: 0, tds: 0, net: 0, gst: 0 };
//         mmap[m].count++;
//         mmap[m].gross = r2(mmap[m].gross + g._gross);
//         mmap[m].tds   = r2(mmap[m].tds   + g._tds);
//         mmap[m].net   = r2(mmap[m].net   + g._net);
//         mmap[m].gst   = r2(mmap[m].gst   + g._gstTotal);
//       });
//       const mRows = Object.entries(mmap)
//         .sort(([a], [b]) => a.localeCompare(b))
//         .map(([month, d], i) => ({
//           'S.No': i + 1, 'Month': month, 'Customers': d.count,
//           'Gross (₹)':    r0(d.gross),
//           'TDS (₹)':      r0(d.tds),
//           'Net (₹)':      r0(d.net),
//           ...(hasGst ? {
//             'GST (₹)':      r0(d.gst),
//             'Transfer (₹)': r0(r2(d.net + d.gst)),
//           } : {}),
//         }));
//       const wsM = XLSX.utils.json_to_sheet(mRows);
//       styleHeader(wsM, hasGst
//         ? [{wch:5},{wch:12},{wch:10},{wch:16},{wch:12},{wch:16},{wch:14},{wch:16}]
//         : [{wch:5},{wch:12},{wch:10},{wch:16},{wch:12},{wch:16}]);
//       XLSX.utils.book_append_sheet(wb, wsM, 'Monthly Summary');

//       const custSuffix = annualCustomer ? `_${annualCustomer.customer.customer_name.replace(/\s+/g,'_')}` : '';
//       XLSX.writeFile(wb, `Annual_Report_${fy.label.replace(/ /g, '_')}${custSuffix}.xlsx`);
//       toast.success('Annual report downloaded!');
//     } catch (err) { console.error(err); toast.error('Failed to generate annual report'); }
//     finally { setLoad('annual', false); }
//   };

//   // ── TDS REPORT ────────────────────────────────────────────────────────────
//   const generateTDSReport = async () => {
//     setLoad('tds', true);
//     try {
//       const range  = getQuarterRange(fy, tdsQuarter);
//       const result = await paymentService.getPaymentHistory({
//         startDate: range.start, endDate: range.end, limit: 5000,
//       });
//       let raw = result.data.payments || [];
//       raw = applyCustomerFilter(raw, tdsCustomer);

//       const grp      = groupPayments(raw, { tdsOnly: true });
//       const eligible = grp.filter((g) => g._tds > 0);
//       if (!eligible.length) {
//         toast.warning(tdsCustomer
//           ? `No TDS data for "${tdsCustomer.customer.customer_name}" in ${tdsQuarter}`
//           : 'No TDS data for this quarter');
//         return;
//       }

//       const hasGst    = eligible.some((g) => g._gstTotal > 0);
//       const splitCols = buildSplitColDefs(eligible);

//       const dRows = eligible.map((g, i) => ({
//         'S.No':            i + 1,
//         'Payment Month':   g.payment_month || '',
//         'Customer Name':   g.customer_name || '',
//         'PAN Number':      g.pan_number    || '',
//         'Bank Account No': g.bank_account_number || '',
//         'Unit No':         g.unit_no       || '',                // ← added
//         'NRI':             (g.nri_status || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
//         'Inst Count':      g._count,
//         'Gross Rent (₹)':  r0(g._gross),
//         'TDS Rate (%)':    parseFloat(g.tds_rate) || 10,
//         'TDS Amount (₹)':  r0(g._tds),
//         'Net Rent (₹)':    r0(g._net),
//         ...(hasGst ? {
//           'GST No':            g.gst_no || '-',
//           'CGST Amt (₹)':      r0(g._cgstAmt),
//           'SGST Amt (₹)':      r0(g._sgstAmt),
//           'Total GST (₹)':     r0(g._gstTotal),
//           'Net Transfer (₹)':  r0(r2(g._net + g._gstTotal)),
//         } : {}),
//         ...splitFields(g, splitCols),
//         ...splitSumField(g, splitCols),
//       }));

//       const tG   = r0(eligible.reduce((s, g) => r2(s + g._gross),    0));
//       const tT   = r0(eligible.reduce((s, g) => r2(s + g._tds),      0));
//       const tN   = r0(eligible.reduce((s, g) => r2(s + g._net),      0));
//       const tGst = r0(eligible.reduce((s, g) => r2(s + g._gstTotal), 0));

//       dRows.push({
//         'S.No': '', 'Payment Month': '', 'Customer Name': 'TOTAL', 'PAN Number': '',
//         'Bank Account No': '', 'Unit No': '', 'NRI': '',                         // ← updated
//         'Inst Count': eligible.length,
//         'Gross Rent (₹)': tG, 'TDS Rate (%)': '', 'TDS Amount (₹)': tT, 'Net Rent (₹)': tN,
//         ...(hasGst ? {
//           'GST No': '', 'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
//           'Total GST (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)),
//         } : {}),
//         ...splitTotalsFields(eligible, splitCols),
//         ...splitSumTotalField(eligible, splitCols),
//       });

//       const wb  = XLSX.utils.book_new();
//       const wsD = XLSX.utils.json_to_sheet(dRows);
//       // Unit No col (wch:10) replaces Property col (wch:16) — same position
//       const detailBase = hasGst
//         ? [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:10},{wch:5},{wch:6},
//            {wch:14},{wch:10},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}]
//         : [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:10},{wch:5},{wch:6},
//            {wch:14},{wch:10},{wch:14},{wch:14}];
//       appendSplitWidths(detailBase, splitCols);
//       styleHeader(wsD, detailBase);
//       styleTotalsRow(wsD, dRows.length, 'FEE2E2');
//       XLSX.utils.book_append_sheet(wb, wsD, `${tdsQuarter} Detail`);

//       // Customer Summary sheet
//       const custMap = {};
//       eligible.forEach((g) => {
//         const k = g.customer_code || g.customer_name;
//         if (!custMap[k]) {
//           custMap[k] = {
//             name: g.customer_name, pan: g.pan_number,
//             bank: g.bank_account_number,
//             unitNo: g.unit_no,                                   // ← added, property removed
//             gstNo: g.gst_no,
//             gross: 0, tds: 0, net: 0, cgst: 0, sgst: 0, gst: 0, months: 0,
//             splitBreakdown: g._splitBreakdown
//               ? g._splitBreakdown.map((s) => ({ ...s, _total: r2(s._total) }))
//               : null,
//           };
//         } else {
//           if (custMap[k].splitBreakdown && g._splitBreakdown) {
//             g._splitBreakdown.forEach((b, i) => {
//               if (custMap[k].splitBreakdown[i])
//                 custMap[k].splitBreakdown[i]._total =
//                   r2(custMap[k].splitBreakdown[i]._total + b._total);
//             });
//           }
//         }
//         custMap[k].gross  = r2(custMap[k].gross  + g._gross);
//         custMap[k].tds    = r2(custMap[k].tds    + g._tds);
//         custMap[k].net    = r2(custMap[k].net    + g._net);
//         custMap[k].cgst   = r2(custMap[k].cgst   + g._cgstAmt);
//         custMap[k].sgst   = r2(custMap[k].sgst   + g._sgstAmt);
//         custMap[k].gst    = r2(custMap[k].gst    + g._gstTotal);
//         custMap[k].months++;
//       });

//       const custArr       = Object.values(custMap);
//       const custSplitCols = buildSplitColDefs(
//         custArr.map((c) => ({ _splitBreakdown: c.splitBreakdown }))
//       );

//       const cRows = custArr.map((c, i) => ({
//         'S.No':             i + 1,
//         'Customer Name':    c.name,
//         'PAN Number':       c.pan  || '',
//         'Bank Account No':  c.bank || '',
//         'Unit No':          c.unitNo || '',                      // ← added, property removed
//         'Months':           c.months,
//         'Total Gross (₹)':  r0(c.gross),
//         'Total TDS (₹)':    r0(c.tds),
//         'Total Net (₹)':    r0(c.net),
//         ...(hasGst ? {
//           'GST No':              c.gstNo || '-',
//           'CGST Amt (₹)':        r0(c.cgst),
//           'SGST Amt (₹)':        r0(c.sgst),
//           'Total GST (₹)':       r0(c.gst),
//           'Total Transfer (₹)':  r0(r2(c.net + c.gst)),
//         } : {}),
//         ...splitFields({ _splitBreakdown: c.splitBreakdown }, custSplitCols),
//         ...splitSumField({ _splitBreakdown: c.splitBreakdown }, custSplitCols),
//       }));

//       // Unit No col (wch:10) replaces Property col (wch:16) — same position
//       const custBase = hasGst
//         ? [{wch:5},{wch:28},{wch:13},{wch:20},{wch:10},{wch:8},
//            {wch:14},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}]
//         : [{wch:5},{wch:28},{wch:13},{wch:20},{wch:10},{wch:8},{wch:14},{wch:14},{wch:14}];
//       appendSplitWidths(custBase, custSplitCols);
//       const wsC = XLSX.utils.json_to_sheet(cRows);
//       styleHeader(wsC, custBase);
//       XLSX.utils.book_append_sheet(wb, wsC, 'Customer Summary');

//       const custSuffix = tdsCustomer ? `_${tdsCustomer.customer.customer_name.replace(/\s+/g,'_')}` : '';
//       XLSX.writeFile(wb, `TDS_Report_${tdsQuarter}_${fy.label.replace(/ /g, '_')}${custSuffix}.xlsx`);
//       toast.success('TDS report downloaded!');
//     } catch (err) { console.error(err); toast.error('Failed to generate TDS report'); }
//     finally { setLoad('tds', false); }
//   };

//   // ── CUSTOMER STATEMENT ────────────────────────────────────────────────────
//   const generateCustomerStatement = async () => {
//     if (!stmtCustomer) { toast.warning('Please select a customer'); return; }
//     setLoad('customer', true);
//     try {
//       const cust = stmtCustomer.customer;

//       const result = await paymentService.getPaymentHistory({
//         customerId: cust.customer_id || cust.id,
//         limit: 1000,
//       });
//       let raw = result.data.payments || [];

//       if (!raw.length && cust.customer_name) {
//         const allResult = await paymentService.getPaymentHistory({ limit: 5000 });
//         raw = (allResult.data.payments || []).filter((p) =>
//           (p.customer_name || '').toLowerCase() === (cust.customer_name || '').toLowerCase()
//         );
//       }

//       const wb = XLSX.utils.book_new();

//       if (raw.length) {
//         const grp       = groupPayments(raw);
//         const hasGst    = grp.some((g) => g._gstTotal > 0);
//         const splitCols = buildSplitColDefs(grp);

//         const rows = grp.map((g, i) => ({
//           'S.No':            i + 1,
//           'Payment Month':   g.payment_month || '',
//           'Payment Date':    g.payment_date ? formatDate(g.payment_date) : '',
//           'Period / Type':   g.payment_period || g.agreement_type || '',
//           'Unit No':         g.unit_no        || '',             // ← added, property removed
//           'Inst Count':      g._count,
//           'Base Rent (₹)':   r0(g.base_rent),
//           'Escalation (%)':  parseFloat(g.escalation_rate) || 0,
//           'Gross Rent (₹)':  r0(g._gross),
//           'TDS (₹)':         r0(g._tds),
//           'Net Rent (₹)':    r0(g._net),
//           ...(hasGst ? {
//             'CGST Amt (₹)':      r0(g._cgstAmt),
//             'SGST Amt (₹)':      r0(g._sgstAmt),
//             'Total GST (₹)':     r0(g._gstTotal),
//             'Net Transfer (₹)':  r0(r2(g._net + g._gstTotal)),
//           } : {}),
//           ...splitFields(g, splitCols),
//           ...splitSumField(g, splitCols),
//           'Status': g.status || '',
//         }));

//         const tG   = r0(grp.reduce((s, g) => r2(s + g._gross),    0));
//         const tT   = r0(grp.reduce((s, g) => r2(s + g._tds),      0));
//         const tN   = r0(grp.reduce((s, g) => r2(s + g._net),      0));
//         const tGst = r0(grp.reduce((s, g) => r2(s + g._gstTotal), 0));

//         rows.push({
//           'S.No': '', 'Payment Month': '', 'Payment Date': '', 'Period / Type': 'TOTAL',
//           'Unit No': '',                                         // ← updated
//           'Inst Count': grp.length, 'Base Rent (₹)': '', 'Escalation (%)': '',
//           'Gross Rent (₹)': tG, 'TDS (₹)': tT, 'Net Rent (₹)': tN,
//           ...(hasGst ? {
//             'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
//             'Total GST (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)),
//           } : {}),
//           ...splitTotalsFields(grp, splitCols),
//           ...splitSumTotalField(grp, splitCols),
//           'Status': '',
//         });

//         const ws = XLSX.utils.json_to_sheet(rows);
//         // Unit No col (wch:10) replaces Property col — same position after Period/Type
//         const baseCols = hasGst
//           ? [{wch:5},{wch:14},{wch:14},{wch:26},{wch:10},{wch:6},{wch:14},{wch:12},
//              {wch:14},{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}]
//           : [{wch:5},{wch:14},{wch:14},{wch:26},{wch:10},{wch:6},{wch:14},{wch:12},
//              {wch:14},{wch:12},{wch:14},{wch:10}];
//         styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
//         styleTotalsRow(ws, rows.length, 'E0F2FE');
//         XLSX.utils.book_append_sheet(wb, ws, 'Statement');
//       } else {
//         const wsEmpty = XLSX.utils.aoa_to_sheet([
//           ['No payment records found for this customer'],
//           ['Customer:', cust.customer_name],
//           ['Note:', 'No payments have been generated yet for this customer.'],
//         ]);
//         wsEmpty['!cols'] = [{ wch: 30 }, { wch: 40 }];
//         XLSX.utils.book_append_sheet(wb, wsEmpty, 'Statement');
//         toast.info(`No payments found for "${cust.customer_name}". Downloading customer info only.`);
//       }

//       // Customer Info sheet — always included
//       const infoWs = XLSX.utils.aoa_to_sheet([
//         ['Customer Payment Statement'], [''],
//         ['Customer Name',   cust.customer_name  || ''],
//         ['Customer ID',     cust.customer_ref || cust.customer_id || ''],
//         ['PAN Number',      cust.pan_number     || ''],
//         ['Unit No',         cust.unit_no        || ''],          // ← added, property removed
//         ['Floor / Unit',    `F${cust.floor_no || '?'} · U${cust.unit_no || '?'}`],
//         ['Agreement',       cust.agreement_type || ''],
//         ['Status',          cust.status         || ''],
//         ['Bank A/C No',     cust.bank_account_number || ''],
//         ['IFSC Code',       cust.ifsc_code      || ''],
//         ['Generated On',    new Date().toLocaleString()], [''],
//         ['Total Payments (grouped)', raw.length > 0
//           ? groupPayments(raw).length
//           : 'No payments yet'],
//       ]);
//       infoWs['!cols'] = [{ wch: 24 }, { wch: 36 }];
//       XLSX.utils.book_append_sheet(wb, infoWs, 'Customer Info');

//       XLSX.writeFile(wb, `Statement_${(cust.customer_name || 'Customer').replace(/\s+/g, '_')}.xlsx`);
//       toast.success('Statement downloaded!');
//     } catch (err) { console.error(err); toast.error('Failed to generate statement'); }
//     finally { setLoad('customer', false); }
//   };

//   // ─── Report Card UI ────────────────────────────────────────────────────────
//   const ReportCard = ({
//     icon, title, description, badge, badgeColor = 'primary',
//     accentColor, children, onGenerate, loadKey,
//   }) => (
//     <div className="card border-0 shadow-sm h-100" style={{ borderTop: `4px solid ${accentColor}` }}>
//       <div className="card-body d-flex flex-column">
//         <div className="d-flex align-items-start gap-3 mb-3">
//           <div
//             className="rounded-3 p-2 d-flex align-items-center justify-content-center flex-shrink-0"
//             style={{ background: accentColor + '18', width: 48, height: 48 }}
//           >
//             <i className={`bi ${icon} fs-4`} style={{ color: accentColor }} />
//           </div>
//           <div>
//             <h5 className="fw-bold mb-1">{title}</h5>
//             <p className="text-muted small mb-0">{description}</p>
//           </div>
//           {badge && <span className={`badge bg-${badgeColor} ms-auto`}>{badge}</span>}
//         </div>
//         <div className="flex-grow-1">{children}</div>
//         <button
//           className="btn btn-sm mt-3 fw-semibold w-100"
//           style={{ background: accentColor, color: '#fff', border: 'none' }}
//           onClick={onGenerate}
//           disabled={loading[loadKey]}
//         >
//           {loading[loadKey]
//             ? <><span className="spinner-border spinner-border-sm me-2" />Generating…</>
//             : <><i className="bi bi-file-earmark-excel me-2" />Download Excel</>}
//         </button>
//       </div>
//     </div>
//   );

//   // ─── Render ────────────────────────────────────────────────────────────────
//   return (
//     <div className="container-fluid">
//       <div className="mb-4">
//         <h4 className="fw-bold mb-1">
//           <i className="bi bi-bar-chart-line text-primary me-2" />Reports
//         </h4>
//         <p className="text-muted small mb-0">
//           Generate Excel reports · All amounts in whole rupees · Search any customer by name, unit, floor or PAN
//         </p>
//       </div>

//       <div className="row g-4">

//         {/* ── Monthly ── */}
//         <div className="col-md-6">
//           <ReportCard
//             icon="bi-calendar-month" title="Monthly Report"
//             description="Combined payment records for a selected month"
//             badge={monthlyMonth} badgeColor="primary" accentColor="#2563EB"
//             onGenerate={generateMonthlyReport} loadKey="monthly"
//           >
//             <div className="row g-2">
//               <div className="col-7">
//                 <label className="form-label small fw-semibold mb-1">Month</label>
//                 <input type="month" className="form-control form-control-sm"
//                   value={monthlyMonth} onChange={(e) => setMonthlyMonth(e.target.value)} />
//               </div>
//               <div className="col-5">
//                 <label className="form-label small fw-semibold mb-1">Agreement</label>
//                 <select className="form-select form-select-sm" value={monthlyAgreement}
//                   onChange={(e) => setMonthlyAgreement(e.target.value)}>
//                   <option value="">All</option>
//                   <option value="Construction">Construction</option>
//                   <option value="9-Year">9-Year</option>
//                 </select>
//               </div>
//             </div>
//             <div className="mt-2">
//               <CustomerFilter value={monthlyCustomer} onChange={setMonthlyCustomer} />
//             </div>
//             <div className="p-2 rounded-2" style={{ background: '#EFF6FF', fontSize: '0.78rem' }}>
//               <strong>Columns:</strong> Gross · TDS · Net · Split 1…N · Total Split · Status
//               &nbsp;|&nbsp;<strong>Amounts:</strong> Whole ₹ (no decimals)
//             </div>
//           </ReportCard>
//         </div>

//         {/* ── Annual ── */}
//         <div className="col-md-6">
//           <ReportCard
//             icon="bi-calendar-range" title="Annual Report"
//             description="Full financial year combined payment summary"
//             badge={fy.label} badgeColor="success" accentColor="#16A34A"
//             onGenerate={generateAnnualReport} loadKey="annual"
//           >
//             <div className="p-2 rounded-2 mb-2" style={{ background: '#F0FDF4', fontSize: '0.78rem' }}>
//               <strong>FY:</strong> {fy.label} &nbsp;|&nbsp;
//               <strong>Period:</strong> {fy.start} → {fy.end}
//             </div>
//             <CustomerFilter value={annualCustomer} onChange={setAnnualCustomer} />
//             <div className="p-2 rounded-2" style={{ background: '#F0FDF4', fontSize: '0.78rem' }}>
//               <strong>Sheets:</strong> All Payments + Monthly Summary · Split columns + Total Split (₹)
//             </div>
//           </ReportCard>
//         </div>

//         {/* ── TDS ── */}
//         <div className="col-md-6">
//           <ReportCard
//             icon="bi-percent" title="TDS Report"
//             description="Quarterly TDS — combined installments per customer per month"
//             accentColor="#DC2626" onGenerate={generateTDSReport} loadKey="tds"
//           >
//             <label className="form-label small fw-semibold">Quarter ({fy.label})</label>
//             <div className="d-flex gap-2 flex-wrap mb-2">
//               {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
//                 <button key={q} type="button"
//                   className={`btn btn-sm ${tdsQuarter === q ? 'btn-danger' : 'btn-outline-danger'}`}
//                   onClick={() => setTdsQuarter(q)}>
//                   {q}
//                   <small className="d-block" style={{ fontSize: '0.65rem' }}>
//                     {q === 'Q1' ? 'Apr–Jun' : q === 'Q2' ? 'Jul–Sep' : q === 'Q3' ? 'Oct–Dec' : 'Jan–Mar'}
//                   </small>
//                 </button>
//               ))}
//             </div>
//             <CustomerFilter value={tdsCustomer} onChange={setTdsCustomer} />
//             <div className="p-2 rounded-2" style={{ background: '#FEF2F2', fontSize: '0.78rem' }}>
//               <strong>Sheets:</strong> Detail + Customer Summary · Split columns + Total Split (₹)
//             </div>
//           </ReportCard>
//         </div>

//         {/* ── Customer Statement ── */}
//         <div className="col-md-6">
//           <ReportCard
//             icon="bi-person-lines-fill" title="Customer Statement"
//             description="Complete payment history for a customer — works even without payments"
//             accentColor="#7C3AED" onGenerate={generateCustomerStatement} loadKey="customer"
//           >
//             <label className="form-label small fw-semibold mb-1">
//               Select Customer <span className="text-danger">*</span>
//             </label>
//             <Select
//               options={customerOptions}
//               value={stmtCustomer}
//               onChange={setStmtCustomer}
//               filterOption={filterOption}
//               styles={selectStyles}
//               isClearable
//               isSearchable
//               isLoading={customersLoading}
//               placeholder={
//                 <span className="text-muted" style={{ fontSize: '0.82rem' }}>
//                   <i className="bi bi-search me-1" />Search by name, unit, floor, PAN…
//                 </span>
//               }
//               noOptionsMessage={({ inputValue }) =>
//                 inputValue ? `No customer found for "${inputValue}"` : 'No customers'
//               }
//             />
//             {stmtCustomer && (
//               <div className="mt-2 p-2 rounded-2 d-flex gap-2 align-items-center"
//                 style={{ background: '#F5F3FF', fontSize: '0.78rem' }}>
//                 <i className="bi bi-person-check-fill text-purple" style={{ color: '#7C3AED' }} />
//                 <div>
//                   <strong>{stmtCustomer.customer.customer_name}</strong>
//                   <span className="text-muted ms-2">
//                     {stmtCustomer.customer.customer_ref || stmtCustomer.customer.customer_id}
//                     &nbsp;·&nbsp;
//                     F{stmtCustomer.customer.floor_no || '?'} U{stmtCustomer.customer.unit_no || '?'}
//                     &nbsp;·&nbsp;{stmtCustomer.customer.agreement_type}
//                   </span>
//                 </div>
//               </div>
//             )}
//             <div className="mt-2 p-2 rounded-2" style={{ background: '#F5F3FF', fontSize: '0.78rem' }}>
//               <strong>Sheets:</strong> Statement + Customer Info ·
//               Shows customer info even if no payment was generated
//             </div>
//           </ReportCard>
//         </div>
//       </div>

//       {/* Info footer */}
//       <div className="card border-0 shadow-sm mt-4">
//         <div className="card-body py-3">
//           <div className="d-flex align-items-start gap-3 flex-wrap">
//             <small className="text-muted fw-semibold flex-shrink-0">
//               <i className="bi bi-info-circle me-1" />All reports include:
//             </small>
//             <div className="d-flex gap-2 flex-wrap">
//               {[
//                 'Gross Rent (₹)', 'TDS (₹)', 'Net Rent (₹)', 'GST (if applicable)', 'Net Transfer (₹)',
//                 'Unit No',
//                 'Split 1 – Name / Bank / A/C / IFSC / ₹',
//                 'Split 2 … N (auto-added)',
//                 'Total Split (₹)  ← "-" if no splits',
//                 'Amounts in whole ₹ — no decimals',
//                 'Customer search in all reports',
//               ].map((item) => (
//                 <span key={item} className="badge bg-light text-dark border" style={{ fontSize: '0.72rem' }}>
//                   {item}
//                 </span>
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Reports;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { toast } from 'react-toastify';
import paymentService  from '../../Services/payment.service';
import customerService from '../../Services/customer.service';
import { formatDate }  from '../../Utils/helpers';

// ─── Rounding helpers ─────────────────────────────────────────────────────────
const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
const r0 = (v) => Math.round(parseFloat(v) || 0);

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
const buildSplitColDefs = (grp) => {
  const maxSlots = Math.max(0, ...grp.map((g) => (g._splitBreakdown ? g._splitBreakdown.length : 0)));
  if (!maxSlots) return [];
  return Array.from({ length: maxSlots }, (_, i) => ({
    index: i,
    colName:  `Split ${i + 1} – Name`,
    colBank:  `Split ${i + 1} – Bank`,
    colAccNo: `Split ${i + 1} – A/C No`,
    colIFSC:  `Split ${i + 1} – IFSC`,
    colAmt:   `Split ${i + 1} (₹)`,
  }));
};

const splitFields = (g, colDefs) => {
  const out = {};
  colDefs.forEach((col) => {
    const s = g._splitBreakdown?.[col.index];
    out[col.colName]  = s ? (s.accountHolderName || '') : '';
    out[col.colBank]  = s ? (s.bankName          || '') : '';
    out[col.colAccNo] = s ? (s.bankAccountNumber || '') : '';
    out[col.colIFSC]  = s ? (s.ifscCode          || '') : '';
    out[col.colAmt]   = s != null ? r0(s._total)         : '';
  });
  return out;
};

const splitSumField = (g, colDefs) => {
  if (!colDefs.length) return {};
  if (!g._splitBreakdown || !g._splitBreakdown.length)
    return { 'Total Split (₹)': '-' };
  const total = colDefs.reduce((sum, col) => {
    const s = g._splitBreakdown[col.index];
    return s != null ? r2(sum + r2(s._total)) : sum;
  }, 0);
  return { 'Total Split (₹)': r0(total) };
};

const splitTotalsFields = (grp, colDefs) => {
  const out = {};
  colDefs.forEach((col) => {
    out[col.colName]  = '';
    out[col.colBank]  = '';
    out[col.colAccNo] = '';
    out[col.colIFSC]  = '';
    out[col.colAmt]   = r0(grp.reduce((sum, g) => {
      const s = g._splitBreakdown?.[col.index];
      return s != null ? r2(sum + r2(s._total)) : sum;
    }, 0)) || '';
  });
  return out;
};

const splitSumTotalField = (grp, colDefs) => {
  if (!colDefs.length) return {};
  const grand = colDefs.reduce((acc, col) => {
    const colSum = grp.reduce((sum, g) => {
      const s = g._splitBreakdown?.[col.index];
      return s != null ? r2(sum + r2(s._total)) : sum;
    }, 0);
    return r2(acc + colSum);
  }, 0);
  return { 'Total Split (₹)': r0(grand) || '' };
};

const injectSplitWidths = (baseCols, colDefs, trailingCount = 1) => {
  if (!colDefs.length) return baseCols;
  const trailing = baseCols.splice(-trailingCount);
  colDefs.forEach(() => {
    baseCols.push({ wch: 22 });
    baseCols.push({ wch: 20 });
    baseCols.push({ wch: 18 });
    baseCols.push({ wch: 13 });
    baseCols.push({ wch: 14 });
  });
  baseCols.push({ wch: 16 });
  trailing.forEach((c) => baseCols.push(c));
  return baseCols;
};

const appendSplitWidths = (baseCols, colDefs) => {
  if (!colDefs.length) return baseCols;
  colDefs.forEach(() => {
    baseCols.push({ wch: 22 });
    baseCols.push({ wch: 20 });
    baseCols.push({ wch: 18 });
    baseCols.push({ wch: 13 });
    baseCols.push({ wch: 14 });
  });
  baseCols.push({ wch: 16 });
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
    const rawSplits = parseSplits(p.payout_splits ?? p.payment_payout_splits ?? p.customer_payout_splits);
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

// ─── TDS mode transformation ──────────────────────────────────────────────────
// When tdsMode === 'exclude':
//   • _tds  → 0  (no TDS deducted)
//   • _net  → _gross  (full gross is the payout)
//   • split amounts recalculated on gross
//   • TDS column omitted from Excel
const applyTdsMode = (grp, tdsMode) => {
  if (tdsMode === 'include') return grp;
  return grp.map((g) => {
    const rawSplits = parseSplits(
      g.payout_splits ?? g.payment_payout_splits ?? g.customer_payout_splits
    );
    const newBreakdown = rawSplits
      ? splitPayout(g._gross, rawSplits)?.map((b) => ({ ...b, _total: b.amount }))
      : g._splitBreakdown;
    return {
      ...g,
      _tds:            0,
      _net:            g._gross,   // net = gross when TDS is excluded
      _splitBreakdown: newBreakdown,
    };
  });
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

// ─── React-Select styles ──────────────────────────────────────────────────────
const selectStyles = {
  control: (base, state) => ({
    ...base,
    borderColor: state.isFocused ? '#86b7fe' : '#ced4da',
    boxShadow:   state.isFocused ? '0 0 0 0.25rem rgba(13,110,253,.25)' : 'none',
    minHeight: 32,
    fontSize: '0.85rem',
  }),
  menu:    (base) => ({ ...base, zIndex: 9999, fontSize: '0.85rem' }),
  option:  (base, { isFocused, isSelected }) => ({
    ...base,
    backgroundColor: isSelected ? '#0d6efd' : isFocused ? '#f0f4ff' : '#fff',
    color: isSelected ? '#fff' : '#212529',
    padding: '6px 10px',
  }),
};

// ─── TDS Mode Dropdown ────────────────────────────────────────────────────────
// Reusable pill-style toggle used in every report card.
const TdsModeDropdown = ({ value, onChange, accentColor }) => (
  <div className="mb-2">
    <label className="form-label small fw-semibold mb-1 d-flex align-items-center gap-1">
      <i className="bi bi-toggles" style={{ color: accentColor }} />
      TDS in Report
    </label>
    <div className="d-flex gap-0" style={{ border: `1.5px solid ${accentColor}33`, borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
      {[
        { v: 'include', icon: 'bi-check-circle-fill',   label: 'Including TDS' },
        { v: 'exclude', icon: 'bi-dash-circle-fill',    label: 'Excluding TDS' },
      ].map(({ v, icon, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              padding:    '5px 14px',
              fontSize:   '0.78rem',
              fontWeight: active ? 700 : 400,
              background: active ? accentColor : '#fff',
              color:      active ? '#fff' : accentColor,
              border:     'none',
              cursor:     'pointer',
              transition: 'all 0.15s',
              display:    'flex',
              alignItems: 'center',
              gap:        5,
              whiteSpace: 'nowrap',
            }}
          >
            <i className={`bi ${icon}`} style={{ fontSize: '0.8rem' }} />
            {label}
          </button>
        );
      })}
    </div>
    {value === 'exclude' && (
      <div className="mt-1" style={{ fontSize: '0.72rem', color: '#6B7280' }}>
        <i className="bi bi-info-circle me-1" />
        TDS column hidden · Net = Gross in the downloaded file
      </div>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const Reports = () => {
  const fy = getCurrentFinancialYear();

  const [loading,          setLoading]          = useState({});
  const [customers,        setCustomers]        = useState([]);
  const [customersLoaded,  setCustomersLoaded]  = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Per-report customer filters
  const [monthlyCustomer,  setMonthlyCustomer]  = useState(null);
  const [annualCustomer,   setAnnualCustomer]   = useState(null);
  const [tdsCustomer,      setTdsCustomer]      = useState(null);
  const [stmtCustomer,     setStmtCustomer]     = useState(null);

  // Monthly report controls
  const [monthlyMonth,     setMonthlyMonth]     = useState(getCurrentMonth());
  const [monthlyAgreement, setMonthlyAgreement] = useState('');

  // TDS quarter
  const [tdsQuarter,       setTdsQuarter]       = useState('Q1');

  // ── TDS mode per report (include / exclude) ───────────────────────────────
  const [monthlyTdsMode, setMonthlyTdsMode] = useState('include');
  const [annualTdsMode,  setAnnualTdsMode]  = useState('include');
  const [tdsTdsMode,     setTdsTdsMode]     = useState('include');
  const [stmtTdsMode,    setStmtTdsMode]    = useState('include');

  const setLoad = (key, val) => setLoading((prev) => ({ ...prev, [key]: val }));

  // ── Load all customers once ───────────────────────────────────────────────
  useEffect(() => { loadCustomers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCustomers = async () => {
    if (customersLoaded || customersLoading) return;
    setCustomersLoading(true);
    try {
      const res = await customerService.getAllCustomers({ limit: 5000 });
      setCustomers(res.data.customers || []);
      setCustomersLoaded(true);
    } catch { toast.error('Failed to load customer list'); }
    finally { setCustomersLoading(false); }
  };

  // ── React-Select options ──────────────────────────────────────────────────
  const customerOptions = useMemo(() =>
    customers.map((c) => ({
      value:    c.id,
      label:    `${c.customer_name}  ·  ${c.customer_ref || c.customer_id}  ·  F${c.floor_no || '?'} U${c.unit_no || '?'}`,
      customer: c,
    })), [customers]);

  const filterOption = useCallback((option, inputValue) => {
    if (!inputValue) return true;
    const q  = inputValue.toLowerCase();
    const c  = option.data?.customer;
    if (!c) return false;
    return (
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.customer_ref  || '').toLowerCase().includes(q) ||
      (c.customer_id   || '').toLowerCase().includes(q) ||
      (c.unit_no       || '').toLowerCase().includes(q) ||
      (c.floor_no      || '').toLowerCase().includes(q) ||
      (c.pan_number    || '').toLowerCase().includes(q) ||
      (c.email         || '').toLowerCase().includes(q)
    );
  }, []);

  // ── Customer filter UI ────────────────────────────────────────────────────
  const CustomerFilter = ({ value, onChange, placeholder = 'All customers (search to filter)' }) => (
    <div className="mb-2">
      <label className="form-label small fw-semibold mb-1">Customer Filter (optional)</label>
      <Select
        options={customerOptions}
        value={value}
        onChange={onChange}
        filterOption={filterOption}
        styles={selectStyles}
        isClearable
        isSearchable
        isLoading={customersLoading}
        placeholder={
          <span className="text-muted" style={{ fontSize: '0.82rem' }}>
            <i className="bi bi-search me-1" />
            {placeholder}
          </span>
        }
        noOptionsMessage={({ inputValue }) =>
          inputValue ? `No customer found for "${inputValue}"` : 'No customers'
        }
      />
    </div>
  );

  // ── Filter payments by selected customer ────────────────────────────────
  const applyCustomerFilter = (payments, selectedOption) => {
    if (!selectedOption) return payments;
    const cust = selectedOption.customer;
    return payments.filter((p) =>
      p.customer_id === cust.customer_id ||
      p.customer_id === cust.id          ||
      p.customer_code === cust.customer_ref ||
      p.customer_code === cust.customer_id  ||
      (p.customer_name || '').toLowerCase() === (cust.customer_name || '').toLowerCase()
    );
  };

  // ── MONTHLY REPORT ────────────────────────────────────────────────────────
  const generateMonthlyReport = async () => {
    setLoad('monthly', true);
    try {
      const result = await paymentService.getPaymentHistory({
        month:         monthlyMonth,
        agreementType: monthlyAgreement || undefined,
        limit:         5000,
      });
      let raw = result.data.payments || [];
      raw = applyCustomerFilter(raw, monthlyCustomer);

      if (!raw.length) {
        toast.warning(monthlyCustomer
          ? `No payments found for "${monthlyCustomer.customer.customer_name}" in ${monthlyMonth}`
          : 'No data for this month');
        return;
      }

      const grp       = applyTdsMode(groupPayments(raw), monthlyTdsMode);
      const showTds   = monthlyTdsMode === 'include';
      const hasGst    = grp.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(grp);

      const rows = grp.map((g, i) => ({
        'S.No':            i + 1,
        'Customer Name':   g.customer_name || '',
        'Customer ID':     g.customer_code || '',
        'PAN Number':      g.pan_number    || '',
        'Bank Account No': g.bank_account_number || '',
        'Unit No':         g.unit_no       || '',
        'Agreement Type':  g.agreement_type || '',
        'Payment Date':    g.payment_date ? formatDate(g.payment_date) : '',
        'Period':          g.payment_month || '',
        'Inst Count':      g._count,
        'Base Rent (₹)':   r0(g.base_rent),
        'Escalation (%)':  parseFloat(g.escalation_rate) || 0,
        'Gross Rent (₹)':  r0(g._gross),
        ...(showTds ? { 'TDS (₹)': r0(g._tds) } : {}),
        'Net Rent (₹)':    r0(g._net),
        ...(hasGst ? {
          'GST No':            g.gst_no || '-',
          'CGST Amt (₹)':      r0(g._cgstAmt),
          'SGST Amt (₹)':      r0(g._sgstAmt),
          'Total GST (₹)':     r0(g._gstTotal),
          'Net Transfer (₹)':  r0(r2(g._net + g._gstTotal)),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),
        'Status': g.status || '',
      }));

      const tG   = r0(grp.reduce((s, g) => r2(s + g._gross),    0));
      const tT   = r0(grp.reduce((s, g) => r2(s + g._tds),      0));
      const tN   = r0(grp.reduce((s, g) => r2(s + g._net),      0));
      const tGst = r0(grp.reduce((s, g) => r2(s + g._gstTotal), 0));

      rows.push({
        'S.No': '', 'Customer Name': 'TOTAL', 'Customer ID': '', 'PAN Number': '',
        'Bank Account No': '', 'Unit No': '', 'Agreement Type': '',
        'Payment Date': '', 'Period': '', 'Inst Count': grp.length,
        'Base Rent (₹)': '', 'Escalation (%)': '',
        'Gross Rent (₹)': tG,
        ...(showTds ? { 'TDS (₹)': tT } : {}),
        'Net Rent (₹)': tN,
        ...(hasGst ? {
          'GST No': '', 'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
          'Total GST (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)),
        } : {}),
        ...splitTotalsFields(grp, splitCols),
        ...splitSumTotalField(grp, splitCols),
        'Status': '',
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      const baseCols = hasGst
        ? (showTds
            ? [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:10},{wch:16},{wch:13},{wch:12},{wch:6},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}]
            : [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:10},{wch:16},{wch:13},{wch:12},{wch:6},{wch:12},{wch:10},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}])
        : (showTds
            ? [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:10},{wch:16},{wch:13},{wch:12},{wch:6},{wch:12},{wch:10},{wch:14},{wch:12},{wch:14},{wch:10}]
            : [{wch:5},{wch:28},{wch:12},{wch:13},{wch:20},{wch:10},{wch:16},{wch:13},{wch:12},{wch:6},{wch:12},{wch:10},{wch:14},{wch:14},{wch:10}]);

      styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
      styleTotalsRow(ws, rows.length);
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');

      const custLabel = monthlyCustomer ? monthlyCustomer.customer.customer_name : 'All';
      const summaryWs = XLSX.utils.aoa_to_sheet([
        ['Monthly Rental Report'], [''],
        ['Month',         monthlyMonth],
        ['Agreement',     monthlyAgreement || 'All'],
        ['Customer',      custLabel],
        ['TDS Mode',      showTds ? 'Including TDS' : 'Excluding TDS'],
        ['Generated',     new Date().toLocaleString()], [''],
        ['Total Customers (grouped)', grp.length],
        ['Total Gross (₹)',    tG],
        ...(showTds ? [['Total TDS (₹)', tT]] : []),
        ['Total Net Rent (₹)', tN],
        ...(hasGst ? [['Total GST (₹)', tGst], ['Total Payable (₹)', r0(r2(tN + tGst))]] : []),
      ]);
      summaryWs['!cols'] = [{ wch: 22 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      const custSuffix  = monthlyCustomer ? `_${monthlyCustomer.customer.customer_name.replace(/\s+/g,'_')}` : '';
      const tdsSuffix   = showTds ? '' : '_ExclTDS';
      XLSX.writeFile(wb, `Monthly_Report_${monthlyMonth}${custSuffix}${tdsSuffix}.xlsx`);
      toast.success('Monthly report downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate monthly report'); }
    finally { setLoad('monthly', false); }
  };

  // ── ANNUAL REPORT ─────────────────────────────────────────────────────────
  const generateAnnualReport = async () => {
    setLoad('annual', true);
    try {
      const result = await paymentService.getPaymentHistory({
        startDate: fy.start + '-01', endDate: fy.end + '-31', limit: 5000,
      });
      let raw = result.data.payments || [];
      raw = applyCustomerFilter(raw, annualCustomer);

      if (!raw.length) {
        toast.warning(annualCustomer
          ? `No payments for "${annualCustomer.customer.customer_name}" this FY`
          : 'No data for this financial year');
        return;
      }

      const grp       = applyTdsMode(groupPayments(raw), annualTdsMode);
      const showTds   = annualTdsMode === 'include';
      const hasGst    = grp.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(grp);

      const rows = grp.map((g, i) => ({
        'S.No':            i + 1,
        'Month':           g.payment_month || '',
        'Customer Name':   g.customer_name || '',
        'PAN Number':      g.pan_number    || '',
        'Bank Account No': g.bank_account_number || '',
        'Unit No':         g.unit_no       || '',
        'Agreement Type':  g.agreement_type || '',
        'Inst Count':      g._count,
        'Gross Rent (₹)':  r0(g._gross),
        ...(showTds ? { 'TDS (₹)': r0(g._tds) } : {}),
        'Net Rent (₹)':    r0(g._net),
        ...(hasGst ? {
          'GST Total (₹)':    r0(g._gstTotal),
          'Net Transfer (₹)': r0(r2(g._net + g._gstTotal)),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),
        'Status': g.status || '',
      }));

      const tG   = r0(grp.reduce((s, g) => r2(s + g._gross),    0));
      const tT   = r0(grp.reduce((s, g) => r2(s + g._tds),      0));
      const tN   = r0(grp.reduce((s, g) => r2(s + g._net),      0));
      const tGst = r0(grp.reduce((s, g) => r2(s + g._gstTotal), 0));

      rows.push({
        'S.No': '', 'Month': '', 'Customer Name': 'GRAND TOTAL', 'PAN Number': '',
        'Bank Account No': '', 'Unit No': '', 'Agreement Type': '',
        'Inst Count': grp.length,
        'Gross Rent (₹)': tG,
        ...(showTds ? { 'TDS (₹)': tT } : {}),
        'Net Rent (₹)': tN,
        ...(hasGst ? { 'GST Total (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)) } : {}),
        ...splitTotalsFields(grp, splitCols),
        ...splitSumTotalField(grp, splitCols),
        'Status': '',
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      const baseCols = hasGst
        ? (showTds
            ? [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:10},{wch:16},{wch:6},{wch:14},{wch:12},{wch:14},{wch:14},{wch:14},{wch:10}]
            : [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:10},{wch:16},{wch:6},{wch:14},{wch:14},{wch:14},{wch:14},{wch:10}])
        : (showTds
            ? [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:10},{wch:16},{wch:6},{wch:14},{wch:12},{wch:14},{wch:10}]
            : [{wch:5},{wch:12},{wch:28},{wch:13},{wch:20},{wch:10},{wch:16},{wch:6},{wch:14},{wch:14},{wch:10}]);

      styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
      styleTotalsRow(ws, rows.length, 'DCFCE7');
      XLSX.utils.book_append_sheet(wb, ws, 'All Payments');

      // Monthly summary tab
      const mmap = {};
      grp.forEach((g) => {
        const m = g.payment_month || 'Unknown';
        if (!mmap[m]) mmap[m] = { count: 0, gross: 0, tds: 0, net: 0, gst: 0 };
        mmap[m].count++;
        mmap[m].gross = r2(mmap[m].gross + g._gross);
        mmap[m].tds   = r2(mmap[m].tds   + g._tds);
        mmap[m].net   = r2(mmap[m].net   + g._net);
        mmap[m].gst   = r2(mmap[m].gst   + g._gstTotal);
      });
      const mRows = Object.entries(mmap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d], i) => ({
          'S.No': i + 1, 'Month': month, 'Customers': d.count,
          'Gross (₹)':    r0(d.gross),
          ...(showTds ? { 'TDS (₹)': r0(d.tds) } : {}),
          'Net (₹)':      r0(d.net),
          ...(hasGst ? {
            'GST (₹)':      r0(d.gst),
            'Transfer (₹)': r0(r2(d.net + d.gst)),
          } : {}),
        }));
      const wsM = XLSX.utils.json_to_sheet(mRows);
      styleHeader(wsM, hasGst
        ? (showTds
            ? [{wch:5},{wch:12},{wch:10},{wch:16},{wch:12},{wch:16},{wch:14},{wch:16}]
            : [{wch:5},{wch:12},{wch:10},{wch:16},{wch:16},{wch:14},{wch:16}])
        : (showTds
            ? [{wch:5},{wch:12},{wch:10},{wch:16},{wch:12},{wch:16}]
            : [{wch:5},{wch:12},{wch:10},{wch:16},{wch:16}]));
      XLSX.utils.book_append_sheet(wb, wsM, 'Monthly Summary');

      const custSuffix = annualCustomer ? `_${annualCustomer.customer.customer_name.replace(/\s+/g,'_')}` : '';
      const tdsSuffix  = showTds ? '' : '_ExclTDS';
      XLSX.writeFile(wb, `Annual_Report_${fy.label.replace(/ /g, '_')}${custSuffix}${tdsSuffix}.xlsx`);
      toast.success('Annual report downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate annual report'); }
    finally { setLoad('annual', false); }
  };

  // ── TDS REPORT ────────────────────────────────────────────────────────────
  const generateTDSReport = async () => {
    setLoad('tds', true);
    try {
      const range  = getQuarterRange(fy, tdsQuarter);
      const result = await paymentService.getPaymentHistory({
        startDate: range.start, endDate: range.end, limit: 5000,
      });
      let raw = result.data.payments || [];
      raw = applyCustomerFilter(raw, tdsCustomer);

      const grp      = applyTdsMode(groupPayments(raw, { tdsOnly: true }), tdsTdsMode);
      const showTds  = tdsTdsMode === 'include';
      const eligible = grp.filter((g) => showTds ? g._tds > 0 : true);
      if (!eligible.length) {
        toast.warning(tdsCustomer
          ? `No TDS data for "${tdsCustomer.customer.customer_name}" in ${tdsQuarter}`
          : 'No TDS data for this quarter');
        return;
      }

      const hasGst    = eligible.some((g) => g._gstTotal > 0);
      const splitCols = buildSplitColDefs(eligible);

      const dRows = eligible.map((g, i) => ({
        'S.No':            i + 1,
        'Payment Month':   g.payment_month || '',
        'Customer Name':   g.customer_name || '',
        'PAN Number':      g.pan_number    || '',
        'Bank Account No': g.bank_account_number || '',
        'Unit No':         g.unit_no       || '',
        'NRI':             (g.nri_status || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
        'Inst Count':      g._count,
        'Gross Rent (₹)':  r0(g._gross),
        ...(showTds ? {
          'TDS Rate (%)':   parseFloat(g.tds_rate) || 10,
          'TDS Amount (₹)': r0(g._tds),
        } : {}),
        'Net Rent (₹)':    r0(g._net),
        ...(hasGst ? {
          'GST No':            g.gst_no || '-',
          'CGST Amt (₹)':      r0(g._cgstAmt),
          'SGST Amt (₹)':      r0(g._sgstAmt),
          'Total GST (₹)':     r0(g._gstTotal),
          'Net Transfer (₹)':  r0(r2(g._net + g._gstTotal)),
        } : {}),
        ...splitFields(g, splitCols),
        ...splitSumField(g, splitCols),
      }));

      const tG   = r0(eligible.reduce((s, g) => r2(s + g._gross),    0));
      const tT   = r0(eligible.reduce((s, g) => r2(s + g._tds),      0));
      const tN   = r0(eligible.reduce((s, g) => r2(s + g._net),      0));
      const tGst = r0(eligible.reduce((s, g) => r2(s + g._gstTotal), 0));

      dRows.push({
        'S.No': '', 'Payment Month': '', 'Customer Name': 'TOTAL', 'PAN Number': '',
        'Bank Account No': '', 'Unit No': '', 'NRI': '',
        'Inst Count': eligible.length,
        'Gross Rent (₹)': tG,
        ...(showTds ? { 'TDS Rate (%)': '', 'TDS Amount (₹)': tT } : {}),
        'Net Rent (₹)': tN,
        ...(hasGst ? {
          'GST No': '', 'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
          'Total GST (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)),
        } : {}),
        ...splitTotalsFields(eligible, splitCols),
        ...splitSumTotalField(eligible, splitCols),
      });

      const wb  = XLSX.utils.book_new();
      const wsD = XLSX.utils.json_to_sheet(dRows);

      const detailBase = hasGst
        ? (showTds
            ? [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:10},{wch:5},{wch:6},{wch:14},{wch:10},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}]
            : [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:10},{wch:5},{wch:6},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}])
        : (showTds
            ? [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:10},{wch:5},{wch:6},{wch:14},{wch:10},{wch:14},{wch:14}]
            : [{wch:5},{wch:14},{wch:28},{wch:13},{wch:20},{wch:10},{wch:5},{wch:6},{wch:14},{wch:14}]);

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
            bank: g.bank_account_number,
            unitNo: g.unit_no,
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
        custMap[k].gross  = r2(custMap[k].gross  + g._gross);
        custMap[k].tds    = r2(custMap[k].tds    + g._tds);
        custMap[k].net    = r2(custMap[k].net    + g._net);
        custMap[k].cgst   = r2(custMap[k].cgst   + g._cgstAmt);
        custMap[k].sgst   = r2(custMap[k].sgst   + g._sgstAmt);
        custMap[k].gst    = r2(custMap[k].gst    + g._gstTotal);
        custMap[k].months++;
      });

      const custArr       = Object.values(custMap);
      const custSplitCols = buildSplitColDefs(
        custArr.map((c) => ({ _splitBreakdown: c.splitBreakdown }))
      );

      const cRows = custArr.map((c, i) => ({
        'S.No':             i + 1,
        'Customer Name':    c.name,
        'PAN Number':       c.pan  || '',
        'Bank Account No':  c.bank || '',
        'Unit No':          c.unitNo || '',
        'Months':           c.months,
        'Total Gross (₹)':  r0(c.gross),
        ...(showTds ? { 'Total TDS (₹)': r0(c.tds) } : {}),
        'Total Net (₹)':    r0(c.net),
        ...(hasGst ? {
          'GST No':              c.gstNo || '-',
          'CGST Amt (₹)':        r0(c.cgst),
          'SGST Amt (₹)':        r0(c.sgst),
          'Total GST (₹)':       r0(c.gst),
          'Total Transfer (₹)':  r0(r2(c.net + c.gst)),
        } : {}),
        ...splitFields({ _splitBreakdown: c.splitBreakdown }, custSplitCols),
        ...splitSumField({ _splitBreakdown: c.splitBreakdown }, custSplitCols),
      }));

      const custBase = hasGst
        ? (showTds
            ? [{wch:5},{wch:28},{wch:13},{wch:20},{wch:10},{wch:8},{wch:14},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}]
            : [{wch:5},{wch:28},{wch:13},{wch:20},{wch:10},{wch:8},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14}])
        : (showTds
            ? [{wch:5},{wch:28},{wch:13},{wch:20},{wch:10},{wch:8},{wch:14},{wch:14},{wch:14}]
            : [{wch:5},{wch:28},{wch:13},{wch:20},{wch:10},{wch:8},{wch:14},{wch:14}]);

      appendSplitWidths(custBase, custSplitCols);
      const wsC = XLSX.utils.json_to_sheet(cRows);
      styleHeader(wsC, custBase);
      XLSX.utils.book_append_sheet(wb, wsC, 'Customer Summary');

      const custSuffix = tdsCustomer ? `_${tdsCustomer.customer.customer_name.replace(/\s+/g,'_')}` : '';
      const tdsSuffix  = showTds ? '' : '_ExclTDS';
      XLSX.writeFile(wb, `TDS_Report_${tdsQuarter}_${fy.label.replace(/ /g, '_')}${custSuffix}${tdsSuffix}.xlsx`);
      toast.success('TDS report downloaded!');
    } catch (err) { console.error(err); toast.error('Failed to generate TDS report'); }
    finally { setLoad('tds', false); }
  };

  // ── CUSTOMER STATEMENT ────────────────────────────────────────────────────
  const generateCustomerStatement = async () => {
    if (!stmtCustomer) { toast.warning('Please select a customer'); return; }
    setLoad('customer', true);
    try {
      const cust = stmtCustomer.customer;

      const result = await paymentService.getPaymentHistory({
        customerId: cust.customer_id || cust.id,
        limit: 1000,
      });
      let raw = result.data.payments || [];

      if (!raw.length && cust.customer_name) {
        const allResult = await paymentService.getPaymentHistory({ limit: 5000 });
        raw = (allResult.data.payments || []).filter((p) =>
          (p.customer_name || '').toLowerCase() === (cust.customer_name || '').toLowerCase()
        );
      }

      const wb      = XLSX.utils.book_new();
      const showTds = stmtTdsMode === 'include';

      if (raw.length) {
        const grp       = applyTdsMode(groupPayments(raw), stmtTdsMode);
        const hasGst    = grp.some((g) => g._gstTotal > 0);
        const splitCols = buildSplitColDefs(grp);

        const rows = grp.map((g, i) => ({
          'S.No':            i + 1,
          'Payment Month':   g.payment_month || '',
          'Payment Date':    g.payment_date ? formatDate(g.payment_date) : '',
          'Period / Type':   g.payment_period || g.agreement_type || '',
          'Unit No':         g.unit_no        || '',
          'Inst Count':      g._count,
          'Base Rent (₹)':   r0(g.base_rent),
          'Escalation (%)':  parseFloat(g.escalation_rate) || 0,
          'Gross Rent (₹)':  r0(g._gross),
          ...(showTds ? { 'TDS (₹)': r0(g._tds) } : {}),
          'Net Rent (₹)':    r0(g._net),
          ...(hasGst ? {
            'CGST Amt (₹)':      r0(g._cgstAmt),
            'SGST Amt (₹)':      r0(g._sgstAmt),
            'Total GST (₹)':     r0(g._gstTotal),
            'Net Transfer (₹)':  r0(r2(g._net + g._gstTotal)),
          } : {}),
          ...splitFields(g, splitCols),
          ...splitSumField(g, splitCols),
          'Status': g.status || '',
        }));

        const tG   = r0(grp.reduce((s, g) => r2(s + g._gross),    0));
        const tT   = r0(grp.reduce((s, g) => r2(s + g._tds),      0));
        const tN   = r0(grp.reduce((s, g) => r2(s + g._net),      0));
        const tGst = r0(grp.reduce((s, g) => r2(s + g._gstTotal), 0));

        rows.push({
          'S.No': '', 'Payment Month': '', 'Payment Date': '', 'Period / Type': 'TOTAL',
          'Unit No': '',
          'Inst Count': grp.length, 'Base Rent (₹)': '', 'Escalation (%)': '',
          'Gross Rent (₹)': tG,
          ...(showTds ? { 'TDS (₹)': tT } : {}),
          'Net Rent (₹)': tN,
          ...(hasGst ? {
            'CGST Amt (₹)': '', 'SGST Amt (₹)': '',
            'Total GST (₹)': tGst, 'Net Transfer (₹)': r0(r2(tN + tGst)),
          } : {}),
          ...splitTotalsFields(grp, splitCols),
          ...splitSumTotalField(grp, splitCols),
          'Status': '',
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const baseCols = hasGst
          ? (showTds
              ? [{wch:5},{wch:14},{wch:14},{wch:26},{wch:10},{wch:6},{wch:14},{wch:12},{wch:14},{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}]
              : [{wch:5},{wch:14},{wch:14},{wch:26},{wch:10},{wch:6},{wch:14},{wch:12},{wch:14},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}])
          : (showTds
              ? [{wch:5},{wch:14},{wch:14},{wch:26},{wch:10},{wch:6},{wch:14},{wch:12},{wch:14},{wch:12},{wch:14},{wch:10}]
              : [{wch:5},{wch:14},{wch:14},{wch:26},{wch:10},{wch:6},{wch:14},{wch:12},{wch:14},{wch:14},{wch:10}]);

        styleHeader(ws, injectSplitWidths(baseCols, splitCols, 1));
        styleTotalsRow(ws, rows.length, 'E0F2FE');
        XLSX.utils.book_append_sheet(wb, ws, 'Statement');
      } else {
        const wsEmpty = XLSX.utils.aoa_to_sheet([
          ['No payment records found for this customer'],
          ['Customer:', cust.customer_name],
          ['Note:', 'No payments have been generated yet for this customer.'],
        ]);
        wsEmpty['!cols'] = [{ wch: 30 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsEmpty, 'Statement');
        toast.info(`No payments found for "${cust.customer_name}". Downloading customer info only.`);
      }

      // Customer Info sheet — always included
      const infoWs = XLSX.utils.aoa_to_sheet([
        ['Customer Payment Statement'], [''],
        ['Customer Name',   cust.customer_name  || ''],
        ['Customer ID',     cust.customer_ref || cust.customer_id || ''],
        ['PAN Number',      cust.pan_number     || ''],
        ['Unit No',         cust.unit_no        || ''],
        ['Floor / Unit',    `F${cust.floor_no || '?'} · U${cust.unit_no || '?'}`],
        ['Agreement',       cust.agreement_type || ''],
        ['Status',          cust.status         || ''],
        ['Bank A/C No',     cust.bank_account_number || ''],
        ['IFSC Code',       cust.ifsc_code      || ''],
        ['TDS Mode',        showTds ? 'Including TDS' : 'Excluding TDS'],
        ['Generated On',    new Date().toLocaleString()], [''],
        ['Total Payments (grouped)', raw.length > 0
          ? groupPayments(raw).length
          : 'No payments yet'],
      ]);
      infoWs['!cols'] = [{ wch: 24 }, { wch: 36 }];
      XLSX.utils.book_append_sheet(wb, infoWs, 'Customer Info');

      const tdsSuffix = showTds ? '' : '_ExclTDS';
      XLSX.writeFile(wb, `Statement_${(cust.customer_name || 'Customer').replace(/\s+/g, '_')}${tdsSuffix}.xlsx`);
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
            <i className={`bi ${icon} fs-4`} style={{ color: accentColor }} />
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
            ? <><span className="spinner-border spinner-border-sm me-2" />Generating…</>
            : <><i className="bi bi-file-earmark-excel me-2" />Download Excel</>}
        </button>
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid">
      <div className="mb-4">
        <h4 className="fw-bold mb-1">
          <i className="bi bi-bar-chart-line text-primary me-2" />Reports
        </h4>
        <p className="text-muted small mb-0">
          Generate Excel reports · All amounts in whole rupees · Search any customer by name, unit, floor or PAN
        </p>
      </div>

      <div className="row g-4">

        {/* ── Monthly ── */}
        <div className="col-md-6">
          <ReportCard
            icon="bi-calendar-month" title="Monthly Report"
            description="Combined payment records for a selected month"
            badge={monthlyMonth} badgeColor="primary" accentColor="#2563EB"
            onGenerate={generateMonthlyReport} loadKey="monthly"
          >
            <div className="row g-2 mb-2">
              <div className="col-7">
                <label className="form-label small fw-semibold mb-1">Month</label>
                <input type="month" className="form-control form-control-sm"
                  value={monthlyMonth} onChange={(e) => setMonthlyMonth(e.target.value)} />
              </div>
              <div className="col-5">
                <label className="form-label small fw-semibold mb-1">Agreement</label>
                <select className="form-select form-select-sm" value={monthlyAgreement}
                  onChange={(e) => setMonthlyAgreement(e.target.value)}>
                  <option value="">All</option>
                  <option value="Construction">Construction</option>
                  <option value="9-Year">9-Year</option>
                </select>
              </div>
            </div>
            <TdsModeDropdown value={monthlyTdsMode} onChange={setMonthlyTdsMode} accentColor="#2563EB" />
            <CustomerFilter value={monthlyCustomer} onChange={setMonthlyCustomer} />
            <div className="p-2 rounded-2" style={{ background: '#EFF6FF', fontSize: '0.78rem' }}>
              <strong>Columns:</strong> Gross · {monthlyTdsMode === 'include' ? 'TDS · ' : ''}Net · Split 1…N · Total Split · Status
              &nbsp;|&nbsp;<strong>Amounts:</strong> Whole ₹
            </div>
          </ReportCard>
        </div>

        {/* ── Annual ── */}
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
            <TdsModeDropdown value={annualTdsMode} onChange={setAnnualTdsMode} accentColor="#16A34A" />
            <CustomerFilter value={annualCustomer} onChange={setAnnualCustomer} />
            <div className="p-2 rounded-2" style={{ background: '#F0FDF4', fontSize: '0.78rem' }}>
              <strong>Sheets:</strong> All Payments + Monthly Summary · Split columns + Total Split (₹)
            </div>
          </ReportCard>
        </div>

        {/* ── TDS ── */}
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
            <TdsModeDropdown value={tdsTdsMode} onChange={setTdsTdsMode} accentColor="#DC2626" />
            <CustomerFilter value={tdsCustomer} onChange={setTdsCustomer} />
            <div className="p-2 rounded-2" style={{ background: '#FEF2F2', fontSize: '0.78rem' }}>
              <strong>Sheets:</strong> Detail + Customer Summary · Split columns + Total Split (₹)
            </div>
          </ReportCard>
        </div>

        {/* ── Customer Statement ── */}
        <div className="col-md-6">
          <ReportCard
            icon="bi-person-lines-fill" title="Customer Statement"
            description="Complete payment history for a customer — works even without payments"
            accentColor="#7C3AED" onGenerate={generateCustomerStatement} loadKey="customer"
          >
            <label className="form-label small fw-semibold mb-1">
              Select Customer <span className="text-danger">*</span>
            </label>
            <Select
              options={customerOptions}
              value={stmtCustomer}
              onChange={setStmtCustomer}
              filterOption={filterOption}
              styles={selectStyles}
              isClearable
              isSearchable
              isLoading={customersLoading}
              placeholder={
                <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                  <i className="bi bi-search me-1" />Search by name, unit, floor, PAN…
                </span>
              }
              noOptionsMessage={({ inputValue }) =>
                inputValue ? `No customer found for "${inputValue}"` : 'No customers'
              }
            />
            {stmtCustomer && (
              <div className="mt-2 mb-2 p-2 rounded-2 d-flex gap-2 align-items-center"
                style={{ background: '#F5F3FF', fontSize: '0.78rem' }}>
                <i className="bi bi-person-check-fill" style={{ color: '#7C3AED' }} />
                <div>
                  <strong>{stmtCustomer.customer.customer_name}</strong>
                  <span className="text-muted ms-2">
                    {stmtCustomer.customer.customer_ref || stmtCustomer.customer.customer_id}
                    &nbsp;·&nbsp;
                    F{stmtCustomer.customer.floor_no || '?'} U{stmtCustomer.customer.unit_no || '?'}
                    &nbsp;·&nbsp;{stmtCustomer.customer.agreement_type}
                  </span>
                </div>
              </div>
            )}
            <TdsModeDropdown value={stmtTdsMode} onChange={setStmtTdsMode} accentColor="#7C3AED" />
            <div className="mt-2 p-2 rounded-2" style={{ background: '#F5F3FF', fontSize: '0.78rem' }}>
              <strong>Sheets:</strong> Statement + Customer Info ·
              Shows customer info even if no payment was generated
            </div>
          </ReportCard>
        </div>
      </div>

      {/* Info footer */}
      <div className="card border-0 shadow-sm mt-4">
        <div className="card-body py-3">
          <div className="d-flex align-items-start gap-3 flex-wrap">
            <small className="text-muted fw-semibold flex-shrink-0">
              <i className="bi bi-info-circle me-1" />All reports include:
            </small>
            <div className="d-flex gap-2 flex-wrap">
              {[
                'Gross Rent (₹)', 'TDS (₹) — toggle per report', 'Net Rent (₹)',
                'GST (if applicable)', 'Net Transfer (₹)',
                'Unit No',
                'Split 1 – Name / Bank / A/C / IFSC / ₹',
                'Split 2 … N (auto-added)',
                'Total Split (₹)  ← "-" if no splits',
                'Amounts in whole ₹ — no decimals',
                'Customer search in all reports',
                'File name includes _ExclTDS suffix when TDS excluded',
              ].map((item) => (
                <span key={item} className="badge bg-light text-dark border" style={{ fontSize: '0.72rem' }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;