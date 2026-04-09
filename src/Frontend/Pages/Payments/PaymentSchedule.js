import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import { formatCurrency } from '../../Utils/helpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const round2 = (v) => parseFloat((parseFloat(v) || 0).toFixed(2));

const computeSplitAmounts = (netPayout, splits) => {
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (splits.length === 1)
    return [{ ...splits[0], amount: round2(netPayout) }];
  let remaining = round2(netPayout);
  return splits.map((sp, i) => {
    const isLast = i === splits.length - 1;
    const amount = isLast ? round2(remaining) : round2(netPayout * sp.percentage / 100);
    remaining = round2(remaining - amount);
    return { ...sp, amount };
  });
};

const parseSplits = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
};

const fmtMonth = (m) => {
  if (!m) return '—';
  try { return new Date(`${m}-01`).toLocaleString('default', { month: 'long', year: 'numeric' }); }
  catch { return m; }
};

const maskAccount = (acc) => {
  if (!acc) return '—';
  return acc.length > 4 ? `${'•'.repeat(acc.length - 4)}${acc.slice(-4)}` : acc;
};

const STATUS_BADGE = {
  Pending:       'bg-warning text-dark',
  Processing:    'bg-info text-white',
  Completed:     'bg-success text-white',
  Order_Created: 'bg-secondary text-white',
  Cancelled:     'bg-danger text-white',
  Failed:        'bg-danger text-white',
};

