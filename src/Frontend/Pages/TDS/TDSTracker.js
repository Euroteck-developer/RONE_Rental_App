import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import tdsService from '../../Services/tds.service';
import { formatCurrency, formatDate } from '../../Utils/helpers';
import '../../Styles/TdsTracker.css';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = {
  '01':'January','02':'February','03':'March','04':'April',
  '05':'May','06':'June','07':'July','08':'August',
  '09':'September','10':'October','11':'November','12':'December',
};
const fmtMonth = (ym) => { if (!ym) return ''; const [y, m] = ym.split('-'); return `${MONTH_NAMES[m] || m} ${y}`; };
const fmtInr   = (v)  => `Rs. ${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// GST computed from backend fields (cgst_amount, sgst_amount, total_payable already returned by getAllTDS)
// For grouped rows we re-compute by summing per-row GST amounts.
const isNRI = (status) => (status || '').toLowerCase() === 'yes';

const STATUS_BADGE = {
  Completed:          'bg-success',
  Processing:         'bg-primary',
  Pending:            'bg-warning text-dark',
  Failed:             'bg-danger',
  Order_Created:      'bg-info text-dark',
  Authorized:         'bg-info',
  Cancelled:          'bg-secondary',
  Refunded:           'bg-warning',
  Partially_Refunded: 'bg-warning text-dark',
};

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const TDSTracker = () => {
  const currentMonth = getCurrentMonth();

  const [tdsData, setTdsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [xlsLoad, setXlsLoad] = useState(false);
  const [filters, setFilters] = useState({
    month: currentMonth, customerId: '', status: '', startDate: '', endDate: '',
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTDSTracker = useCallback(async () => {
    try {
      setLoading(true);
      const result = await tdsService.getAllTDS(filters);
      const seen = new Set();
      const deduped = (result.data || []).filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      setTdsData(deduped);
    } catch (error) {
      toast.error('Failed to load TDS tracker data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchTDSSummary = useCallback(async () => {
    try {
      const result = await tdsService.getTDSSummary(filters);
      setSummary(result.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [filters]);

  useEffect(() => { fetchTDSTracker(); fetchTDSSummary(); }, [fetchTDSTracker, fetchTDSSummary]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  const handleClearFilters = () =>
    setFilters({ month: currentMonth, customerId: '', status: '', startDate: '', endDate: '' });

  // ── Group raw rows: one display row per (customer_db_id + payment_month) ────
  // Back-end returns per-installment rows; we merge them here so the same
  // customer appears only once per rent month, with combined amounts.
  const groups = useMemo(() => {
    const map = new Map();
    for (const row of tdsData) {
      // customer_db_id added to SELECT in updated getAllTDS
      const custId = row.customer_db_id || row.customer_id || row.customer_code;
      const key    = `${custId}_${row.payment_month}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          // use first row's date; earliest would require sorting first
          payment_date:   row.payment_date,
          payment_month:  row.payment_month,
          customer_db_id: custId,
          customer_name:  row.customer_name,
          customer_code:  row.customer_code,
          pan_number:     row.pan_number,
          nri_status:     row.nri_status,
          agreement_type: row.agreement_type,
          floor_no:       row.floor_no,
          unit_no:        row.unit_no,
          // GST config (same for all installments of this customer)
          gst_no: row.gst_no || null,
          cgst:   row.cgst   || 0,
          sgst:   row.sgst   || 0,
          tds_applicable: row.tds_applicable,
          statuses:      [],
          installments:  [],
          gross:         0,
          tds:           0,
          net:           0,
          cgst_amount:   0,
          sgst_amount:   0,
          gst_amount:    0,
          total_payable: 0,
        });
      }
      const g = map.get(key);
      g.statuses.push(row.status);
      g.installments.push({ no: row.installment_no, total: row.total_installments });
      g.gross         += parseFloat(row.gross_amount  || 0);
      g.tds           += parseFloat(row.tds_amount    || 0);
      g.net           += parseFloat(row.net_payout    || 0);
      // Sum per-row GST amounts returned by backend (avoids re-computing rates)
      g.cgst_amount   += parseFloat(row.cgst_amount   || 0);
      g.sgst_amount   += parseFloat(row.sgst_amount   || 0);
      g.gst_amount    += parseFloat(row.gst_amount    || 0);
      g.total_payable += parseFloat(row.total_payable || row.net_payout || 0);
      // Keep earliest date
      if (row.payment_date && row.payment_date < g.payment_date) g.payment_date = row.payment_date;
    }

    return Array.from(map.values()).map(g => {
      g.gross         = parseFloat(g.gross.toFixed(2));
      g.tds           = parseFloat(g.tds.toFixed(2));
      g.net           = parseFloat(g.net.toFixed(2));
      g.cgst_amount   = parseFloat(g.cgst_amount.toFixed(2));
      g.sgst_amount   = parseFloat(g.sgst_amount.toFixed(2));
      g.gst_amount    = parseFloat(g.gst_amount.toFixed(2));
      g.total_payable = parseFloat(g.total_payable.toFixed(2));
      g.hasGst        = !!(g.gst_no && (parseFloat(g.cgst) > 0 || parseFloat(g.sgst) > 0));

      // Derive display status
      const uniq  = [...new Set(g.statuses)];
      g.status    = uniq.length === 1 ? uniq[0]
        : uniq.includes('Pending')    ? 'Pending'
        : uniq.includes('Processing') ? 'Processing'
        : uniq.includes('Completed')  ? 'Completed'
        : uniq[0];

      // Installment label
      const maxInst  = g.installments.reduce((m, i) => Math.max(m, i.total || 1), 1);
      const instNos  = g.installments.map(i => i.no).filter(Boolean).sort((a, b) => a - b);
      g.instLabel    = instNos.length > 0
        ? instNos.length === 1
          ? `Inst ${instNos[0]}/${maxInst}`
          : `Inst ${instNos[0]}–${instNos[instNos.length - 1]}/${maxInst}`
        : null;
      g.instCount    = g.installments.length;
      return g;
    });
  }, [tdsData]);

  const hasAnyGst = groups.some(g => g.hasGst);

  // ── Column totals (over groups, not raw rows) ─────────────────────────────
  const totals = {
    gross:   groups.reduce((s, g) => s + g.gross,         0),
    tds:     groups.reduce((s, g) => s + g.tds,           0),
    net:     groups.reduce((s, g) => s + g.net,           0),
    cgst:    groups.reduce((s, g) => s + g.cgst_amount,   0),
    sgst:    groups.reduce((s, g) => s + g.sgst_amount,   0),
    gst:     groups.reduce((s, g) => s + g.gst_amount,    0),
    payable: groups.reduce((s, g) => s + g.total_payable, 0),
  };

  // ── Excel export ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!groups.length) { toast.warning('No data to export'); return; }
    setXlsLoad(true);
    try {
      const wb = XLSX.utils.book_new();

      const rows = groups.map((g, i) => {
        const nri = isNRI(g.nri_status);
        const row = {
          'S.No':             i + 1,
          'Payment Date':     g.payment_date ? formatDate(g.payment_date) : '',
          'Rent Month':       fmtMonth(g.payment_month),
          'Customer Name':    g.customer_name || '',
          'Customer ID':      g.customer_code || '',
          'PAN Number':       g.pan_number    || '',
          'NRI Status':       nri ? 'NRI' : '',
          'Agreement Type':   g.agreement_type || '',
          'Floor No':         g.floor_no || '',
          'Unit No':          g.unit_no  || '',
          'Installments':     g.instLabel || '',
          'Gross Rent (Rs)':  g.gross,
          'TDS @ 10% (Rs)':   g.tds,
          'Net Payout (Rs)':  g.net,
          'Status':           g.status || '',
        };
        if (g.hasGst) {
          row['GST Number']     = g.gst_no || '';
          row['CGST %']         = parseFloat(g.cgst) || 0;
          row['SGST %']         = parseFloat(g.sgst) || 0;
          row['CGST Amt (Rs)']  = g.cgst_amount;
          row['SGST Amt (Rs)']  = g.sgst_amount;
          row['Total GST (Rs)'] = g.gst_amount;
          row['Net+GST (Rs)']   = g.total_payable;
        }
        return row;
      });

      // Grand total row
      const totalRow = {
        'S.No': '', 'Payment Date': '', 'Rent Month': '',
        'Customer Name': 'GRAND TOTAL', 'Customer ID': '',
        'PAN Number': '', 'NRI Status': '', 'Agreement Type': '',
        'Floor No': '', 'Unit No': '', 'Installments': '',
        'Gross Rent (Rs)': totals.gross,
        'TDS @ 10% (Rs)':  totals.tds,
        'Net Payout (Rs)': totals.net,
        'Status': '',
        ...(hasAnyGst ? {
          'GST Number': '', 'CGST %': '', 'SGST %': '',
          'CGST Amt (Rs)': totals.cgst, 'SGST Amt (Rs)': totals.sgst,
          'Total GST (Rs)': totals.gst, 'Net+GST (Rs)': totals.payable,
        } : {}),
      };
      rows.push(totalRow);

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        {wch:5},{wch:13},{wch:16},{wch:26},{wch:14},{wch:13},{wch:10},
        {wch:14},{wch:8},{wch:8},{wch:12},{wch:16},{wch:16},{wch:16},{wch:12},
        ...(hasAnyGst ? [{wch:18},{wch:8},{wch:8},{wch:14},{wch:14},{wch:14},{wch:16}] : []),
      ];

      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let c = 0; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
          fill:      { fgColor: { rgb: '1E3A8A' } },
          alignment: { horizontal: 'center', wrapText: true },
          border:    { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} },
        };
      }
      for (let c = 0; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: rows.length, c });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font:   { bold: true, sz: 10 },
          fill:   { fgColor: { rgb: 'FEF9C3' } },
          border: { top:{style:'medium'}, bottom:{style:'medium'}, left:{style:'thin'}, right:{style:'thin'} },
        };
      }
      XLSX.utils.book_append_sheet(wb, ws, `TDS ${filters.month || 'All'}`);

      // Summary sheet
      const nriCount = groups.filter(g => isNRI(g.nri_status)).length;
      const gstCount = groups.filter(g => g.hasGst).length;
      const wsSummary = XLSX.utils.aoa_to_sheet([
        ['TDS Tracker Export'], [''],
        ['Period',             filters.month ? fmtMonth(filters.month) : 'All Months'],
        ['Generated On',       new Date().toLocaleString('en-IN')], [''],
        ['Total Customers',    groups.length],
        ['Total Payments',     tdsData.length],
        ...(nriCount > 0 ? [['NRI Customers',  nriCount]] : []),
        ...(gstCount > 0 ? [['GST Registered', gstCount]] : []),
        [''],
        ['Total Gross Rent',   totals.gross],
        ['Total TDS',          totals.tds],
        ['Total Net',          totals.net],
        ...(hasAnyGst ? [
          ['Total CGST',       totals.cgst],
          ['Total SGST',       totals.sgst],
          ['Total GST',        totals.gst],
          ['Total Payable',    totals.payable],
        ] : []),
      ]);
      wsSummary['!cols'] = [{wch:22},{wch:20}];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      XLSX.writeFile(wb, `TDS_Tracker_${filters.month || 'All'}.xlsx`);
      toast.success('Excel exported!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel');
    } finally {
      setXlsLoad(false);
    }
  };

  // ── CSV export ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!groups.length) { toast.warning('No data to export'); return; }
    const headers = [
      'Payment Date','Rent Month','Customer Name','PAN','NRI','Agreement',
      'Floor','Unit','Installments','Gross Rent','TDS Amount','Net Payout',
      ...(hasAnyGst ? ['GST No','CGST %','SGST %','CGST Amt','SGST Amt','Total GST','Net+GST'] : []),
      'Status',
    ];
    const csvData = groups.map(g => [
      g.payment_date ? formatDate(g.payment_date) : '',
      fmtMonth(g.payment_month),
      g.customer_name,
      g.pan_number     || '',
      isNRI(g.nri_status) ? 'NRI' : '',
      g.agreement_type || '',
      g.floor_no       || '',
      g.unit_no        || '',
      g.instLabel      || '',
      g.gross, g.tds, g.net,
      ...(hasAnyGst ? [
        g.hasGst ? g.gst_no : '',
        g.hasGst ? parseFloat(g.cgst) : '',
        g.hasGst ? parseFloat(g.sgst) : '',
        g.hasGst ? g.cgst_amount  : '',
        g.hasGst ? g.sgst_amount  : '',
        g.hasGst ? g.gst_amount   : '',
        g.hasGst ? g.total_payable : g.net,
      ] : []),
      g.status,
    ]);
    const csv  = [headers.join(','), ...csvData.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `TDS_Tracker_${filters.month || 'all'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('CSV exported!');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid py-3">

      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-receipt me-2 text-primary" />TDS Tracker
          </h4>
          <p className="text-muted small mb-0">
            Showing TDS deductions for &nbsp;
            <span className="badge bg-primary">
              {filters.month ? fmtMonth(filters.month) : 'All Months'}
            </span>
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-success btn-sm" onClick={handleExportExcel} disabled={!groups.length || xlsLoad}>
            {xlsLoad
              ? <span className="spinner-border spinner-border-sm me-1" />
              : <i className="bi bi-file-earmark-excel me-1" />}
            Excel
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={handleExportCSV} disabled={!groups.length}>
            <i className="bi bi-filetype-csv me-1" />CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="row g-3 mb-4">
          {[
            { label: 'Total Customers',   value: summary.total_customers  || 0,                                                  icon: 'bi-people',         color: 'primary' },
            { label: 'Total Records',      value: summary.total_deductions || 0,                                                  icon: 'bi-receipt-cutoff', color: 'info'    },
            { label: 'Total TDS',          value: formatCurrency(summary.total_tds_deducted  || 0),                               icon: 'bi-percent',        color: 'danger'  },
            { label: 'Gross Amount',       value: formatCurrency(summary.total_gross_amount  || 0),                               icon: 'bi-cash-stack',     color: 'success' },
            { label: 'Net Amount',         value: formatCurrency(summary.total_net_amount    || 0),                               icon: 'bi-wallet2',        color: 'warning' },
            ...(parseFloat(summary.total_gst_amount || 0) > 0 ? [
              { label: 'Total GST',        value: formatCurrency(summary.total_gst_amount    || 0),                               icon: 'bi-tags',           color: 'info'    },
              { label: 'Total Payable',    value: formatCurrency(summary.total_payable       || 0),                               icon: 'bi-bank2',          color: 'success' },
            ] : []),
          ].map(card => (
            <div key={card.label} className="col-md-2 col-sm-4 col-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body d-flex align-items-center gap-2 p-3">
                  <div className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 38, height: 38, background: `var(--bs-${card.color}-bg, #f8f9fa)` }}>
                    <i className={`bi ${card.icon} text-${card.color}`} />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-muted small text-truncate">{card.label}</div>
                    <div className={`fw-bold text-${card.color} small`}>{card.value}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Month</label>
              <input type="month" className="form-control" name="month" value={filters.month} onChange={handleFilterChange} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Payment Status</label>
              <select className="form-select" name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Statuses</option>
                <option value="Completed">Completed</option>
                <option value="Processing">Processing</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">From Date</label>
              <input type="date" className="form-control" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">To Date</label>
              <input type="date" className="form-control" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button className="btn btn-outline-secondary w-100" onClick={handleClearFilters}>
                <i className="bi bi-x-circle me-1" />Reset
              </button>
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button className="btn btn-primary w-100" onClick={() => { fetchTDSTracker(); fetchTDSSummary(); }}>
                <i className="bi bi-search me-1" />Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TDS Table */}
      <div className="card shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
          <h6 className="mb-0 fw-semibold">
            <i className="bi bi-table me-2 text-primary" />
            TDS Deductions — {filters.month ? fmtMonth(filters.month) : 'All'}
          </h6>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary">{groups.length} customer(s)</span>
            {!loading && tdsData.length !== groups.length && (
              <span className="badge bg-secondary">{tdsData.length} payment rows combined</span>
            )}
          </div>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status" />
              <p className="text-muted mt-3 small">Loading TDS data...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }} />
              <p className="text-muted mt-3 mb-1">No TDS deductions found</p>
              <small className="text-muted">
                {filters.month ? `No payments with TDS for ${fmtMonth(filters.month)}` : 'Try adjusting your filters'}
              </small>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.85rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Payment Date</th>
                    <th>Rent Month</th>
                    <th>Customer</th>
                    <th>PAN</th>
                    <th>NRI</th>
                    <th>Agreement</th>
                    <th>Floor / Unit</th>
                    <th>Inst</th>
                    {hasAnyGst && <th>GST No</th>}
                    {hasAnyGst && <th className="text-center">CGST %</th>}
                    {hasAnyGst && <th className="text-center">SGST %</th>}
                    <th className="text-end">Gross Rent</th>
                    <th className="text-end">TDS (10%)</th>
                    <th className="text-end">Net Payout</th>
                    {hasAnyGst && <th className="text-end text-info">CGST Amt</th>}
                    {hasAnyGst && <th className="text-end text-info">SGST Amt</th>}
                    {/* Single final column — Net Payout + GST */}
                    <th className={`text-end ${hasAnyGst ? 'text-success' : ''}`}>
                      {hasAnyGst ? 'Net Transfer' : 'Net Total'}
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => {
                    const nri = isNRI(g.nri_status);
                    return (
                      <tr key={g.key}>
                        <td className="text-muted small">{i + 1}</td>
                        <td className="text-nowrap small">{formatDate(g.payment_date)}</td>
                        <td className="small fw-semibold text-nowrap">{fmtMonth(g.payment_month)}</td>

                        {/* Customer */}
                        <td>
                          <div className="fw-semibold small">{g.customer_name}</div>
                          <small className="text-muted">{g.customer_code}</small>
                        </td>

                        <td><code className="text-dark small">{g.pan_number || '—'}</code></td>

                        <td>
                          {nri
                            ? <span className="badge bg-warning text-dark">NRI</span>
                            : <span className="text-muted small">—</span>}
                        </td>

                        <td>
                          <span className={`badge ${g.agreement_type === 'Construction' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                            {g.agreement_type}
                          </span>
                        </td>

                        <td className="small">
                          {g.floor_no && <div>Fl. {g.floor_no}</div>}
                          {g.unit_no  && <div className="text-muted">U. {g.unit_no}</div>}
                          {!g.floor_no && !g.unit_no && '—'}
                        </td>

                        {/* Installment info */}
                        <td className="small text-nowrap">
                          {g.instLabel
                            ? <span className="text-muted">{g.instLabel}</span>
                            : <span className="text-muted">—</span>}
                          {g.instCount > 1 && (
                            <div>
                              <small className="text-primary">
                                <i className="bi bi-layers me-1"></i>{g.instCount} combined
                              </small>
                            </div>
                          )}
                        </td>

                        {/* GST info — only when table has any GST */}
                        {hasAnyGst && (
                          <td>
                            {g.hasGst
                              ? <code className="small text-primary">{g.gst_no}</code>
                              : <span className="text-muted small">—</span>}
                          </td>
                        )}
                        {hasAnyGst && (
                          <td className="text-center small">
                            {g.hasGst
                              ? <span className="badge bg-light text-dark border">{parseFloat(g.cgst).toFixed(1)}%</span>
                              : <span className="text-muted">—</span>}
                          </td>
                        )}
                        {hasAnyGst && (
                          <td className="text-center small">
                            {g.hasGst
                              ? <span className="badge bg-light text-dark border">{parseFloat(g.sgst).toFixed(1)}%</span>
                              : <span className="text-muted">—</span>}
                          </td>
                        )}

                        {/* Amounts */}
                        <td className="text-end small">{formatCurrency(g.gross)}</td>
                        <td className="text-end fw-bold text-danger small">{formatCurrency(g.tds)}</td>
                        <td className="text-end small">{formatCurrency(g.net)}</td>

                        {hasAnyGst && (
                          <td className="text-end small text-info">
                            {g.hasGst ? formatCurrency(g.cgst_amount) : <span className="text-muted">—</span>}
                          </td>
                        )}
                        {hasAnyGst && (
                          <td className="text-end small text-info">
                            {g.hasGst ? formatCurrency(g.sgst_amount) : <span className="text-muted">—</span>}
                          </td>
                        )}

                        {/* Final single transfer amount */}
                        <td className={`text-end fw-bold small ${hasAnyGst ? 'text-success' : ''}`}>
                          {formatCurrency(g.total_payable)}
                        </td>

                        <td>
                          <span className={`badge ${STATUS_BADGE[g.status] || 'bg-secondary'}`}>
                            {g.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td colSpan={hasAnyGst ? 12 : 9} className="text-end">
                      Totals ({groups.length} customers):
                    </td>
                    <td className="text-end">{formatCurrency(totals.gross)}</td>
                    <td className="text-end text-danger">{formatCurrency(totals.tds)}</td>
                    <td className="text-end">{formatCurrency(totals.net)}</td>
                    {hasAnyGst && <td className="text-end text-info">{formatCurrency(totals.cgst)}</td>}
                    {hasAnyGst && <td className="text-end text-info">{formatCurrency(totals.sgst)}</td>}
                    <td className={`text-end ${hasAnyGst ? 'text-success' : ''}`}>
                      {formatCurrency(totals.payable)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TDSTracker;