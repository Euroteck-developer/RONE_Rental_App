import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

import tdsService from '../../Services/tds.service';
import header_lh from '../../Assets/header_lh.png';
import footer_lh from '../../Assets/footer_lh.png';

import {
  buildTDSCertificate,
  loadImageAsBase64,
  getCurrentFY,
  fmtMoney,
  fmtMonth,
} from './TDSCertificate.pdf';

// ─── Rounding helper ──────────────────────────────────────────────────────────
const r2 = (v) => Math.round(parseFloat(v) || 0);

// ─── Static data ──────────────────────────────────────────────────────────────
const fy = getCurrentFY();

const QUARTER_INFO = {
  Q1: { label: 'Q1 (Apr - Jun)', months: ['04', '05', '06'], dueDate: '31st July'    },
  Q2: { label: 'Q2 (Jul - Sep)', months: ['07', '08', '09'], dueDate: '31st October' },
  Q3: { label: 'Q3 (Oct - Dec)', months: ['10', '11', '12'], dueDate: '31st January' },
  Q4: { label: 'Q4 (Jan - Mar)', months: ['01', '02', '03'], dueDate: '31st May'     },
};

// ─── Aggregate raw TDS records into per-customer cert data ────────────────────
// KEY FIX: include ALL installments for a customer+month when ANY sibling has TDS.
// Previously `if (tds <= 0) return` dropped Inst 2/2 (tds=0 because combined TDS
// was placed on Inst 1), causing Gross to reflect only one installment.
//
// Strategy: group ALL raw records by customer, then sum amounts.
// The tds_amount field already carries combined TDS correctly on Inst 1; Inst 2
// has tds=0 but its gross/net must be included so Gross = full combined gross.
const aggregatePayments = (tdsRecords) => {
  // Step 1 — find which customer+month groups have ANY tds > 0
  const tdsGroups = new Set();
  tdsRecords.forEach((p) => {
    if (r2(p.tds_amount) > 0) {
      tdsGroups.add(`${p.customer_code || p.customer_name}_${p.payment_month}`);
    }
  });

  // Step 2 — include ALL rows whose customer+month is in a TDS group
  const eligible = tdsRecords.filter((p) => {
    const key = `${p.customer_code || p.customer_name}_${p.payment_month}`;
    return tdsGroups.has(key);
  });

  // Step 3 — aggregate into per-customer map
  const map = {};
  eligible.forEach((p) => {
    const cid = p.customer_code || p.customer_name;
    if (!map[cid]) {
      map[cid] = {
        customerId:        p.customer_code,
        customerName:      p.customer_name,
        panNumber:         p.pan_number,
        bankAccountNumber: p.bank_account_number,
        bankName:          p.bank_name,
        ifscCode:          p.ifsc_code,
        agreementType:     p.payment_period || p.agreement_type,
        floorNo:           p.floor_no,
        unitNo:            p.unit_no,
        nriStatus:         p.nri_status,
        gstNo:             p.gst_no,
        cgst:              p.cgst,
        sgst:              p.sgst,
        totalGross: 0,
        totalTDS:   0,
        totalNet:   0,
        totalGST:   0,
        totalCGST:  0,
        totalSGST:  0,
        months:     [],
        payments:   [],
        // Per payment_month combined amounts (for PDF table — one row per month)
        _monthMap:  {},
      };
    }

    const g = map[cid];
    const gross    = r2(p.gross_amount);
    const tds      = r2(p.tds_amount);
    const net      = r2(p.net_payout);
    const cgstAmt  = r2(p.cgst_amount  || 0);
    const sgstAmt  = r2(p.sgst_amount  || 0);
    const gstTotal = r2(p.gst_amount   || 0);

    g.totalGross = r2(g.totalGross + gross);
    g.totalTDS   = r2(g.totalTDS   + tds);
    g.totalNet   = r2(g.totalNet   + net);
    g.totalGST   = r2(g.totalGST   + gstTotal);
    g.totalCGST  = r2(g.totalCGST  + cgstAmt);
    g.totalSGST  = r2(g.totalSGST  + sgstAmt);

    if (!g.months.includes(p.payment_month)) g.months.push(p.payment_month);

    // Merge same-month installments into one PDF table row per month
    const mk = p.payment_month;
    if (!g._monthMap[mk]) {
      g._monthMap[mk] = {
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
    const mm = g._monthMap[mk];
    mm.gross_amount = r2(mm.gross_amount + gross);
    mm.tds_amount   = r2(mm.tds_amount   + tds);
    mm.net_payout   = r2(mm.net_payout   + net);
    mm._cgstAmt     = r2(mm._cgstAmt     + cgstAmt);
    mm._sgstAmt     = r2(mm._sgstAmt     + sgstAmt);
    mm._gstTotal    = r2(mm._gstTotal    + gstTotal);
  });

  // Step 4 — replace payments[] with one-row-per-month (combined installments)
  return Object.values(map).map((g) => {
    g.payments = g.months
      .slice()
      .sort()
      .map((mk) => g._monthMap[mk])
      .filter(Boolean);
    delete g._monthMap;
    return g;
  });
};

// ─── Create a fresh A4 portrait jsPDF doc ─────────────────────────────────────
const newA4Doc = () =>
  new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

// ─── Inline styles ────────────────────────────────────────────────────────────
const S = {
  quarterCard: (active) => ({
    minWidth: 112,
    cursor: 'pointer',
    border: `2px solid ${active ? '#DC2626' : '#E5E7EB'}`,
    borderRadius: 10,
    background: active ? '#FEF2F2' : '#fff',
    transition: 'all .15s',
    boxShadow: active ? '0 2px 10px rgba(220,38,38,.15)' : 'none',
  }),
  statCard: (color) => ({
    background: '#fff',
    borderRadius: 12,
    padding: '14px 16px',
    boxShadow: '0 1px 6px rgba(0,0,0,.07)',
    borderTop: `3px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  }),
  statIcon: (color) => ({
    width: 38, height: 38, borderRadius: 10,
    background: color + '18',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 17, color,
    flexShrink: 0,
  }),
};

// ─── Main Component ───────────────────────────────────────────────────────────
const TDSCertificates = () => {
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [certificateData, setCertificateData] = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [pdfLoading,      setPdfLoading]      = useState({});
  const [bulkLoading,     setBulkLoading]     = useState(false);
  const [excelLoading,    setExcelLoading]    = useState(false);
  const [dataLoaded,      setDataLoaded]      = useState(false);

  const headerB64 = useRef('');
  const footerB64 = useRef('');

  useEffect(() => {
    loadImageAsBase64(header_lh).then((b) => { headerB64.current = b; }).catch(() => {});
    loadImageAsBase64(footer_lh).then((b) => { footerB64.current = b; }).catch(() => {});
  }, []);

  useEffect(() => {
    setCertificateData([]);
    setDataLoaded(false);
  }, [selectedQuarter]);

  const pdfOptions = (pageIndex, totalPages) => ({
    selectedQuarter,
    quarterInfo: QUARTER_INFO[selectedQuarter],
    fy,
    pageIndex,
    totalPages,
    headerBase64: headerB64.current,
    footerBase64: footerB64.current,
  });

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchQuarterData = async () => {
    setLoading(true);
    setDataLoaded(false);
    try {
      const qInfo     = QUARTER_INFO[selectedQuarter];
      const yearForQ  = ['01', '02', '03'].includes(qInfo.months[0])
        ? fy.endYear
        : fy.startYear;

      const rawRecords = [];
      for (const mn of qInfo.months) {
        const res = await tdsService.getAllTDS({ month: `${yearForQ}-${mn}` });
        rawRecords.push(...(res.data || []));
      }

      // Deduplicate by payment id
      const seen   = new Set();
      const unique = rawRecords.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const data = aggregatePayments(unique);
      setCertificateData(data);
      setDataLoaded(true);
      if (!data.length) toast.info(`No TDS deductions for ${qInfo.label}`);
      else toast.success(`Loaded ${data.length} customer(s) with TDS`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch quarter data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Single PDF ────────────────────────────────────────────────────────────
  const handleSinglePDF = (data) => {
    const id = data.customerId || data.customerName;
    setPdfLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const doc = newA4Doc();
      buildTDSCertificate(doc, data, pdfOptions(0, 1));
      doc.save(
        `TDS_Certificate_${(data.customerName || 'Customer').replace(/\s+/g, '_')}_${selectedQuarter}_${fy.label}.pdf`,
      );
      toast.success(`Certificate downloaded for ${data.customerName}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  // ─── Bulk PDF ──────────────────────────────────────────────────────────────
  const handleBulkPDF = () => {
    if (!certificateData.length) { toast.warning('No data to download'); return; }
    setBulkLoading(true);
    try {
      const doc   = newA4Doc();
      const total = certificateData.length;
      certificateData.forEach((data, i) => {
        if (i > 0) doc.addPage();
        buildTDSCertificate(doc, data, pdfOptions(i, total));
      });
      doc.save(`TDS_Certificates_All_${selectedQuarter}_${fy.label}.pdf`);
      toast.success(`${total} certificates downloaded!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate bulk PDF.');
    } finally {
      setBulkLoading(false);
    }
  };

  // ─── Excel ─────────────────────────────────────────────────────────────────
  const handleExcel = () => {
    if (!certificateData.length) { toast.warning('No data to export'); return; }
    setExcelLoading(true);
    try {
      const qInfo = QUARTER_INFO[selectedQuarter];
      const rows  = certificateData.map((d, i) => {
        const totalPayable = r2(d.totalNet + d.totalCGST + d.totalSGST);
        return {
          'S.No'           : i + 1,
          'Customer'       : d.customerName,
          'PAN'            : d.panNumber          || '-',
          'NRI Status'     : (d.nriStatus || '').toLowerCase() === 'yes' ? 'NRI' : 'Resident',
          'Bank Account'   : d.bankAccountNumber  || '-',
          'IFSC'           : d.ifscCode           || '-',
          'Agreement'      : d.agreementType      || '-',
          'Floor/Unit'     : `${d.floorNo || '-'} / ${d.unitNo || '-'}`,
          'GST No'         : d.gstNo              || '-',
          'CGST %'         : d.gstNo ? parseFloat(d.cgst || 0)  : '-',
          'SGST %'         : d.gstNo ? parseFloat(d.sgst || 0)  : '-',
          'Quarter'        : qInfo.label,
          'Gross Rent'     : r2(d.totalGross),
          'TDS Deducted'   : r2(d.totalTDS),
          'Net (after TDS)': r2(d.totalNet),
          'CGST (on Net)'  : r2(d.totalCGST),
          'SGST (on Net)'  : r2(d.totalSGST),
          'Total GST'      : r2(d.totalGST),
          'Total Payable'  : totalPayable,
          'Months'         : d.months.sort().map(fmtMonth).join(', '),
          'Cert No'        : `TDS-${selectedQuarter}-${fy.label}-${d.customerId}`,
        };
      });

      const gtNet     = r2(certificateData.reduce((s, d) => s + d.totalNet,  0));
      const gtCGST    = r2(certificateData.reduce((s, d) => s + d.totalCGST, 0));
      const gtSGST    = r2(certificateData.reduce((s, d) => s + d.totalSGST, 0));
      const gtGST     = r2(certificateData.reduce((s, d) => s + d.totalGST,  0));
      const gtPayable = r2(gtNet + gtCGST + gtSGST);
      rows.push({
        'S.No': '', 'Customer': 'GRAND TOTAL', 'PAN': '', 'NRI Status': '',
        'Bank Account': '', 'IFSC': '', 'Agreement': '', 'Floor/Unit': '',
        'GST No': '', 'CGST %': '', 'SGST %': '', 'Quarter': '',
        'Gross Rent'      : r2(certificateData.reduce((s, d) => s + d.totalGross, 0)),
        'TDS Deducted'    : r2(certificateData.reduce((s, d) => s + d.totalTDS,   0)),
        'Net (after TDS)' : gtNet,
        'CGST (on Net)'   : gtCGST,
        'SGST (on Net)'   : gtSGST,
        'Total GST'       : gtGST,
        'Total Payable'   : gtPayable,
        'Months': '', 'Cert No': '',
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        {wch:5},{wch:28},{wch:13},{wch:9},{wch:20},{wch:12},
        {wch:14},{wch:11},{wch:18},{wch:7},{wch:7},{wch:20},
        {wch:14},{wch:14},{wch:16},{wch:14},{wch:14},{wch:12},{wch:14},{wch:28},{wch:28},
      ];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let c = 0; c <= range.e.c; c++) {
        const cell = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[cell]) continue;
        ws[cell].s = {
          font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
          fill:      { fgColor: { rgb: '0F2464' } },
          alignment: { horizontal: 'center', wrapText: true },
          border:    { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} },
        };
      }
      const lastRow = rows.length;
      for (let c = 0; c <= range.e.c; c++) {
        const cell = XLSX.utils.encode_cell({ r: lastRow, c });
        if (!ws[cell]) continue;
        ws[cell].s = {
          font:   { bold: true, sz: 10 },
          fill:   { fgColor: { rgb: 'FEF9C3' } },
          border: { top:{style:'medium'}, bottom:{style:'medium'}, left:{style:'thin'}, right:{style:'thin'} },
        };
      }
      XLSX.utils.book_append_sheet(wb, ws, `${selectedQuarter} Certificates`);
      XLSX.writeFile(wb, `TDS_Summary_${selectedQuarter}_${fy.label}.xlsx`);
      toast.success('Excel summary downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel.');
    } finally {
      setExcelLoading(false);
    }
  };

  // ─── Summary stats ─────────────────────────────────────────────────────────
  const totalGross   = r2(certificateData.reduce((s, d) => s + d.totalGross, 0));
  const totalTDS     = r2(certificateData.reduce((s, d) => s + d.totalTDS,   0));
  const totalNet     = r2(certificateData.reduce((s, d) => s + d.totalNet,   0));
  const totalGST     = r2(certificateData.reduce((s, d) => s + d.totalGST,   0));
  const totalPayable = r2(totalNet + totalGST);
  const nriCount     = certificateData.filter((d) => (d.nriStatus || '').toLowerCase() === 'yes').length;
  const gstCount     = certificateData.filter((d) => d.gstNo).length;

  const stats = [
    { label: 'Customers',       value: certificateData.length, color: '#1E3A8A', icon: 'bi-people-fill'  },
    { label: 'Gross Rent',      value: fmtMoney(totalGross),   color: '#15803D', icon: 'bi-cash-stack'   },
    { label: 'TDS Deducted',    value: fmtMoney(totalTDS),     color: '#DC2626', icon: 'bi-percent'      },
    { label: 'Net (after TDS)', value: fmtMoney(totalNet),     color: '#7C3AED', icon: 'bi-wallet2'      },
    { label: 'Total GST',       value: fmtMoney(totalGST),     color: '#0369A1', icon: 'bi-receipt'      },
    { label: 'Total Payable',   value: fmtMoney(totalPayable), color: '#15803D', icon: 'bi-bank'         },
    { label: 'NRI',             value: nriCount,               color: '#B45309', icon: 'bi-globe'        },
    { label: 'GST Registered',  value: gstCount,               color: '#0369A1', icon: 'bi-building'     },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid px-0">

      {/* Page header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-file-earmark-medical text-danger me-2"></i>
            TDS Certificates
          </h4>
          <p className="text-muted small mb-0">
            Form 16C - Section 194-IB &nbsp;|&nbsp;
            <span className="badge bg-primary">FY {fy.label}</span>
          </p>
        </div>
        {dataLoaded && certificateData.length > 0 && (
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-success btn-sm" onClick={handleExcel} disabled={excelLoading}>
              {excelLoading
                ? <span className="spinner-border spinner-border-sm me-1"></span>
                : <i className="bi bi-file-earmark-excel me-1"></i>}
              Export Excel
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkPDF} disabled={bulkLoading}>
              {bulkLoading
                ? <span className="spinner-border spinner-border-sm me-1"></span>
                : <i className="bi bi-files me-1"></i>}
              Bulk PDF ({certificateData.length})
            </button>
          </div>
        )}
      </div>

      {/* Quarter selector */}
      <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 12 }}>
        <div className="card-body py-3 px-4">
          <div className="row g-3 align-items-end">
            <div className="col-md-8">
              <label className="form-label small fw-semibold text-muted mb-2">
                SELECT QUARTER - FY {fy.label}
              </label>
              <div className="d-flex gap-3 flex-wrap">
                {Object.entries(QUARTER_INFO).map(([q, info]) => (
                  <div
                    key={q}
                    style={S.quarterCard(selectedQuarter === q)}
                    onClick={() => setSelectedQuarter(q)}
                    className="flex-shrink-0 p-2 text-center"
                  >
                    <div className="fw-bold" style={{ fontSize: '1.1rem', color: selectedQuarter === q ? '#DC2626' : '#6B7280' }}>
                      {q}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      {info.label.replace(/Q\d\s/, '')}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                      Due: {info.dueDate}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-danger w-100"
                style={{ borderRadius: 8 }}
                onClick={fetchQuarterData}
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Loading...</>
                  : <><i className="bi bi-search me-2"></i>Load {selectedQuarter} Data</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {dataLoaded && certificateData.length > 0 && (
        <div className="row g-3 mb-4">
          {stats.map((s) => (
            <div key={s.label} className="col-xl-2 col-md-4 col-sm-6">
              <div style={S.statCard(s.color)}>
                <div style={S.statIcon(s.color)}>
                  <i className={`bi ${s.icon}`}></i>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase' }}>
                    {s.label}
                  </div>
                  <div className="fw-bold" style={{ color: s.color, fontSize: '0.9rem', marginTop: 2 }}>
                    {s.value}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Certificate list table */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div
          className="card-header border-bottom d-flex justify-content-between align-items-center"
          style={{ background: '#fff', borderRadius: '12px 12px 0 0', padding: '14px 20px' }}
        >
          <h6 className="mb-0 fw-semibold">
            <i className="bi bi-table me-2 text-danger"></i>
            {dataLoaded
              ? `${certificateData.length} Certificate(s) — ${QUARTER_INFO[selectedQuarter].label}`
              : 'Certificate List'}
          </h6>
          <small className="text-muted">A4 Portrait &nbsp;·&nbsp; Form 16C</small>
        </div>

        <div className="card-body p-0">
          {loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-danger mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <p className="text-muted">Fetching {QUARTER_INFO[selectedQuarter].label} data...</p>
            </div>
          )}

          {!loading && !dataLoaded && (
            <div className="text-center py-5">
              <i className="bi bi-file-earmark-medical text-muted mb-3 d-block" style={{ fontSize: '3.5rem', opacity: .22 }}></i>
              <h6 className="text-muted">Select a quarter and click "Load Data"</h6>
              <p className="text-muted small">Certificates will appear here once loaded.</p>
            </div>
          )}

          {!loading && dataLoaded && certificateData.length === 0 && (
            <div className="text-center py-5">
              <i className="bi bi-inbox text-muted d-block mb-3" style={{ fontSize: '3rem', opacity: .28 }}></i>
              <h6 className="text-muted">No TDS deductions for {QUARTER_INFO[selectedQuarter].label}</h6>
            </div>
          )}

          {!loading && dataLoaded && certificateData.length > 0 && (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.82rem' }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr>
                    <th className="ps-3">#</th>
                    <th>Customer</th>
                    <th>PAN</th>
                    <th>NRI</th>
                    <th>Bank Account</th>
                    <th>Agreement</th>
                    <th>Floor / Unit</th>
                    <th>GST No</th>
                    <th className="text-end">Gross Rent</th>
                    <th className="text-end">TDS</th>
                    <th className="text-end">Net (after TDS)</th>
                    <th className="text-end">GST (on Net)</th>
                    <th className="text-end">Total Payable</th>
                    <th>Months</th>
                    <th className="text-center pe-3">PDF</th>
                  </tr>
                </thead>

                <tbody>
                  {certificateData.map((d, i) => {
                    const isNRI        = (d.nriStatus || '').toLowerCase() === 'yes';
                    const id           = d.customerId || d.customerName;
                    const totalPayable = r2(d.totalNet + d.totalCGST + d.totalSGST);
                    return (
                      <tr key={id}>
                        <td className="ps-3 text-muted small">{i + 1}</td>

                        <td>
                          <div className="fw-semibold">{d.customerName}</div>
                          {d.customerId && <small className="text-muted">{d.customerId}</small>}
                        </td>

                        <td><code className="text-dark small">{d.panNumber || '-'}</code></td>

                        <td>
                          {isNRI
                            ? <span className="badge bg-warning text-dark">NRI</span>
                            : <span className="text-muted">-</span>}
                        </td>

                        <td><code style={{ fontSize: '0.72rem' }}>{d.bankAccountNumber || '-'}</code></td>

                        <td>
                          <span className={`badge ${d.agreementType === 'Construction' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                            {d.agreementType || '-'}
                          </span>
                        </td>

                        <td className="small text-muted">{d.floorNo || '-'} / {d.unitNo || '-'}</td>

                        <td>
                          {d.gstNo ? (
                            <>
                              <code className="text-primary small">{d.gstNo}</code><br />
                              <small className="text-muted">
                                C {parseFloat(d.cgst || 0).toFixed(1)}%&nbsp;
                                S {parseFloat(d.sgst || 0).toFixed(1)}%
                              </small>
                            </>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>

                        <td className="text-end small">{fmtMoney(d.totalGross)}</td>
                        <td className="text-end fw-bold text-danger small">{fmtMoney(d.totalTDS)}</td>
                        <td className="text-end small">{fmtMoney(d.totalNet)}</td>

                        <td className="text-end small text-info">
                          {d.gstNo ? (
                            <>
                              {fmtMoney(d.totalGST)}
                              <br />
                              <small className="text-muted" style={{ fontSize: '0.65rem' }}>
                                C:{fmtMoney(d.totalCGST)} S:{fmtMoney(d.totalSGST)}
                              </small>
                            </>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>

                        <td className="text-end fw-bold text-success small">{fmtMoney(totalPayable)}</td>

                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {d.months.sort().map((m, mi) => (
                              <span key={mi} className="badge bg-light text-dark border" style={{ fontSize: '0.62rem' }}>
                                {fmtMonth(m)}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="text-center pe-3">
                          <button
                            className="btn btn-sm btn-outline-danger"
                            style={{ borderRadius: 6, fontSize: '0.78rem' }}
                            onClick={() => handleSinglePDF(d)}
                            disabled={pdfLoading[id]}
                            title={`Download PDF for ${d.customerName}`}
                          >
                            {pdfLoading[id]
                              ? <span className="spinner-border spinner-border-sm"></span>
                              : <><i className="bi bi-file-earmark-pdf me-1"></i>PDF</>}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="table-secondary fw-bold">
                  <tr>
                    <td colSpan={8} className="text-end ps-3">
                      Total &nbsp;({certificateData.length} customer{certificateData.length !== 1 ? 's' : ''})
                    </td>
                    <td className="text-end">{fmtMoney(totalGross)}</td>
                    <td className="text-end text-danger">{fmtMoney(totalTDS)}</td>
                    <td className="text-end">{fmtMoney(totalNet)}</td>
                    <td className="text-end text-info">{fmtMoney(totalGST)}</td>
                    <td className="text-end text-success">{fmtMoney(totalPayable)}</td>
                    <td colSpan={2}></td>
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

export default TDSCertificates;