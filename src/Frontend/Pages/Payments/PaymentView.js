import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import { formatCurrency, formatDate } from '../../Utils/helpers';

const fmtMonth = (m) => { if (!m) return '—'; try { return new Date(`${m}-01`).toLocaleString('default', { month: 'long', year: 'numeric' }); } catch { return m; } };
const fmtPaise = (v) => v ? formatCurrency(parseFloat(v) / 100) : '₹0';

const STATUS_CONFIG = {
  Completed:          { cls: 'bg-success',           label: 'Completed' },
  Processing:         { cls: 'bg-primary',           label: 'Processing' },
  Order_Created:      { cls: 'bg-info text-dark',    label: 'Order Created' },
  Authorized:         { cls: 'bg-info text-dark',    label: 'Authorized' },
  Failed:             { cls: 'bg-danger',            label: 'Failed' },
  Cancelled:          { cls: 'bg-secondary',         label: 'Cancelled' },
  Refunded:           { cls: 'bg-warning text-dark', label: 'Refunded' },
  Partially_Refunded: { cls: 'bg-warning text-dark', label: 'Partially Refunded' },
  Pending:            { cls: 'bg-warning text-dark', label: 'Pending' },
};

const StatusBadge = ({ status, size = '' }) => {
  const cfg = STATUS_CONFIG[status] || { cls: 'bg-secondary', label: status };
  return <span className={`badge ${cfg.cls} ${size}`}>{cfg.label}</span>;
};

const Row = ({ label, value, className = '', mono = false }) => (
  value || value === 0 ? (
    <div className="row border-bottom py-2 mx-0">
      <div className="col-5 text-muted small fw-semibold ps-0">{label}</div>
      <div className={`col-7 pe-0 ${className} ${mono ? 'font-monospace' : ''}`}>{value}</div>
    </div>
  ) : null
);

const SectionCard = ({ title, icon, color = 'primary', children }) => (
  <div className="card h-100 shadow-sm">
    <div className={`card-header bg-${color} text-white fw-semibold py-2`}>
      <i className={`bi bi-${icon} me-2`}></i>{title}
    </div>
    <div className="card-body py-2">{children}</div>
  </div>
);

// ─── GST helper ───────────────────────────────────────────────────────────────
const computeGst = (netPayout, p) => {
  const gstNo  = p.gst_no || null;
  const hasGst = !!gstNo;
  if (!hasGst) return { hasGst: false, cgstAmount: 0, sgstAmount: 0, totalGst: 0, netTransfer: netPayout };
  const cgstRate = parseFloat(p.cgst || 9);
  const sgstRate = parseFloat(p.sgst || 9);
  const cgstAmt  = parseFloat((netPayout * cgstRate / 100).toFixed(2));
  const sgstAmt  = parseFloat((netPayout * sgstRate / 100).toFixed(2));
  const totalGst = parseFloat((cgstAmt + sgstAmt).toFixed(2));
  return { hasGst: true, gstNo, cgstRate, sgstRate, cgstAmount: cgstAmt, sgstAmount: sgstAmt, totalGst, netTransfer: parseFloat((netPayout + totalGst).toFixed(2)) };
};

// ─── Easebuzz method label ─────────────────────────────────────────────────────
// razorpay_method column now stores Easebuzz payment_mode value
const methodLabel = (p) => {
  const m = p.razorpay_method; // stores easebuzz payment_mode
  if (!m) return p.payment_method || '—';
  const map = { credit_card: 'Credit Card', debit_card: 'Debit Card', nb: 'Net Banking', upi: 'UPI', wallet: 'Wallet', emi: 'EMI' };
  return map[m] || m;
};

const PaymentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [payment,      setPayment]      = useState(null);
  const [siblings,     setSiblings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [completing,   setCompleting]   = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [completeForm, setCompleteForm] = useState({ transactionReference: '', bankReference: '' });

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await paymentService.getPaymentById(id);
      const p   = res.data;
      setPayment(p);

      if (p?.customer_id && p?.payment_month) {
        try {
          const schedRes = await paymentService.getPaymentSchedule({ month: p.payment_month });
          const all = (schedRes.data || []).filter(
            (r) => String(r.customer_id) === String(p.customer_id)
          );
          setSiblings(all.length > 0 ? all : [p]);
        } catch {
          setSiblings([p]);
        }
      } else {
        setSiblings([p]);
      }
    } catch (err) {
      toast.error(err?.error || 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!completeForm.transactionReference.trim()) { toast.error('Transaction reference is required'); return; }
    try {
      setCompleting(true);
      await paymentService.completePayment(id, completeForm.transactionReference, completeForm.bankReference);
      toast.success('Payment marked as completed');
      setShowModal(false);
      load();
    } catch (err) { toast.error(err?.error || 'Failed to complete payment'); }
    finally { setCompleting(false); }
  };

  // ── Combined figures across all sibling installments ──────────────────────
  const combined = useMemo(() => {
    if (!siblings.length) return null;
    const gross = parseFloat(siblings.reduce((s, r) => s + parseFloat(r.gross_amount || 0), 0).toFixed(2));
    const tds   = parseFloat(siblings.reduce((s, r) => s + parseFloat(r.tds_amount   || 0), 0).toFixed(2));
    const net   = parseFloat(siblings.reduce((s, r) => s + parseFloat(r.net_payout   || 0), 0).toFixed(2));
    const gst   = computeGst(net, siblings[0]);
    return { gross, tds, net, ...gst, count: siblings.length };
  }, [siblings]);

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
      <div className="text-center">
        <div className="spinner-border text-primary mb-3"></div>
        <p className="text-muted">Loading payment details...</p>
      </div>
    </div>
  );

  if (!payment) return (
    <div className="container-fluid py-5 text-center">
      <i className="bi bi-exclamation-circle text-danger" style={{ fontSize: '3rem' }}></i>
      <p className="text-muted mt-3">Payment not found</p>
      <button className="btn btn-primary" onClick={() => navigate('/payments/schedule')}>Back to Schedule</button>
    </div>
  );

  // razorpay_payment_id column now stores easepayid
  const isEasebuzz = !!payment.razorpay_payment_id;
  // razorpay_order_id column stores our txnid
  const txnid      = payment.razorpay_order_id;
  const easepayid  = payment.razorpay_payment_id;

  const hasFailure = payment.status === 'Failed' && (payment.failure_reason || payment.failure_code);
  const hasRefund  = ['Refunded', 'Partially_Refunded'].includes(payment.status);
  const isMulti    = siblings.length > 1;
  const singleGst  = computeGst(parseFloat(payment.net_payout || 0), payment);

  return (
    <div className="container-fluid py-3">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-2">
        <div>
          <button className="btn btn-outline-secondary btn-sm mb-2" onClick={() => navigate(-1)}>
            <i className="bi bi-arrow-left me-1"></i>Back
          </button>
          <h5 className="mb-1">Payment Details</h5>
          <div className="text-muted small">
            Payment ID: <code className="text-dark fw-semibold">{payment.payment_id || payment.id}</code>
            {easepayid && (
              <span className="ms-2 badge bg-light text-dark border">
                <i className="bi bi-credit-card me-1"></i>Easebuzz: <code>{easepayid}</code>
              </span>
            )}
          </div>
        </div>
        <div className="d-flex flex-column align-items-end gap-2">
          <StatusBadge status={payment.status} size="fs-6 px-3 py-2" />
          {payment.status === 'Processing' && (
            <button className="btn btn-success btn-sm" onClick={() => setShowModal(true)}>
              <i className="bi bi-check-circle me-1"></i>Mark Completed
            </button>
          )}
        </div>
      </div>

      {/* ── Failure banner ──────────────────────────────────────────────────── */}
      {hasFailure && (
        <div className="alert alert-danger d-flex gap-2 mb-4">
          <i className="bi bi-x-octagon-fill fs-5"></i>
          <div><strong>Payment Failed.</strong> {payment.failure_reason || payment.failure_code}</div>
        </div>
      )}

      {/* ── Combined summary banner (multi-installment) ──────────────────────── */}
      {isMulti && combined && (
        <div className="alert alert-info mb-4">
          <div className="d-flex align-items-center gap-2 mb-2">
            <i className="bi bi-layers-fill fs-5"></i>
            <strong>
              {payment.customer_name} — {fmtMonth(payment.payment_month)} — {combined.count} installments combined
            </strong>
          </div>
          <div className="col-12">
            <div className="table-responsive">
              <table className="table table-sm table-bordered bg-white mb-2 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Inst</th><th>Gross</th><th>TDS</th><th>Net Rent</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {siblings.map((s) => (
                    <tr key={s.id} className={String(s.id) === String(id) ? 'table-warning' : ''}>
                      <td>
                        {s.installment_no ? `Inst ${s.installment_no}/${s.total_installments}` : <span className="text-muted">—</span>}
                        {String(s.id) === String(id) && (
                          <span className="ms-1 badge bg-warning text-dark small">viewing</span>
                        )}
                      </td>
                      <td>{formatCurrency(s.gross_amount)}</td>
                      <td className="text-warning">{formatCurrency(s.tds_amount)}</td>
                      <td>{formatCurrency(s.net_payout)}</td>
                      <td><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="fw-bold table-light">
                  <tr>
                    <td>Combined</td>
                    <td>{formatCurrency(combined.gross)}</td>
                    <td className="text-warning">{formatCurrency(combined.tds)}</td>
                    <td>{formatCurrency(combined.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="row g-3">

        {/* 1. Customer Details */}
        <div className="col-md-6">
          <SectionCard title="Customer Details" icon="person" color="primary">
            <Row label="Customer Name"  value={<strong>{payment.customer_name}</strong>} />
            <Row label="Customer Code"  value={payment.customer_code} mono />
            <Row label="Unit No"        value={payment.unit_no} />
            <Row label="Floor"          value={payment.floor_no ? `Floor ${payment.floor_no}` : null} />
            <Row label="Agreement Type" value={payment.agreement_type} />
            <Row label="Email"          value={payment.email} />
            <Row label="Phone"          value={payment.phone} />
            <Row label="PAN Number"     value={payment.pan_number} mono />
          </SectionCard>
        </div>

        {/* 2. Bank / GST Details */}
        <div className="col-md-6">
          <SectionCard title="Bank / Payment Details" icon="bank" color="info">
            <Row label="Bank Name"       value={payment.bank_name} />
            <Row label="Account Number"  value={payment.bank_account_number} mono />
            <Row label="IFSC Code"       value={payment.ifsc_code} mono />
            <Row label="TDS Applicable"  value={payment.tds_applicable === 'N' ? 'No (Exempt)' : 'Yes (Auto-threshold)'} />
            {payment.gst_no ? (
              <>
                <hr className="my-2" />
                <div className="text-muted small fw-semibold mb-1">GST DETAILS</div>
                <Row label="GST Number"
                  value={
                    <span>
                      <code className="text-success fw-semibold">{payment.gst_no}</code>
                      <span className="ms-2 badge bg-success">GST Registered</span>
                    </span>
                  }
                />
                <Row label="CGST Rate"      value={`${payment.cgst || 9}%`} />
                <Row label="SGST Rate"      value={`${payment.sgst || 9}%`} />
                <Row label="Total GST Rate" value={`${(parseFloat(payment.cgst || 9) + parseFloat(payment.sgst || 9))}% on Net Rent`} />
              </>
            ) : (
              <Row label="GST" value={<span className="text-muted">Not registered</span>} />
            )}
          </SectionCard>
        </div>

        {/* 3. Payment Calculation */}
        <div className="col-md-6">
          <SectionCard title="Payment Calculation" icon="currency-rupee" color="success">
            <Row label="Rent Month"   value={<span className="text-primary fw-semibold">{fmtMonth(payment.payment_month)}</span>} />
            <Row label="Period"       value={payment.payment_period} />
            <Row label="Payment Date" value={formatDate(payment.payment_date)} />
            <Row label="Scheduled"    value={formatDate(payment.scheduled_date)} />
            <Row label="Base Rent"    value={formatCurrency(payment.base_rent)} />
            <Row label="Escalation"   value={payment.escalation_rate > 0 ? `${payment.escalation_rate}%` : '0% (No escalation)'} />
            {payment.years_elapsed > 0 && <Row label="Years Elapsed" value={`${payment.years_elapsed} year(s)`} />}
            {isMulti
              ? <Row label="Installments" value={`${siblings.length} combined`} />
              : payment.installment_no && (
                  <>
                    <Row label="Installment" value={`${payment.installment_no} of ${payment.total_installments}`} />
                    {payment.installment_percentage && <Row label="Installment %" value={`${payment.installment_percentage}%`} />}
                  </>
                )
            }

            <hr className="my-2" />
            <div className="text-muted small fw-semibold mb-1">
              {isMulti ? 'COMBINED AMOUNTS' : 'AMOUNTS'}
            </div>
            <Row label="Gross Amount"
              value={<span className="fw-semibold">{formatCurrency(isMulti ? combined.gross : payment.gross_amount)}</span>}
            />
            <Row label="TDS (10%)"
              value={
                <span className="text-warning">
                  {(isMulti ? combined.tds : parseFloat(payment.tds_amount)) > 0
                    ? formatCurrency(isMulti ? combined.tds : payment.tds_amount)
                    : '₹0 (Not applicable)'}
                </span>
              }
            />
            <Row label="Net Rent (after TDS)"
              value={<span className="fw-semibold">{formatCurrency(isMulti ? combined.net : payment.net_payout)}</span>}
            />

            {(isMulti ? combined.hasGst : singleGst.hasGst) && (
              <>
                <hr className="my-2" />
                <div className="text-muted small fw-semibold mb-1">GST (on Net Rent)</div>
                {(() => {
                  const g = isMulti ? combined : singleGst;
                  return (
                    <>
                      <Row label={`CGST @ ${g.cgstRate}%`} value={<span className="text-info">{formatCurrency(g.cgstAmount)}</span>} />
                      <Row label={`SGST @ ${g.sgstRate}%`} value={<span className="text-info">{formatCurrency(g.sgstAmount)}</span>} />
                      <Row label={`Total GST (${g.cgstRate + g.sgstRate}%)`} value={<span className="text-info fw-semibold">{formatCurrency(g.totalGst)}</span>} />
                    </>
                  );
                })()}
              </>
            )}

            <hr className="my-2" />
            <Row
              label={(isMulti ? combined.hasGst : singleGst.hasGst) ? 'Net Bank Transfer (Net + GST)' : 'Net Bank Transfer'}
              value={<span className="fw-bold text-success fs-5">{formatCurrency(isMulti ? combined.netTransfer : singleGst.netTransfer)}</span>}
            />
          </SectionCard>
        </div>

        {/* 4. Transaction Details */}
        <div className="col-md-6">
          <SectionCard title="Transaction Details" icon="receipt" color="secondary">
            <Row label="Status"                 value={<StatusBadge status={payment.status} />} />
            <Row label="Transaction Reference"   value={payment.transaction_reference} mono />
            <Row label="Bank Reference"          value={payment.bank_reference}         mono />
            <Row label="Processed Date"          value={payment.processed_date  ? formatDate(payment.processed_date)  : null} />
            <Row label="Completed Date"          value={payment.completed_date  ? formatDate(payment.completed_date)  : null} />
            <Row label="Created At"              value={payment.created_at      ? formatDate(payment.created_at)      : null} />
          </SectionCard>
        </div>

        {/* 5. Easebuzz Payment Details */}
        {isEasebuzz && (
          <div className="col-12">
            <SectionCard title="Easebuzz Payment Details" icon="credit-card-2-front" color="dark">
              <div className="row g-0">
                <div className="col-md-4">
                  <div className="px-2">
                    <div className="text-muted small fw-semibold mb-2 mt-1">IDENTIFIERS</div>
                    {/* easepayid stored in razorpay_payment_id column */}
                    <Row label="Easebuzz Pay ID" value={easepayid}  mono />
                    {/* txnid stored in razorpay_order_id column */}
                    <Row label="Transaction ID"  value={txnid}      mono />
                    <Row label="Order Created"   value={payment.order_created_at ? formatDate(payment.order_created_at) : null} />
                  </div>
                </div>
                <div className="col-md-4 border-start">
                  <div className="px-2">
                    <div className="text-muted small fw-semibold mb-2 mt-1">PAYMENT METHOD</div>
                    {/* payment_mode stored in razorpay_method column */}
                    <Row label="Method"        value={methodLabel(payment)} />
                    <Row label="Payer Email"   value={payment.razorpay_email}   />
                    <Row label="Payer Contact" value={payment.razorpay_contact} />
                  </div>
                </div>
                <div className="col-md-4 border-start">
                  <div className="px-2">
                    <div className="text-muted small fw-semibold mb-2 mt-1">AMOUNT</div>
                    {/* amount in paise stored in razorpay_amount_paid column */}
                    <Row label="Amount Paid"  value={fmtPaise(payment.razorpay_amount_paid)} />
                    <Row label="Currency"     value={payment.razorpay_currency || 'INR'} />
                  </div>
                </div>
              </div>

              {hasRefund && (
                <div className="border-top mt-2 pt-2 px-2">
                  <div className="text-muted small fw-semibold mb-2">REFUND DETAILS</div>
                  <div className="row">
                    <div className="col-md-4">
                      <Row label="Refund Status"   value={payment.razorpay_refund_status} />
                      <Row label="Amount Refunded" value={fmtPaise(payment.razorpay_amount_refunded)} className="text-warning fw-semibold" />
                    </div>
                    <div className="col-md-4">
                      <Row label="Refund Reference" value={payment.refund_reference} mono />
                      <Row label="Refund Date"       value={payment.refund_date ? formatDate(payment.refund_date) : null} />
                    </div>
                  </div>
                </div>
              )}

              {hasFailure && (
                <div className="border-top mt-2 pt-2 px-2">
                  <div className="text-muted small fw-semibold mb-2">FAILURE DETAILS</div>
                  <div className="row">
                    <div className="col-md-6"><Row label="Failure Code"   value={payment.failure_code}   mono /></div>
                    <div className="col-md-6"><Row label="Failure Reason" value={payment.failure_reason} className="text-danger" /></div>
                  </div>
                </div>
              )}

              <div className="border-top mt-2 pt-2 px-2">
                <div className="text-muted small fw-semibold mb-1">SIGNATURE VERIFICATION</div>
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-shield-fill-check text-success fs-5"></i>
                  <span className="small text-success fw-semibold">SHA-512 Hash Verified</span>
                  {/* hash stored in razorpay_signature column */}
                  {payment.razorpay_signature && (
                    <code className="small text-muted text-truncate" style={{ maxWidth: 320 }}>
                      {payment.razorpay_signature}
                    </code>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        )}
      </div>

      {/* ── Bottom Actions ──────────────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-center mt-4 flex-wrap gap-2">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/payments/schedule')}>
          <i className="bi bi-arrow-left me-2"></i>Back to Schedule
        </button>
        <div className="d-flex gap-2 flex-wrap">
          {payment.status === 'Pending' && (
            <button className="btn btn-primary" onClick={() => navigate('/payments/initiate')}>
              <i className="bi bi-send me-2"></i>Go to Initiate Payments
            </button>
          )}
          {payment.status === 'Failed' && (
            <button className="btn btn-outline-warning" onClick={() => navigate('/payments/initiate')}>
              <i className="bi bi-arrow-repeat me-2"></i>Retry Payment
            </button>
          )}
          {payment.status === 'Processing' && (
            <button className="btn btn-success" onClick={() => setShowModal(true)}>
              <i className="bi bi-check-circle me-2"></i>Mark as Completed
            </button>
          )}
        </div>
      </div>

      {/* ── Manual Completion Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-check-circle me-2 text-success"></i>Mark as Completed
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} disabled={completing}></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info small mb-3">
                  Marking <strong>{formatCurrency(payment.net_payout)}</strong> to{' '}
                  <strong>{payment.customer_name}</strong> as completed.
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Transaction Reference <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control font-monospace"
                    placeholder="e.g. UTR123456789"
                    value={completeForm.transactionReference}
                    onChange={(e) => setCompleteForm((p) => ({ ...p, transactionReference: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="mb-1">
                  <label className="form-label fw-semibold">
                    Bank Reference <span className="text-muted">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control font-monospace"
                    placeholder="e.g. NEFT/IMPS reference"
                    value={completeForm.bankReference}
                    onChange={(e) => setCompleteForm((p) => ({ ...p, bankReference: e.target.value }))}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={() => setShowModal(false)} disabled={completing}>Cancel</button>
                <button className="btn btn-success" onClick={handleComplete} disabled={completing}>
                  {completing
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                    : <><i className="bi bi-check-circle me-2"></i>Confirm Completed</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentView;