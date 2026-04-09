import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { formatCurrency } from '../../Utils/helpers';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import '../../Styles/MonthlySummary.css';

// ─── Rounding helper — always 2 decimal places (paise precision) ─────────────
const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

const getQuarterFromMonth = (yearMonth) => {
  const [year, month] = yearMonth.split('-').map(Number);
  const quarter = month >= 4 && month <= 6 ? 'Q1'
    : month >= 7 && month <= 9  ? 'Q2'
    : month >= 10               ? 'Q3'
    : 'Q4';
  const fyYear = month >= 4
    ? `FY${String(year + 1).slice(-2)}`
    : `FY${String(year).slice(-2)}`;
  return `${quarter} ${fyYear}`;
};

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

// ─── GST calculation: uses backend fields if present, else derive on net_payout ─
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

// ─── Group raw payments into one combined row per customer+month ───────────────
const groupPayments = (payments) => {
  const map = {};
  payments.forEach((p) => {
    const key = `${p.customer_id || p.customer_code}_${p.payment_month}`;
    const gst = calcGST(p);
    if (!map[key]) {
      map[key] = {
        ...p,
        _gross:    r2(p.gross_amount),
        _tds:      r2(p.tds_amount),
        _net:      r2(p.net_payout),
        _cgstAmt:  gst.cgstAmt,
        _sgstAmt:  gst.sgstAmt,
        _gstTotal: gst.gstTotal,
        _count:    1,
      };
    } else {
      const g = map[key];
      g._gross    = r2(g._gross    + r2(p.gross_amount));
      g._tds      = r2(g._tds      + r2(p.tds_amount));
      g._net      = r2(g._net      + r2(p.net_payout));
      g._cgstAmt  = r2(g._cgstAmt  + gst.cgstAmt);
      g._sgstAmt  = r2(g._sgstAmt  + gst.sgstAmt);
      g._gstTotal = r2(g._gstTotal + gst.gstTotal);
      g._count++;
    }
  });
  return Object.values(map);
};