// ─── Split detail modal ───────────────────────────────────────────────────────
const SplitModal = ({ payment, onClose }) => {
  if (!payment) return null;
  const splits   = parseSplits(payment.payout_splits ?? payment.customer_payout_splits);
  const net      = parseFloat(payment.net_payout || 0);
  const entries  = splits ? computeSplitAmounts(net, splits) : null;
  const hasGst   = !!payment.gst_no;
  const cgstRate = hasGst ? parseFloat(payment.cgst || 9) : 0;
  const sgstRate = hasGst ? parseFloat(payment.sgst || 9) : 0;
  const cgstAmt  = hasGst ? round2(net * cgstRate / 100) : 0;
  const sgstAmt  = hasGst ? round2(net * sgstRate / 100) : 0;
  const transfer = round2(net + cgstAmt + sgstAmt);

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.45)', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg overflow-hidden">

          {/* Modal header */}
          <div
            className="modal-header border-0 text-white"
            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}
          >
            <div>
              <h5 className="modal-title mb-0">
                <i className="bi bi-diagram-3 me-2" />
                Payout Split — {payment.customer_name}
              </h5>
              <div className="small opacity-75 mt-1">
                {fmtMonth(payment.payment_month)}
                &nbsp;·&nbsp;{payment.customer_code}
                &nbsp;·&nbsp;Unit {payment.unit_no || '—'}, Floor {payment.floor_no || '—'}
              </div>
            </div>
            <button className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body p-4">

            {/* Payment summary */}
            <div
              className="rounded-3 p-3 mb-4 d-flex flex-wrap gap-3"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            >
              {[
                { label: 'Gross Rent',  value: formatCurrency(payment.gross_amount), color: '#1e293b' },
                { label: 'TDS (10%)',   value: formatCurrency(payment.tds_amount),   color: '#f59e0b' },
                { label: 'Net Payout',  value: formatCurrency(net),                  color: '#0ea5e9' },
                hasGst && { label: `CGST (${cgstRate}%)`, value: formatCurrency(cgstAmt), color: '#8b5cf6' },
                hasGst && { label: `SGST (${sgstRate}%)`, value: formatCurrency(sgstAmt), color: '#8b5cf6' },
                { label: 'Net Transfer', value: formatCurrency(transfer),             color: '#16a34a', bold: true },
              ].filter(Boolean).map(({ label, value, color, bold }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                  <div style={{ fontSize: bold ? '1.1rem' : '0.95rem', fontWeight: bold ? 700 : 600, color }}>{value}</div>
                </div>
              ))}

              <div className="ms-auto d-flex align-items-center">
                <span className={`badge ${STATUS_BADGE[payment.status] || 'bg-secondary'} px-3 py-2 fs-6`}>
                  {payment.status}
                </span>
              </div>
            </div>

            {/* Split accounts */}
            {entries && entries.length > 0 ? (
              <>
                <div className="fw-bold mb-3" style={{ color: '#16a34a' }}>
                  <i className="bi bi-bank me-2" />
                  Disbursement Breakdown — {entries.length} Bank Account{entries.length > 1 ? 's' : ''}
                </div>

                <div className="d-flex flex-column gap-3">
                  {entries.map((sp, i) => (
                    <div
                      key={i}
                      className="rounded-3 overflow-hidden"
                      style={{ border: '1.5px solid #bbf7d0', background: '#fff' }}
                    >
                      {/* Account header */}
                      <div
                        className="d-flex align-items-center justify-content-between px-3 py-2"
                        style={{ background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}
                      >
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="d-flex align-items-center justify-content-center rounded-circle fw-bold"
                            style={{
                              width: 28, height: 28,
                              background: '#16a34a', color: '#fff',
                              fontSize: '0.78rem',
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="fw-semibold" style={{ color: '#15803d' }}>
                            {sp.accountHolderName || `Account #${i + 1}`}
                          </span>
                          {sp.bankName && (
                            <span
                              className="badge"
                              style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.7rem' }}
                            >
                              {sp.bankName}
                            </span>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="badge"
                            style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 600 }}
                          >
                            {sp.percentage}% share
                          </span>
                          <span
                            className="fw-bold"
                            style={{ fontSize: '1rem', color: '#16a34a' }}
                          >
                            {formatCurrency(sp.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Account fields grid */}
                      <div className="px-3 py-3">
                        <div className="row g-3">
                          <div className="col-sm-6">
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Account Number
                            </div>
                            <div className="d-flex align-items-center gap-2 mt-1">
                              <span
                                className="px-2 py-1 rounded"
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.9rem',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  letterSpacing: '1px',
                                  color: '#0f172a',
                                }}
                              >
                                {maskAccount(sp.bankAccountNumber)}
                              </span>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                onClick={() => {
                                  navigator.clipboard?.writeText(sp.bankAccountNumber || '');
                                  toast.success('Account number copied!', { autoClose: 1500 });
                                }}
                                title="Copy full account number"
                              >
                                <i className="bi bi-clipboard" />
                              </button>
                            </div>
                          </div>

                          <div className="col-sm-3">
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              IFSC Code
                            </div>
                            <div
                              className="mt-1 fw-semibold"
                              style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#0f172a' }}
                            >
                              {sp.ifscCode || '—'}
                            </div>
                          </div>

                          <div className="col-sm-3">
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Split Amount
                            </div>
                            <div
                              className="mt-1 fw-bold"
                              style={{ fontSize: '1rem', color: '#16a34a' }}
                            >
                              {formatCurrency(sp.amount)}
                            </div>
                          </div>

                          {sp.bankName && (
                            <div className="col-sm-6">
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Bank
                              </div>
                              <div className="mt-1" style={{ fontSize: '0.88rem', color: '#334155' }}>
                                {sp.bankName}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Grand total row */}
                {entries.length > 1 && (
                  <div
                    className="rounded-3 d-flex justify-content-between align-items-center px-4 py-3 mt-3"
                    style={{ background: '#dcfce7', border: '2px solid #86efac' }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-check2-circle text-success fs-5" />
                      <span className="fw-semibold text-success">
                        Total disbursed across {entries.length} accounts
                      </span>
                    </div>
                    <span className="fw-bold fs-5 text-success">
                      {formatCurrency(entries.reduce((s, sp) => s + sp.amount, 0))}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-muted py-4">
                <i className="bi bi-bank fs-2 d-block mb-2 opacity-50" />
                <div>No payout split configured — full amount goes to primary account.</div>
                {payment.bank_account_number && (
                  <div className="mt-2 small">
                    <strong>Account:</strong> {maskAccount(payment.bank_account_number)}
                    &nbsp;·&nbsp;
                    <strong>IFSC:</strong> {payment.ifsc_code || '—'}
                    {payment.bank_name && <>&nbsp;·&nbsp;<strong>Bank:</strong> {payment.bank_name}</>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer border-0 bg-light">
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              <i className="bi bi-x-circle me-1" />Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PaymentSchedule  — main component
// ═══════════════════════════════════════════════════════════════════════════════
const PaymentSchedule = () => {
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();

  const [payments,   setPayments]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [splitModal, setSplitModal] = useState(null);   // payment object for modal
  const [expanded,   setExpanded]   = useState(new Set()); // expanded row ids

  const [filters, setFilters] = useState({
    month:         searchParams.get('month') || '',
    status:        searchParams.get('status') || '',
    agreementType: '',
  });

  useEffect(() => { 
    fetchSchedule(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const res = await paymentService.getPaymentSchedule(filters);
      setPayments(res.data || []);
    } catch {
      toast.error('Failed to load payment schedule');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  // ── Summaries ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    gross:    payments.reduce((s, p) => s + parseFloat(p.gross_amount || 0), 0),
    tds:      payments.reduce((s, p) => s + parseFloat(p.tds_amount   || 0), 0),
    net:      payments.reduce((s, p) => s + parseFloat(p.net_payout   || 0), 0),
    count:    payments.length,
    pending:  payments.filter((p) => p.status === 'Pending').length,
    completed:payments.filter((p) => p.status === 'Completed').length,
    multiSplit: payments.filter((p) => {
      const sp = parseSplits(p.payout_splits ?? p.customer_payout_splits);
      return sp && sp.length > 1;
    }).length,
  }), [payments]);

  return (
    <div className="container-fluid py-3">

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-calendar-check text-primary me-2" />
            Payment Schedule
          </h4>
          <small className="text-muted">View generated payments with per-account payout split details</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchSchedule}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/payments/generate')}>
            <i className="bi bi-lightning-charge me-1" />Generate
          </button>
          <button className="btn btn-success btn-sm" onClick={() => navigate('/payments/initiate')}>
            <i className="bi bi-send me-1" />Initiate
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Payments',   value: totals.count,                  cls: 'primary', icon: 'list-ul' },
          { label: 'Pending',          value: totals.pending,                cls: 'warning',  icon: 'clock' },
          { label: 'Completed',        value: totals.completed,              cls: 'success',  icon: 'check-circle' },
          { label: 'Multi-Split A/cs', value: totals.multiSplit,             cls: 'info',     icon: 'diagram-3' },
          { label: 'Total Gross',      value: formatCurrency(totals.gross),  cls: 'dark',     icon: 'cash' },
          { label: 'Total TDS',        value: formatCurrency(totals.tds),    cls: 'warning',  icon: 'percent' },
          { label: 'Total Net',        value: formatCurrency(totals.net),    cls: 'success',  icon: 'currency-rupee' },
        ].map(({ label, value, cls, icon }) => (
          <div className="col-sm-6 col-md-3 col-xl" key={label}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body p-3 d-flex align-items-center gap-3">
                <div
                  className={`d-flex align-items-center justify-content-center rounded-3 text-${cls}`}
                  style={{ width: 40, height: 40, background: `var(--bs-${cls}-bg-subtle, #f8f9fa)`, fontSize: '1.2rem' }}
                >
                  <i className={`bi bi-${icon}`} />
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                  <div className="fw-bold" style={{ fontSize: '0.95rem' }}>{value}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label small fw-semibold mb-1">Rent Month</label>
              <input
                type="month" className="form-control form-control-sm"
                name="month" value={filters.month} onChange={handleFilterChange}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small fw-semibold mb-1">Status</label>
              <select className="form-select form-select-sm" name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Order_Created">Order Created</option>
                <option value="Processing">Processing</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small fw-semibold mb-1">Agreement Type</label>
              <select className="form-select form-select-sm" name="agreementType" value={filters.agreementType} onChange={handleFilterChange}>
                <option value="">All Types</option>
                <option value="Construction">Construction</option>
                <option value="9-Year">9-Year Rental</option>
              </select>
            </div>
            <div className="col-md-3">
              <button className="btn btn-outline-secondary btn-sm w-100" onClick={() => setFilters({ month: '', status: '', agreementType: '' })}>
                <i className="bi bi-x-circle me-1" />Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" />
              <div className="text-muted mt-2 small">Loading payments...</div>
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox display-4 d-block mb-2 opacity-50" />
              No payments found
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light border-bottom">
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Customer</th>
                    <th>Unit / Floor</th>
                    <th>Rent Month</th>
                    <th>Period</th>
                    <th>Gross</th>
                    <th>TDS</th>
                    <th>Net Payout</th>
                    <th>Status</th>
                    <th>Payout Accounts</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const splits   = parseSplits(payment.payout_splits ?? payment.customer_payout_splits);
                    const net      = parseFloat(payment.net_payout || 0);
                    const entries  = splits ? computeSplitAmounts(net, splits) : null;
                    const isExpanded = expanded.has(payment.id);
                    // const hasMultiSplit = entries && entries.length > 1;

                    return (
                      <React.Fragment key={payment.id}>
                        {/* ── Main row ── */}
                        <tr
                          className={isExpanded ? 'table-active' : ''}
                          style={{ verticalAlign: 'middle' }}
                        >
                          {/* Expand toggle */}
                          <td className="text-center">
                            {entries && (
                              <button
                                className="btn btn-sm p-0"
                                style={{ color: isExpanded ? '#16a34a' : '#94a3b8', fontSize: '1rem', lineHeight: 1 }}
                                onClick={() => toggleExpand(payment.id)}
                                title={isExpanded ? 'Collapse split' : 'Expand split'}
                              >
                                <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} />
                              </button>
                            )}
                          </td>

                          {/* Customer */}
                          <td>
                            <div className="fw-semibold">{payment.customer_name}</div>
                            <small className="text-muted">{payment.customer_code}</small>
                            {payment.gst_no && (
                              <div>
                                <small className="text-success">
                                  <i className="bi bi-patch-check-fill me-1" />GST
                                </small>
                              </div>
                            )}
                          </td>

                          {/* Unit/Floor */}
                          <td>
                            <div>{payment.unit_no || '—'}</div>
                            <small className="text-muted">{payment.floor_no ? `Floor ${payment.floor_no}` : '—'}</small>
                          </td>

                          {/* Month */}
                          <td>
                            <span className="badge bg-info text-dark">{fmtMonth(payment.payment_month)}</span>
                            {payment.installment_no && (
                              <div><small className="text-muted">Inst {payment.installment_no}/{payment.total_installments}</small></div>
                            )}
                          </td>

                          {/* Period */}
                          <td>
                            <span className="badge bg-light text-dark border">{payment.payment_period}</span>
                          </td>

                          {/* Amounts */}
                          <td className="fw-semibold">{formatCurrency(payment.gross_amount)}</td>
                          <td className="text-warning">{formatCurrency(payment.tds_amount)}</td>
                          <td className="fw-semibold text-primary">{formatCurrency(payment.net_payout)}</td>

                          {/* Status */}
                          <td>
                            <span className={`badge ${STATUS_BADGE[payment.status] || 'bg-secondary'}`}>
                              {payment.status}
                            </span>
                          </td>

                          {/* Payout accounts column — compact inline badges */}
                          <td style={{ minWidth: 180 }}>
                            {entries && entries.length > 0 ? (
                              <div>
                                {entries.map((sp, i) => (
                                  <div
                                    key={i}
                                    className="d-flex align-items-center gap-1 mb-1"
                                    style={{ fontSize: '0.78rem' }}
                                  >
                                    <span
                                      className="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0"
                                      style={{ width: 18, height: 18, background: '#dcfce7', color: '#16a34a', fontSize: '0.65rem', border: '1px solid #bbf7d0' }}
                                    >
                                      {i + 1}
                                    </span>
                                    <span className="text-truncate fw-semibold" style={{ maxWidth: 90 }}>
                                      {sp.accountHolderName || `A/c #${i + 1}`}
                                    </span>
                                    <span
                                      className="badge flex-shrink-0"
                                      style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.65rem' }}
                                    >
                                      {sp.percentage}%
                                    </span>
                                    <span className="fw-bold flex-shrink-0 text-success" style={{ fontSize: '0.78rem' }}>
                                      {formatCurrency(sp.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted small">Single account</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td>
                            <div className="d-flex gap-1">
                              {entries && entries.length > 0 && (
                                <button
                                  className="btn btn-sm btn-outline-success"
                                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                  onClick={() => setSplitModal(payment)}
                                  title="View full split detail"
                                >
                                  <i className="bi bi-diagram-3 me-1" />Splits
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                onClick={() => navigate(`/payments/${payment.id}`)}
                                title="View payment detail"
                              >
                                <i className="bi bi-eye" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded split detail row ── */}
                        {isExpanded && entries && (
                          <tr style={{ background: '#f0fdf4' }}>
                            <td colSpan={11} className="py-0">
                              <div className="px-4 pb-3 pt-2">
                                <div className="fw-semibold small text-success mb-2">
                                  <i className="bi bi-diagram-3 me-1" />
                                  Payout Split Detail for {payment.customer_name} — {fmtMonth(payment.payment_month)}
                                </div>
                                <div className="row g-2">
                                  {entries.map((sp, i) => (
                                    <div className="col-sm-6 col-lg-4" key={i}>
                                      <div
                                        className="rounded-3 p-3 h-100"
                                        style={{
                                          background: '#fff',
                                          border: '1.5px solid #bbf7d0',
                                        }}
                                      >
                                        {/* Account header */}
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                          <div className="d-flex align-items-center gap-2">
                                            <span
                                              className="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold"
                                              style={{ width: 24, height: 24, background: '#16a34a', color: '#fff', fontSize: '0.75rem' }}
                                            >
                                              {i + 1}
                                            </span>
                                            <span className="fw-semibold" style={{ fontSize: '0.88rem', color: '#15803d' }}>
                                              {sp.accountHolderName || `Account #${i + 1}`}
                                            </span>
                                          </div>
                                          <span
                                            className="badge"
                                            style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 600 }}
                                          >
                                            {sp.percentage}%
                                          </span>
                                        </div>

                                        {/* Account details */}
                                        <div className="d-flex flex-column gap-1" style={{ fontSize: '0.78rem' }}>
                                          <div className="d-flex justify-content-between">
                                            <span className="text-muted">Account No</span>
                                            <span
                                              className="fw-semibold"
                                              style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}
                                            >
                                              ••••{(sp.bankAccountNumber || '').slice(-4)}
                                            </span>
                                          </div>
                                          <div className="d-flex justify-content-between">
                                            <span className="text-muted">IFSC</span>
                                            <span className="fw-semibold" style={{ fontFamily: 'monospace' }}>
                                              {sp.ifscCode || '—'}
                                            </span>
                                          </div>
                                          {sp.bankName && (
                                            <div className="d-flex justify-content-between">
                                              <span className="text-muted">Bank</span>
                                              <span className="fw-semibold text-truncate ms-2" style={{ maxWidth: 120 }}>
                                                {sp.bankName}
                                              </span>
                                            </div>
                                          )}
                                          <div
                                            className="d-flex justify-content-between align-items-center mt-1 pt-1"
                                            style={{ borderTop: '1px dashed #bbf7d0' }}
                                          >
                                            <span className="text-muted fw-semibold">Amount</span>
                                            <span className="fw-bold text-success" style={{ fontSize: '0.95rem' }}>
                                              {formatCurrency(sp.amount)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Row total */}
                                {entries.length > 1 && (
                                  <div
                                    className="d-flex justify-content-end align-items-center gap-3 mt-2 px-2"
                                    style={{ fontSize: '0.82rem' }}
                                  >
                                    <span className="text-muted">
                                      Total across {entries.length} accounts:
                                    </span>
                                    <span className="fw-bold text-success">
                                      {formatCurrency(entries.reduce((s, sp) => s + sp.amount, 0))}
                                    </span>
                                    <button
                                      className="btn btn-sm btn-outline-success"
                                      style={{ fontSize: '0.72rem', padding: '2px 10px' }}
                                      onClick={() => setSplitModal(payment)}
                                    >
                                      <i className="bi bi-box-arrow-up-right me-1" />Full Detail
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* Totals footer */}
                <tfoot className="table-secondary fw-bold">
                  <tr>
                    <td colSpan={5} className="text-end">Totals</td>
                    <td>{formatCurrency(totals.gross)}</td>
                    <td className="text-warning">{formatCurrency(totals.tds)}</td>
                    <td className="text-success">{formatCurrency(totals.net)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Split detail modal */}
      {splitModal && (
        <SplitModal
          payment={splitModal}
          onClose={() => setSplitModal(null)}
        />
      )}
    </div>
  );
};

export default PaymentSchedule;