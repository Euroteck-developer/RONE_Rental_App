import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import { formatCurrency, formatDate } from '../../Utils/helpers';

// ─── Payout split helpers ─────────────────────────────────────────────────────
const round2 = (v) => parseFloat((parseFloat(v) || 0).toFixed(2));

const parseSplits = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
};

const computeSplitAmounts = (netPayout, splits) => {
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (splits.length === 1) return [{ ...splits[0], amount: round2(netPayout) }];
  let remaining = round2(netPayout);
  return splits.map((sp, i) => {
    const isLast = i === splits.length - 1;
    const amount = isLast ? round2(remaining) : round2(netPayout * sp.percentage / 100);
    remaining = round2(remaining - amount);
    return { ...sp, amount };
  });
};

const maskAccount = (acc) => {
  if (!acc) return '—';
  return acc.length > 4 ? `${'•'.repeat(acc.length - 4)}${acc.slice(-4)}` : acc;
};

const STATUS_CLS = {
  Completed:     'bg-success',
  Processing:    'bg-primary',
  Failed:        'bg-danger',
  Pending:       'bg-warning text-dark',
  Order_Created: 'bg-secondary',
  Cancelled:     'bg-danger',
};

// ─── Split detail modal ───────────────────────────────────────────────────────
const SplitModal = ({ payment, onClose }) => {
  if (!payment) return null;

  const splits  = parseSplits(payment.payment_payout_splits ?? payment.customer_payout_splits);
  const net     = parseFloat(payment.net_payout || 0);
  const entries = splits ? computeSplitAmounts(net, splits) : null;

  const hasGst   = !!payment.gst_no;
  const cgstRate = hasGst ? parseFloat(payment.cgst || 9) : 0;
  const sgstRate = hasGst ? parseFloat(payment.sgst || 9) : 0;
  const cgstAmt  = hasGst ? round2(net * cgstRate / 100) : 0;
  const sgstAmt  = hasGst ? round2(net * sgstRate / 100) : 0;
  const transfer = round2(net + cgstAmt + sgstAmt);

  const fmtMonth = (m) => {
    if (!m) return '—';
    try { return new Date(`${m}-01`).toLocaleString('default', { month: 'long', year: 'numeric' }); }
    catch { return m; }
  };

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

          {/* Header */}
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

            {/* Payment summary strip */}
            <div
              className="rounded-3 p-3 mb-4 d-flex flex-wrap gap-4 align-items-center"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            >
              {[
                { label: 'Payment ID',  value: payment.payment_id || payment.id?.slice(0, 8),  color: '#64748b' },
                { label: 'Date',        value: formatDate(payment.payment_date),                color: '#64748b' },
                { label: 'Gross Rent',  value: formatCurrency(payment.gross_amount),            color: '#1e293b' },
                { label: 'TDS',         value: formatCurrency(payment.tds_amount),              color: '#f59e0b' },
                { label: 'Net Payout',  value: formatCurrency(net),                             color: '#0ea5e9' },
                hasGst && { label: `CGST (${cgstRate}%)`, value: formatCurrency(cgstAmt),       color: '#8b5cf6' },
                hasGst && { label: `SGST (${sgstRate}%)`, value: formatCurrency(sgstAmt),       color: '#8b5cf6' },
                { label: 'Net Transfer',value: formatCurrency(transfer),                        color: '#16a34a', bold: true },
              ].filter(Boolean).map(({ label, value, color, bold }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: bold ? '1.05rem' : '0.88rem', fontWeight: bold ? 700 : 600, color }}>
                    {value}
                  </div>
                </div>
              ))}
              <div className="ms-auto">
                <span className={`badge ${STATUS_CLS[payment.status] || 'bg-secondary'} px-3 py-2 fs-6`}>
                  {payment.status}
                </span>
              </div>
            </div>

            {/* Bank accounts */}
            {entries && entries.length > 0 ? (
              <>
                <div className="fw-bold mb-3" style={{ color: '#16a34a', fontSize: '0.88rem' }}>
                  <i className="bi bi-bank me-2" />
                  Disbursement to {entries.length} Bank Account{entries.length !== 1 ? 's' : ''}
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
                            className="d-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0"
                            style={{ width: 28, height: 28, background: '#16a34a', color: '#fff', fontSize: '0.78rem' }}
                          >
                            {i + 1}
                          </span>
                          <span className="fw-semibold" style={{ color: '#15803d', fontSize: '0.9rem' }}>
                            {sp.accountHolderName || `Account #${i + 1}`}
                          </span>
                          {sp.bankName && (
                            <span
                              className="badge"
                              style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.68rem' }}
                            >
                              {sp.bankName}
                            </span>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="badge"
                            style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 600 }}
                          >
                            {sp.percentage}% share
                          </span>
                          <span className="fw-bold" style={{ fontSize: '1rem', color: '#16a34a' }}>
                            {formatCurrency(sp.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Account detail grid */}
                      <div className="px-3 py-3">
                        <div className="row g-3">
                          <div className="col-sm-5">
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Account Number
                            </div>
                            <div className="d-flex align-items-center gap-2 mt-1">
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.88rem',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  letterSpacing: '1px',
                                  color: '#0f172a',
                                }}
                              >
                                {maskAccount(sp.bankAccountNumber)}
                              </span>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                style={{ fontSize: '0.68rem', padding: '2px 6px' }}
                                onClick={() => {
                                  navigator.clipboard?.writeText(sp.bankAccountNumber || '');
                                  toast.success('Copied!', { autoClose: 1200 });
                                }}
                                title="Copy full account number"
                              >
                                <i className="bi bi-clipboard" />
                              </button>
                            </div>
                          </div>

                          <div className="col-sm-3">
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              IFSC Code
                            </div>
                            <div className="mt-1 fw-semibold" style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#0f172a' }}>
                              {sp.ifscCode || '—'}
                            </div>
                          </div>

                          <div className="col-sm-4">
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Split Amount
                            </div>
                            <div className="mt-1 fw-bold" style={{ fontSize: '1rem', color: '#16a34a' }}>
                              {formatCurrency(sp.amount)}
                            </div>
                          </div>

                          {sp.bankName && (
                            <div className="col-sm-5">
                              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Bank
                              </div>
                              <div className="mt-1" style={{ fontSize: '0.85rem', color: '#334155' }}>
                                {sp.bankName}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Grand total */}
                {entries.length > 1 && (
                  <div
                    className="rounded-3 d-flex justify-content-between align-items-center px-4 py-3 mt-3"
                    style={{ background: '#dcfce7', border: '2px solid #86efac' }}
                  >
                    <span className="fw-semibold text-success d-flex align-items-center gap-2">
                      <i className="bi bi-check2-circle fs-5" />
                      Total across {entries.length} accounts
                    </span>
                    <span className="fw-bold fs-5 text-success">
                      {formatCurrency(entries.reduce((s, sp) => s + sp.amount, 0))}
                    </span>
                  </div>
                )}
              </>
            ) : (
              /* No split — show primary bank info */
              <div className="text-center text-muted py-4">
                <i className="bi bi-bank fs-2 d-block mb-2 opacity-50" />
                <div>Full amount paid to primary account.</div>
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

            {/* Transaction reference (if completed) */}
            {(payment.transaction_reference || payment.easebuzz_payid) && (
              <div
                className="rounded-3 px-3 py-2 mt-3 d-flex flex-wrap gap-4"
                style={{ background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: '0.8rem' }}
              >
                {payment.easebuzz_payid && (
                  <div>
                    <span className="text-muted">Easebuzz Pay ID: </span>
                    <span className="fw-semibold" style={{ fontFamily: 'monospace' }}>{payment.easebuzz_payid}</span>
                  </div>
                )}
                {payment.transaction_reference && (
                  <div>
                    <span className="text-muted">Txn Ref: </span>
                    <span className="fw-semibold" style={{ fontFamily: 'monospace' }}>{payment.transaction_reference}</span>
                  </div>
                )}
                {payment.easebuzz_method && (
                  <div>
                    <span className="text-muted">Method: </span>
                    <span className="fw-semibold text-capitalize">{payment.easebuzz_method}</span>
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
//  PaymentHistory  — main component
// ═══════════════════════════════════════════════════════════════════════════════
const PaymentHistory = () => {
  const [payments,   setPayments]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters,    setFilters]    = useState({ status: 'Completed', startDate: '', endDate: '', month: '', agreementType: '' });
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [splitModal,  setSplitModal]  = useState(null);

  useEffect(() => { 
    fetchPaymentHistory(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, filters]);

  const fetchPaymentHistory = async () => {
    try {
      setLoading(true);
      const result = await paymentService.getPaymentHistory({
        page: pagination.page,
        limit: pagination.limit,
        ...filters,
      });
      setPayments(result.data.payments);
      setPagination(result.data.pagination);
    } catch {
      toast.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const toggleExpand = (id) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Totals for visible page ────────────────────────────────────────────────
  const pageGross = payments.reduce((s, p) => s + parseFloat(p.gross_amount || 0), 0);
  const pageTds   = payments.reduce((s, p) => s + parseFloat(p.tds_amount   || 0), 0);
  const pageNet   = payments.reduce((s, p) => s + parseFloat(p.net_payout   || 0), 0);

  const hasAnySplit = payments.some((p) => {
    const sp = parseSplits(p.payment_payout_splits ?? p.customer_payout_splits);
    return sp && sp.length > 1;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid">
      <div className="mb-4">
        <h4 className="fw-bold">
          <i className="bi bi-clock-history text-primary me-2" />
          Payment History
        </h4>
        <p className="text-muted">View completed and processed payments with payout split details</p>
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-2">
              <label className="form-label fw-semibold small">Status</label>
              <select className="form-select" name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Status</option>
                <option value="Completed">Completed</option>
                <option value="Processing">Processing</option>
                <option value="Failed">Failed</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold small">Rent Month</label>
              <input
                type="month" className="form-control"
                name="month" value={filters.month} onChange={handleFilterChange}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold small">Agreement</label>
              <select className="form-select" name="agreementType" value={filters.agreementType} onChange={handleFilterChange}>
                <option value="">All Types</option>
                <option value="Construction">Construction</option>
                <option value="9-Year">9-Year Rental</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold small">Start Date</label>
              <input type="date" className="form-control" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-semibold small">End Date</label>
              <input type="date" className="form-control" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-outline-secondary w-100"
                onClick={() => { setFilters({ status: 'Completed', startDate: '', endDate: '', month: '', agreementType: '' }); setPagination((p) => ({ ...p, page: 1 })); }}
              >
                <i className="bi bi-x-circle me-1" />Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Split hint */}
      {hasAnySplit && !loading && (
        <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3">
          <i className="bi bi-diagram-3 fs-5 flex-shrink-0" />
          <small>
            Some payments have <strong>multi-account payout splits</strong>.
            Click <i className="bi bi-chevron-right" /> to expand or <strong>Splits</strong> for full detail.
          </small>
        </div>
      )}

      {/* Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }} />
              <p className="text-muted mt-3">No payment history found</p>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light border-bottom">
                    <tr>
                      {/* Expand col */}
                      <th style={{ width: 32 }}></th>
                      <th>Payment ID</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Rent Month</th>
                      <th>Gross</th>
                      <th>TDS</th>
                      <th>Net Payout</th>
                      <th>Status</th>
                      {/* Payout Accounts */}
                      <th>Payout Accounts</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const splits  = parseSplits(payment.payment_payout_splits ?? payment.customer_payout_splits);
                      const net     = parseFloat(payment.net_payout || 0);
                      const entries = splits ? computeSplitAmounts(net, splits) : null;
                      const hasMulti   = entries && entries.length > 1;
                      const isExpanded = expandedIds.has(payment.id);

                      const fmtMonth = (m) => {
                        if (!m) return '—';
                        try { return new Date(`${m}-01`).toLocaleString('default', { month: 'short', year: 'numeric' }); }
                        catch { return m; }
                      };

                      return (
                        <React.Fragment key={payment.id}>
                          {/* ── Main row ── */}
                          <tr>
                            {/* Expand chevron */}
                            <td className="text-center">
                              {entries && entries.length > 0 && (
                                <button
                                  className="btn btn-sm p-0"
                                  style={{ color: isExpanded ? '#16a34a' : '#94a3b8', fontSize: '0.9rem', lineHeight: 1 }}
                                  onClick={() => toggleExpand(payment.id)}
                                  title={isExpanded ? 'Collapse' : 'Expand split'}
                                >
                                  <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} />
                                </button>
                              )}
                            </td>

                            {/* Payment ID */}
                            <td>
                              <strong style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>
                                {payment.payment_id || payment.id?.slice(0, 8)}
                              </strong>
                            </td>

                            {/* Date */}
                            <td style={{ fontSize: '0.85rem' }}>{formatDate(payment.payment_date)}</td>

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

                            {/* Rent Month */}
                            <td>
                              <span className="badge bg-info text-dark">{fmtMonth(payment.payment_month)}</span>
                              {payment.installment_no && (
                                <div>
                                  <small className="text-muted">
                                    Inst {payment.installment_no}/{payment.total_installments}
                                  </small>
                                </div>
                              )}
                            </td>

                            {/* Amounts */}
                            <td>{formatCurrency(payment.gross_amount)}</td>
                            <td className="text-warning">{formatCurrency(payment.tds_amount)}</td>
                            <td className="fw-bold text-success">{formatCurrency(payment.net_payout)}</td>

                            {/* Status */}
                            <td>
                              <span className={`badge ${STATUS_CLS[payment.status] || 'bg-secondary'}`}>
                                {payment.status}
                              </span>
                            </td>

                            {/* Payout accounts inline */}
                            <td style={{ minWidth: 200 }}>
                              {entries && entries.length > 0 ? (
                                <div>
                                  {entries.map((sp, i) => (
                                    <div
                                      key={i}
                                      className="d-flex align-items-center gap-1 mb-1"
                                      style={{ fontSize: '0.76rem' }}
                                    >
                                      {/* Bubble */}
                                      <span
                                        className="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0"
                                        style={{
                                          width: 17, height: 17,
                                          background: '#dcfce7', color: '#16a34a',
                                          fontSize: '0.62rem', border: '1px solid #bbf7d0',
                                        }}
                                      >
                                        {i + 1}
                                      </span>

                                      {/* Holder name */}
                                      <span
                                        className="fw-semibold text-truncate"
                                        style={{ maxWidth: 80 }}
                                        title={sp.accountHolderName || `Account #${i + 1}`}
                                      >
                                        {sp.accountHolderName || `A/c #${i + 1}`}
                                      </span>

                                      {/* Percentage */}
                                      <span
                                        className="badge flex-shrink-0"
                                        style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.62rem' }}
                                      >
                                        {sp.percentage}%
                                      </span>

                                      {/* Amount */}
                                      <span
                                        className="fw-bold flex-shrink-0 text-success"
                                        style={{ fontSize: '0.76rem' }}
                                      >
                                        {formatCurrency(sp.amount)}
                                      </span>
                                    </div>
                                  ))}

                                  {hasMulti && (
                                    <button
                                      className="btn btn-sm btn-outline-success mt-1"
                                      style={{ fontSize: '0.68rem', padding: '1px 7px' }}
                                      onClick={() => setSplitModal(payment)}
                                    >
                                      <i className="bi bi-diagram-3 me-1" />Full Detail
                                    </button>
                                  )}
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
                                    style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                                    onClick={() => setSplitModal(payment)}
                                    title="View split detail"
                                  >
                                    <i className="bi bi-diagram-3" />
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  style={{ fontSize: '0.72rem', padding: '2px 7px' }}
                                  title="View receipt"
                                >
                                  <i className="bi bi-file-earmark-pdf" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* ── Expanded split sub-row ── */}
                          {isExpanded && entries && entries.length > 0 && (
                            <tr style={{ background: '#f0fdf4' }}>
                              <td colSpan={11} className="py-0">
                                <div className="px-4 pb-3 pt-2">
                                  <div
                                    className="fw-semibold mb-2"
                                    style={{ color: '#16a34a', fontSize: '0.82rem' }}
                                  >
                                    <i className="bi bi-diagram-3 me-1" />
                                    Payout Split for {payment.customer_name}
                                  </div>

                                  <div className="row g-2">
                                    {entries.map((sp, i) => (
                                      <div className="col-sm-6 col-lg-4 col-xl-3" key={i}>
                                        <div
                                          className="rounded-3 p-3 h-100"
                                          style={{ background: '#fff', border: '1.5px solid #bbf7d0' }}
                                        >
                                          {/* Card header */}
                                          <div className="d-flex justify-content-between align-items-center mb-2">
                                            <div className="d-flex align-items-center gap-2">
                                              <span
                                                className="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold"
                                                style={{ width: 22, height: 22, background: '#16a34a', color: '#fff', fontSize: '0.72rem' }}
                                              >
                                                {i + 1}
                                              </span>
                                              <span
                                                className="fw-semibold text-truncate"
                                                style={{ fontSize: '0.83rem', color: '#15803d', maxWidth: 110 }}
                                                title={sp.accountHolderName || `Account #${i + 1}`}
                                              >
                                                {sp.accountHolderName || `Account #${i + 1}`}
                                              </span>
                                            </div>
                                            <span
                                              className="badge flex-shrink-0"
                                              style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.68rem', fontWeight: 600 }}
                                            >
                                              {sp.percentage}%
                                            </span>
                                          </div>

                                          {/* Detail rows */}
                                          <div className="d-flex flex-column gap-1" style={{ fontSize: '0.75rem' }}>
                                            <div className="d-flex justify-content-between">
                                              <span className="text-muted">Account No</span>
                                              <span className="fw-semibold" style={{ fontFamily: 'monospace', letterSpacing: '0.3px' }}>
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
                                                <span className="fw-semibold text-truncate ms-2" style={{ maxWidth: 100 }}>
                                                  {sp.bankName}
                                                </span>
                                              </div>
                                            )}
                                            <div
                                              className="d-flex justify-content-between align-items-center mt-1 pt-1"
                                              style={{ borderTop: '1px dashed #bbf7d0' }}
                                            >
                                              <span className="text-muted fw-semibold">Amount</span>
                                              <span className="fw-bold text-success" style={{ fontSize: '0.9rem' }}>
                                                {formatCurrency(sp.amount)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Sub-row total */}
                                  {entries.length > 1 && (
                                    <div
                                      className="d-flex justify-content-end align-items-center gap-3 mt-2"
                                      style={{ fontSize: '0.8rem' }}
                                    >
                                      <span className="text-muted">
                                        Total across {entries.length} accounts:
                                      </span>
                                      <span className="fw-bold text-success">
                                        {formatCurrency(entries.reduce((s, sp) => s + sp.amount, 0))}
                                      </span>
                                      <button
                                        className="btn btn-sm btn-outline-success"
                                        style={{ fontSize: '0.7rem', padding: '2px 10px' }}
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

                  {/* Page totals footer */}
                  <tfoot className="table-secondary fw-bold">
                    <tr>
                      <td colSpan={5} className="text-end">Page Totals</td>
                      <td>{formatCurrency(pageGross)}</td>
                      <td className="text-warning">{formatCurrency(pageTds)}</td>
                      <td className="text-success">{formatCurrency(pageNet)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center px-3 py-3 border-top flex-wrap gap-2">
                <div className="text-muted small">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                </div>
                <nav>
                  <ul className="pagination mb-0 pagination-sm">
                    <li className={`page-item ${pagination.page === 1 ? 'disabled' : ''}`}>
                      <button
                        className="page-link"
                        onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                      >
                        Previous
                      </button>
                    </li>
                    {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <li key={pageNum} className={`page-item ${pagination.page === pageNum ? 'active' : ''}`}>
                          <button
                            className="page-link"
                            onClick={() => setPagination((p) => ({ ...p, page: pageNum }))}
                          >
                            {pageNum}
                          </button>
                        </li>
                      );
                    })}
                    <li className={`page-item ${pagination.page === pagination.totalPages ? 'disabled' : ''}`}>
                      <button
                        className="page-link"
                        onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                      >
                        Next
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </>
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

export default PaymentHistory;