// ─── Component ────────────────────────────────────────────────────────────────
const MonthlySummary = () => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [downloading,   setDownloading]   = useState(false);
  const [showPreview,   setShowPreview]   = useState(false);
  const [statsLoading,  setStatsLoading]  = useState(false);
  const [monthData,     setMonthData]     = useState([]);
  const [stats, setStats] = useState({
    quarter: getQuarterFromMonth(getCurrentMonth()),
    totalTDS: 0, totalGross: 0, totalNet: 0, totalGST: 0, totalCustomers: 0,
  });

  const fetchMonthData = useCallback(async (month) => {
    try {
      setStatsLoading(true);
      const result = await paymentService.getPaymentHistory({
        month, status: 'Completed', limit: 1000,
      });
      const payments = result.data.payments || [];
      setMonthData(payments);

      // Compute totals over grouped rows (avoid double-counting installments)
      const grouped = groupPayments(payments);
      setStats({
        quarter:        getQuarterFromMonth(month),
        totalGross:     grouped.reduce((s, g) => s + g._gross,    0),
        totalTDS:       grouped.reduce((s, g) => s + g._tds,      0),
        totalNet:       grouped.reduce((s, g) => s + g._net,      0),
        totalGST:       grouped.reduce((s, g) => s + g._gstTotal, 0),
        totalCustomers: grouped.length,
      });
    } catch {
      toast.error('Failed to load data for selected month');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchMonthData(selectedMonth); }, [selectedMonth, fetchMonthData]);

  // Grouped rows for preview table
  const grouped = useMemo(() => groupPayments(monthData), [monthData]);
  const hasAnyGst = grouped.some((g) => g._gstTotal > 0 || g._cgstAmt > 0);

  const previewTotals = useMemo(() => ({
    gross:    grouped.reduce((s, g) => s + g._gross,    0),
    tds:      grouped.reduce((s, g) => s + g._tds,      0),
    net:      grouped.reduce((s, g) => s + g._net,      0),
    gst:      grouped.reduce((s, g) => s + g._gstTotal, 0),
    transfer: grouped.reduce((s, g) => s + r2(g._net + g._gstTotal), 0),
  }), [grouped]);

  // ── Excel download ─────────────────────────────────────────────────────────
  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);

      const raw = monthData.length
        ? monthData
        : (await paymentService.getPaymentHistory({ month: selectedMonth, status: 'Completed', limit: 1000 })).data.payments || [];

      if (!raw.length) { toast.warning(`No completed payments found for ${selectedMonth}`); return; }

      const grp = groupPayments(raw);
      const hasGst = grp.some((g) => g._gstTotal > 0 || g._cgstAmt > 0);

      const rows = grp.map((g, i) => {
        const netTransfer = r2(g._net + g._gstTotal);
        const base = {
          'S.No':            i + 1,
          'Customer Name':   g.customer_name || '',
          'PAN Number':      g.pan_number    || '',
          'Bank Account No': g.bank_account_number || '',
          'Property Name':   g.property_name || '',
          'Agreement Type':  g.payment_period || g.agreement_type || '',
          'Payment Month':   g.payment_month || '',
          'Floor No':        g.floor_no || '',
          'Inst Count':      g._count,
          'Gross Rent (₹)':  g._gross,
          'TDS (₹)':         g._tds,
          'Net Rent (₹)':    g._net,
          'TDS Applicable':  g._tds > 0 ? 'Yes' : 'No',
        };
        if (hasGst) {
          base['GST No']          = g.gst_no || '-';
          base['CGST Amt (₹)']    = g._cgstAmt;
          base['SGST Amt (₹)']    = g._sgstAmt;
          base['Total GST (₹)']   = g._gstTotal;
          base['Net Transfer (₹)']= netTransfer;
        }
        return base;
      });

      // Total row
      const totalTransfer = r2(stats.totalNet + stats.totalGST);
      const totalRow = {
        'S.No': '', 'Customer Name': 'TOTAL', 'PAN Number': '', 'Bank Account No': '',
        'Property Name': '', 'Agreement Type': '', 'Payment Month': '', 'Floor No': '',
        'Inst Count': '',
        'Gross Rent (₹)':  stats.totalGross,
        'TDS (₹)':         stats.totalTDS,
        'Net Rent (₹)':    stats.totalNet,
        'TDS Applicable':  '',
      };
      if (hasGst) {
        totalRow['GST No']          = '';
        totalRow['CGST Amt (₹)']    = grouped.reduce((s, g) => s + g._cgstAmt, 0);
        totalRow['SGST Amt (₹)']    = grouped.reduce((s, g) => s + g._sgstAmt, 0);
        totalRow['Total GST (₹)']   = stats.totalGST;
        totalRow['Net Transfer (₹)']= totalTransfer;
      }
      rows.push(totalRow);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      ws['!cols'] = hasGst
        ? [{ wch:5 },{wch:28},{wch:14},{wch:22},{wch:18},{wch:16},{wch:14},{wch:9},{wch:6},{wch:16},{wch:12},{wch:14},{wch:10},{wch:16},{wch:14},{wch:14},{wch:14},{wch:16}]
        : [{ wch:5 },{wch:28},{wch:14},{wch:22},{wch:18},{wch:16},{wch:14},{wch:9},{wch:6},{wch:16},{wch:12},{wch:14},{wch:10}];

      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1E3A8A' } },
          alignment: { horizontal: 'center', wrapText: true },
          border: { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} },
        };
      }
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: rows.length, c });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'FFF2CC' } },
          border: { top:{style:'medium'}, bottom:{style:'medium'}, left:{style:'thin'}, right:{style:'thin'} },
        };
      }

      XLSX.utils.book_append_sheet(wb, ws, `All Payments ${selectedMonth}`);

      // TDS-only sheet (grouped — only rows with combined TDS > 0)
      const tdsRows = grp.filter((g) => g._tds > 0);
      if (tdsRows.length) {
        const tdsSheet = XLSX.utils.json_to_sheet(
          tdsRows.map((g, i) => ({
            'S.No': i + 1,
            'Customer Name':   g.customer_name || '',
            'PAN Number':      g.pan_number    || '',
            'Bank Account No': g.bank_account_number || '',
            'Property Name':   g.property_name || '',
            'Payment Month':   g.payment_month || '',
            'Gross Rent (₹)':  g._gross,
            'TDS (₹)':         g._tds,
            'Net Rent (₹)':    g._net,
            ...(hasGst ? {
              'CGST Amt (₹)': g._cgstAmt,
              'SGST Amt (₹)': g._sgstAmt,
              'GST Total (₹)': g._gstTotal,
              'Net Transfer (₹)': r2(g._net + g._gstTotal),
            } : {}),
          }))
        );
        tdsSheet['!cols'] = hasGst
          ? [{wch:5},{wch:28},{wch:14},{wch:22},{wch:18},{wch:14},{wch:16},{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:16}]
          : [{wch:5},{wch:28},{wch:14},{wch:22},{wch:18},{wch:14},{wch:16},{wch:12},{wch:14}];
        XLSX.utils.book_append_sheet(wb, tdsSheet, 'TDS Only');
      }

      // Overview sheet
      const tdsCustomers   = grp.filter((g) => g._tds > 0).length;
      const wsSummary = XLSX.utils.aoa_to_sheet([
        ['Monthly Payment Summary Report'], [''],
        ['Period',            selectedMonth],
        ['Generated On',      new Date().toLocaleString()],
        ['Quarter',           stats.quarter],  [''],
        ['Total Customers (grouped)',  stats.totalCustomers],
        ['TDS Applicable',             tdsCustomers],
        ['TDS Not Applicable',         stats.totalCustomers - tdsCustomers], [''],
        ['Total Gross Rent',  stats.totalGross],
        ['Total TDS',         stats.totalTDS],
        ['Total Net Rent',    stats.totalNet],
        ...(hasGst ? [
          ['Total GST',       stats.totalGST],
          ['Total Payable',   r2(stats.totalNet + stats.totalGST)],
        ] : []),
      ]);
      wsSummary['!cols'] = [{ wch: 26 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Overview');

      XLSX.writeFile(wb, `Monthly_Summary_${selectedMonth}.xlsx`);
      toast.success(`Downloaded: Monthly_Summary_${selectedMonth}.xlsx`);
    } catch (err) {
      toast.error('Failed to generate Excel');
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const CARDS = [
    { variant: 'primary', icon: 'bi-calendar3',    value: stats.quarter,                    label: 'Current Quarter'    },
    { variant: 'success', icon: 'bi-percent',       value: formatCurrency(stats.totalTDS),   label: 'Total TDS Deducted' },
    { variant: 'info',    icon: 'bi-cash-stack',    value: formatCurrency(stats.totalGross), label: 'Gross Amount'       },
    { variant: 'warning', icon: 'bi-wallet2',       value: formatCurrency(stats.totalNet),   label: 'Net Rent'           },
    { variant: 'primary', icon: 'bi-receipt',       value: formatCurrency(stats.totalGST),  label: 'Total GST'          },
    { variant: 'dark',    icon: 'bi-people-fill',   value: stats.totalCustomers,             label: 'Total Customers'    },
  ];

  return (
    <div className="ms-container">
      {/* Header */}
      <div className="ms-header">
        <h4 className="ms-title">
          <i className="bi bi-graph-up-arrow me-2" style={{ color: '#6366f1' }}></i>
          Monthly Payment Summary
        </h4>
        <div className="ms-controls">
          <div className="d-flex align-items-center gap-1">
            <label className="ms-month-label">Month</label>
            <input type="month" className="form-control form-control-sm ms-month-input"
              value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
          </div>
          <button className={`btn btn-sm ms-btn-preview ${showPreview ? 'active-preview' : ''}`}
            onClick={() => setShowPreview((p) => !p)}>
            <i className={`bi ${showPreview ? 'bi-eye-slash' : 'bi-eye'} me-1`}></i>
            {showPreview ? 'Hide' : 'Preview'}
          </button>
          <button className="btn btn-sm ms-btn-download"
            onClick={handleDownloadExcel} disabled={downloading || statsLoading}>
            {downloading
              ? <><span className="spinner-border spinner-border-sm me-1"></span>Generating...</>
              : <><i className="bi bi-file-earmark-excel me-1"></i>Download Excel</>}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="ms-grid">
        {CARDS.map((card) => (
          <div key={card.label} className={`ms-card ${statsLoading ? 'ms-card--loading' : `ms-card--${card.variant}`}`}>
            {!statsLoading && (
              <>
                <i className={`bi ${card.icon} ms-card-icon`}></i>
                <div className="ms-card-value">{card.value}</div>
                <div className="ms-card-label">{card.label}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Preview Table */}
      {showPreview && (
        <div className="card ms-preview-card">
          <div className="ms-preview-header">
            <h6 className="ms-preview-header-title">
              <i className="bi bi-table"></i>
              All Payments — {selectedMonth}&nbsp;
              <span style={{ color: '#6366f1', fontSize: '0.78rem' }}>({stats.quarter})</span>
            </h6>
            {!statsLoading && grouped.length > 0 && (
              <span className="ms-badge">{grouped.length} customer{grouped.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="card-body p-0">
            {statsLoading ? (
              <div className="ms-loading">
                <div className="spinner-border spinner-border-sm text-primary"></div>
                <p>Loading data...</p>
              </div>
            ) : grouped.length === 0 ? (
              <div className="ms-empty">
                <i className="bi bi-inbox"></i>
                <p>No completed payments for {selectedMonth}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table ms-table" style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Customer Name</th>
                      <th>PAN</th>
                      <th>Bank Account</th>
                      <th>Agreement</th>
                      <th className="text-center">Inst</th>
                      <th className="text-end">Gross (₹)</th>
                      <th className="text-end">TDS (₹)</th>
                      <th className="text-end">Net Rent (₹)</th>
                      {hasAnyGst && <th className="text-end">GST (₹)</th>}
                      <th className="text-end fw-bold">
                        {hasAnyGst ? 'Net Transfer (₹)' : 'Net Payable (₹)'}
                      </th>
                      <th className="text-center">TDS?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g, i) => {
                      const netTransfer = r2(g._net + g._gstTotal);
                      return (
                        <tr key={`${g.customer_id || g.customer_code}_${g.payment_month}`}>
                          <td className="ms-td-serial">{i + 1}</td>
                          <td className="ms-td-name">{g.customer_name}</td>
                          <td><code>{g.pan_number || '—'}</code></td>
                          <td><code style={{ fontSize: '0.72rem' }}>{g.bank_account_number || '—'}</code></td>
                          <td>
                            <span className={`badge ${g.payment_period === 'Construction' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                              {g.payment_period || g.agreement_type}
                            </span>
                          </td>
                          <td className="text-center">
                            {g._count > 1
                              ? <span className="badge" style={{ background: '#6366f1', color: '#fff' }}>{g._count}</span>
                              : <span className="text-muted small">1</span>}
                          </td>
                          <td className="text-end ms-td-amount">{formatCurrency(g._gross)}</td>
                          <td className="text-end ms-td-tds">{formatCurrency(g._tds)}</td>
                          <td className="text-end">{formatCurrency(g._net)}</td>
                          {hasAnyGst && (
                            <td className="text-end text-info small">
                              {g._gstTotal > 0 ? formatCurrency(g._gstTotal) : <span className="text-muted">—</span>}
                            </td>
                          )}
                          <td className="text-end ms-td-net fw-bold">{formatCurrency(netTransfer)}</td>
                          <td className="text-center">
                            {g._tds > 0
                              ? <span className="badge bg-danger">TDS</span>
                              : <span className="badge bg-light text-muted border">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="text-end fw-bold">Total</td>
                      <td className="text-end ms-td-amount fw-bold">{formatCurrency(previewTotals.gross)}</td>
                      <td className="text-end ms-td-tds fw-bold">{formatCurrency(previewTotals.tds)}</td>
                      <td className="text-end fw-bold">{formatCurrency(previewTotals.net)}</td>
                      {hasAnyGst && <td className="text-end text-info fw-bold">{formatCurrency(previewTotals.gst)}</td>}
                      <td className="text-end ms-td-net fw-bold">{formatCurrency(previewTotals.transfer)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlySummary;