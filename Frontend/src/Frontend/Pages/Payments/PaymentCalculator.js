import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import Select from 'react-select';
import customerService from '../../Services/customer.service';
import paymentService  from '../../Services/payment.service';
import {
  viewBreakdown,
  downloadBreakdown,
  printBreakdown,
  fmtINR,
  toFloat,
  toMonthLabel,
} from './PaymentBreakdownUtils';

/* ─── Pure helpers ────────────────────────────────────────────────────────── */
const getRentMonth = (dateStr) => {
  if (!dateStr) return '';
  const d    = new Date(dateStr);
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
};

const getRentMonthLabel = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });
};

const isBeforeStartMonth = (rentMonth, closureDateStr) => {
  if (!rentMonth || !closureDateStr) return false;
  const cd = new Date(closureDateStr);
  if (isNaN(cd.getTime())) return false;
  const cm = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}`;
  return rentMonth < cm;
};

/* ─── Razorpay / Easebuzz error helpers ───────────────────────────────────── */
const RAZORPAY_ERROR_MAP = {
  'INSUFFICIENT_FUNDS':        'Insufficient balance. Please add funds or use a different method.',
  'BAD_REQUEST_ERROR':         'Payment request was invalid. Please try again.',
  'GATEWAY_ERROR':             'Payment gateway error. Please retry after a few moments.',
  'SERVER_ERROR':              'Payment server error. Please try again shortly.',
  'PAYMENT_FAILED':            'Payment was not completed. Please try a different method.',
  'NETWORK_ERROR':             'Network lost during payment. Please check internet and retry.',
  'TRANSACTION_NOT_PERMITTED': 'Transaction not permitted for your account. Contact your bank.',
  'CARD_NOT_SUPPORTED':        'Your card is not supported. Try another card or method.',
  'EXPIRED_CARD':              'Your card has expired. Please use a valid card.',
  'INVALID_CARD':              'Invalid card details. Please re-enter your information.',
  'CVV_MISMATCH':              'CVV entered is incorrect. Please check your card details.',
};

export const getRazorpayErrorMessage = (error) => {
  if (!error) return 'Payment failed. Please try again.';
  const code   = error.code   || error.error?.code   || '';
  const desc   = error.description || error.error?.description || error.message || '';
  const descLC = desc.toLowerCase();
  if (code === 'INSUFFICIENT_FUNDS' || descLC.includes('insufficient'))
    return '💳 Insufficient balance. Please add funds or choose a different payment method and retry.';
  if (RAZORPAY_ERROR_MAP[code]) return RAZORPAY_ERROR_MAP[code];
  return desc || 'Payment failed. Please try again.';
};

/* ─── Adjustment split helper ─────────────────────────────────────────────── */
const computeAdjustedSplits = (adjustedNet, splits) => {
  if (!Array.isArray(splits) || !splits.length || adjustedNet <= 0) return null;
  let remaining = Math.round(adjustedNet);
  return splits.map((sp, i) => {
    const isLast = i === splits.length - 1;
    const pct    = parseFloat(sp.percentage) || 0;
    const amount = isLast ? remaining : Math.round(adjustedNet * pct / 100);
    remaining   -= amount;
    return { ...sp, amount, pct };
  });
};

/* ─── Sub-components ──────────────────────────────────────────────────────── */
const InfoRow = ({ label, value, badge }) => (
  <div className="d-flex justify-content-between align-items-center py-1 border-bottom border-light">
    <span className="text-muted small">{label}</span>
    {badge ?? <strong className="small">{value}</strong>}
  </div>
);

const SummaryRow = ({ label, value, cls = '', last = false, indent = false, highlight = false }) => (
  <div className={`d-flex justify-content-between align-items-center py-2
    ${last ? '' : 'border-bottom'} ${indent ? 'ps-3' : ''}
    ${highlight ? 'bg-warning bg-opacity-10 px-2 rounded' : ''}`}>
    <span className={`${last ? 'fw-semibold' : 'text-muted small'} ${indent ? 'fst-italic' : ''}`}>{label}</span>
    <strong className={cls}>{value}</strong>
  </div>
);

const TdsInfoBox = ({ tdsExempt, tdsAutoMode, tdsApplied, tdsAmount, tdsRate, grossAmount, tdsThreshold = 50000, isPartial = false }) => {
  if (tdsExempt) return (
    <div className="alert alert-secondary border-secondary py-2 small mb-2">
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-slash-circle text-secondary" />
        <div><strong>TDS Exempt</strong> — Marked Not Applicable (N). No TDS deducted.</div>
      </div>
    </div>
  );
  if (tdsApplied) return (
    <div className="alert alert-warning border-warning py-2 small mb-2">
      <div className="d-flex align-items-start gap-2">
        <i className="bi bi-exclamation-triangle-fill text-warning flex-shrink-0 mt-1" />
        <div>
          <strong>TDS @ {tdsRate}% Auto-Applied</strong>
          {isPartial && <span className="ms-1 badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>Combined ≥ ₹{tdsThreshold.toLocaleString('en-IN')}</span>}
          {tdsAutoMode && <span className="ms-1 badge bg-info text-white" style={{ fontSize: '0.6rem' }}>AUTO</span>}
          <div className="text-muted mt-1">
            {isPartial
              ? `Combined gross ₹${fmtINR(grossAmount)} ≥ ₹${tdsThreshold.toLocaleString('en-IN')} → TDS = ${tdsRate}% × ₹${fmtINR(grossAmount)} = ₹${fmtINR(tdsAmount)}`
              : `Gross ₹${fmtINR(grossAmount)} ≥ ₹${tdsThreshold.toLocaleString('en-IN')} → TDS = ₹${fmtINR(tdsAmount)}`}
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <div className="alert alert-success border-success py-2 small mb-2">
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-check-circle-fill text-success" />
        <div>
          <strong>No TDS</strong>
          {tdsAutoMode && <span className="ms-1 badge bg-success" style={{ fontSize: '0.6rem' }}>AUTO — This Month</span>}
          {isPartial
            ? ` — Combined gross ₹${fmtINR(grossAmount)} < ₹${tdsThreshold.toLocaleString('en-IN')}`
            : ` — Rent ₹${fmtINR(grossAmount)} < ₹${tdsThreshold.toLocaleString('en-IN')}`}
        </div>
      </div>
    </div>
  );
};

const GstInfoBox = ({ hasGst, gstNo, cgstRate, sgstRate, totalGstRate, cgstAmount, sgstAmount, totalGstAmount, netAmount }) => {
  if (!hasGst) return (
    <div className="alert alert-secondary border-secondary-subtle py-2 small mb-2">
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-receipt text-secondary" />
        <span><strong>No GST</strong> — Customer does not have a GST number</span>
      </div>
    </div>
  );
  return (
    <div className="alert alert-info border-info py-2 small mb-2">
      <div className="d-flex align-items-start gap-2">
        <i className="bi bi-receipt-cutoff text-info flex-shrink-0 mt-1" />
        <div className="w-100">
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <strong>GST @ {totalGstRate}% on Net Rent (after TDS)</strong>
            <span className="badge bg-info text-white" style={{ fontSize: '0.6rem' }}>GSTIN: {gstNo}</span>
          </div>
          <div className="text-muted mb-1" style={{ fontSize: '0.7rem' }}>GST base = Net Rent after TDS = ₹{fmtINR(netAmount)}</div>
          <div className="row g-2 mt-1">
            {[
              { lbl: `CGST @ ${cgstRate}%`, val: cgstAmount },
              { lbl: `SGST @ ${sgstRate}%`, val: sgstAmount },
              { lbl: 'Total GST',           val: totalGstAmount },
            ].map(({ lbl, val }) => (
              <div className="col-auto" key={lbl}>
                <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>{lbl}</div>
                <strong className="text-info">₹{fmtINR(val)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const TotalPayableCard = ({
  grossAmount, tdsAmount, tdsApplied, tdsExempt,
  cgstAmount, sgstAmount, totalGstAmount,
  hasGst, cgstRate, sgstRate, totalGstRate,
  netPayout, netBankTransfer, totalInvoice, rentMonth, isPartial = false,
}) => (
  <div className="card border-0 mt-3" style={{ background: 'linear-gradient(135deg,#1e3a5f,#1e4976)' }}>
    <div className="card-body p-3 text-white">
      <div className="fw-bold small text-uppercase mb-3" style={{ opacity: 0.75 }}>
        <i className="bi bi-calculator-fill me-1" />Total Payable Summary — {toMonthLabel(rentMonth) || rentMonth}
      </div>
      {[
        { label: `Gross Rent${isPartial ? ' (Combined)' : ''}`, value: `₹${fmtINR(grossAmount)}`, cls: '' },
        { label: `− TDS @ 10% ${tdsExempt ? '(Exempt)' : !tdsApplied ? '(Below ₹50k)' : ''}`, value: tdsApplied ? `−₹${fmtINR(tdsAmount)}` : '₹0.00', cls: tdsApplied ? 'text-danger' : 'text-muted' },
        { label: 'Net Rent (after TDS)', value: `₹${fmtINR(netPayout)}`, cls: 'text-white' },
        ...(hasGst ? [
          { label: `+ CGST @ ${cgstRate}% (on Net Rent)`, value: `+₹${fmtINR(cgstAmount)}`, cls: 'text-info' },
          { label: `+ SGST @ ${sgstRate}% (on Net Rent)`, value: `+₹${fmtINR(sgstAmount)}`, cls: 'text-info' },
        ] : []),
        { label: `Total Invoice ${hasGst ? `(Net + ${totalGstRate}% GST)` : '(= Net Rent)'}`, value: `₹${fmtINR(totalInvoice)}`, cls: 'text-warning' },
      ].map(({ label, value, cls }) => (
        <div key={label} className="d-flex justify-content-between py-1 border-bottom border-secondary">
          <span style={{ opacity: 0.75, fontSize: '0.85rem' }}>{label}</span>
          <strong className={cls}>{value}</strong>
        </div>
      ))}
      <div className="d-flex justify-content-between align-items-center py-2 mt-1">
        <div>
          <span className="fw-bold">Net Bank Transfer</span>
          <div style={{ fontSize: '0.65rem', opacity: 0.75 }}>
            {hasGst ? 'Net Rent + GST' : 'Net Rent (after TDS)'}
          </div>
        </div>
        <h4 className="text-success mb-0 fw-bold">₹{fmtINR(netBankTransfer)}</h4>
      </div>
    </div>
  </div>
);

const RazorpayErrorAlert = ({ error, onDismiss }) => {
  if (!error) return null;
  const isInsuf = error.code === 'INSUFFICIENT_FUNDS' || (error.description || '').toLowerCase().includes('insufficient');
  return (
    <div className={`alert ${isInsuf ? 'alert-danger' : 'alert-warning'} border mt-3`}>
      <div className="d-flex align-items-start gap-2">
        <i className={`bi ${isInsuf ? 'bi-wallet2' : 'bi-exclamation-triangle-fill'} fs-5 flex-shrink-0 mt-1`} />
        <div className="flex-grow-1">
          <strong>{isInsuf ? '💳 Insufficient Balance' : 'Payment Failed'}</strong>
          <p className="mb-2 mt-1 small">{getRazorpayErrorMessage(error)}</p>
        </div>
        <button type="button" className="btn-close btn-sm" onClick={onDismiss} />
      </div>
    </div>
  );
};

const SavedPaymentBanner = ({ record, onDismiss }) => {
  if (!record) return null;
  const adj = parseFloat(record.adjustment_amount) || 0;
  return (
    <div className="alert alert-success border-success mt-3 mb-0" style={{ borderLeft: '4px solid #16a34a' }}>
      <div className="d-flex align-items-start gap-2">
        <i className="bi bi-check-circle-fill text-success fs-5 flex-shrink-0 mt-1" />
        <div className="flex-grow-1">
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <strong>Payment Saved in Database</strong>
            <span className="badge bg-success" style={{ fontSize: '0.65rem' }}>ID: {record.id}</span>
            <span className={`badge ${record.status === 'Completed' ? 'bg-success' : record.status === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary'}`}
              style={{ fontSize: '0.65rem' }}>{record.status}</span>
          </div>
          <div className="row g-2 small">
            <div className="col-auto"><span className="text-muted">Gross:</span> <strong>₹{fmtINR(record.gross_amount)}</strong></div>
            <div className="col-auto"><span className="text-muted">TDS:</span> <strong className="text-danger">₹{fmtINR(record.tds_amount)}</strong></div>
            <div className="col-auto"><span className="text-muted">Net Payout:</span> <strong className="text-primary">₹{fmtINR(record.net_payout)}</strong></div>
            {adj !== 0 && (
              <div className="col-auto">
                <span className="text-muted">Adjustment:</span>{' '}
                <strong className={adj > 0 ? 'text-success' : 'text-danger'}>{adj > 0 ? '+' : ''}₹{fmtINR(adj)}</strong>
              </div>
            )}
          </div>
        </div>
        {onDismiss && <button type="button" className="btn-close btn-sm" onClick={onDismiss} />}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Adjustment Section                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
const AdjustmentSection = ({
  calculation, derived,
  adjustmentAmount, setAdjustmentAmount,
  adjustmentNote,   setAdjustmentNote,
  onSave, saving, savedRecord, existingRecord,
}) => {
  if (!calculation || !derived) return null;
  const baseNet = derived.isAnyPartial ? (derived.pTotals?.net ?? 0) : derived.netPayout;
  if (!baseNet) return null;

  const adj         = parseFloat(adjustmentAmount) || 0;
  const adjustedNet = Math.round(baseNet + adj);
  const { hasGst, cgstRate, sgstRate, gstNo } = derived.gstProps;
  const adjCgst        = hasGst ? Math.round(adjustedNet * cgstRate / 100) : 0;
  const adjSgst        = hasGst ? Math.round(adjustedNet * sgstRate / 100) : 0;
  const adjNetTransfer = adjustedNet + adjCgst + adjSgst;

  const splits         = calculation.payoutSplits;
  const hasSplits      = Array.isArray(splits) && splits.length > 0;
  const adjustedSplits = hasSplits ? computeAdjustedSplits(adjustedNet, splits) : null;
  const alreadySaved   = !!existingRecord;
  const SLOT_COLORS    = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed'];

  return (
    <div className="card border-0 shadow-sm mt-3" style={{ borderTop: '3px solid #4f46e5' }}>
      <div className="card-header py-3 d-flex align-items-center justify-content-between"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
        <h6 className="mb-0 fw-semibold text-white">
          <i className="bi bi-sliders me-2" />Adjustment &amp; Payout Split
        </h6>
        {adj !== 0 && (
          <span className={`badge ${adj > 0 ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: '0.75rem' }}>
            {adj > 0 ? '+' : ''}₹{fmtINR(adj)} applied
          </span>
        )}
      </div>
      <div className="card-body p-4">
        {existingRecord && <SavedPaymentBanner record={existingRecord} />}
        {savedRecord && !existingRecord && (
          <div className="alert alert-success d-flex align-items-center gap-2 mb-3 py-2">
            <i className="bi bi-check-circle-fill text-success" />
            <div><strong>Saved!</strong> Payment record created.
              <span className="ms-2 badge bg-success" style={{ fontSize: '0.65rem' }}>ID: {savedRecord.id || savedRecord}</span>
            </div>
          </div>
        )}
        {existingRecord && existingRecord.status !== 'Cancelled' && (
          <div className="alert alert-warning py-2 small mt-3 mb-3">
            <i className="bi bi-exclamation-triangle me-1" />
            A <strong>{existingRecord.status}</strong> payment already exists for this month.
          </div>
        )}

        <div className="mb-3 mt-3">
          <label className="form-label fw-semibold small text-uppercase text-muted">Adjustment Amount (₹)</label>
          <div className="input-group input-group-sm">
            <span className="input-group-text">₹</span>
            <input
              type="number" className="form-control" placeholder="0"
              value={adjustmentAmount}
              onChange={(e) => setAdjustmentAmount(e.target.value)}
              onWheel={(e) => e.target.blur()}
              style={{ fontSize: '1rem', fontWeight: 600 }}
            />
            {adj !== 0 && (
              <button className="btn btn-outline-secondary" onClick={() => { setAdjustmentAmount(''); setAdjustmentNote(''); }}>
                <i className="bi bi-x" />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label fw-semibold small text-uppercase text-muted">Note / Reason (optional)</label>
          <input
            type="text" className="form-control form-control-sm"
            placeholder="e.g. Jan shortfall recovery…"
            value={adjustmentNote}
            onChange={(e) => setAdjustmentNote(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="card border-0 rounded-3 mb-4" style={{ background: '#f8fafc' }}>
          <div className="card-body p-3">
            <div className="text-muted small fw-bold text-uppercase mb-2">Net Rent Calculation</div>
            <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
              <span className="small fw-semibold">Original Net Rent (after TDS)</span>
              <strong className="text-primary">₹{fmtINR(baseNet)}</strong>
            </div>
            <div className={`d-flex justify-content-between align-items-center py-2 border-bottom ${adj === 0 ? 'opacity-50' : ''}`}>
              <span className={`small fw-semibold ${adj > 0 ? 'text-success' : adj < 0 ? 'text-danger' : 'text-muted'}`}>
                {adj > 0 ? '+ Shortfall Recovery' : adj < 0 ? '− Advance Deduction' : 'No Adjustment'}
              </span>
              <strong className={adj > 0 ? 'text-success' : adj < 0 ? 'text-danger' : 'text-muted'}>
                {adj >= 0 ? '+' : ''}₹{fmtINR(adj)}
              </strong>
            </div>
            <div className="d-flex justify-content-between align-items-center py-2" style={{ borderTop: '2px solid #c7d2fe' }}>
              <span className="fw-bold">Adjusted Net Rent</span>
              <h5 className={`mb-0 fw-bold ${adjustedNet < 0 ? 'text-danger' : 'text-primary'}`}>
                ₹{fmtINR(adjustedNet)}
              </h5>
            </div>
          </div>
        </div>

        {hasSplits && adjustedSplits && (
          <div className="mb-4">
            <div className="text-muted small fw-bold text-uppercase mb-3">
              Payout Split — Adjusted Net ₹{fmtINR(adjustedNet)}
            </div>
            {adjustedSplits.map((sp, i) => {
              const color = SLOT_COLORS[i % SLOT_COLORS.length];
              return (
                <div key={i} className="card border-0 shadow-sm mb-2" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="card-body py-3 px-3">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                          <span className="badge text-white" style={{ background: color, fontSize: '0.65rem' }}>Split {i + 1}</span>
                          <span className="fw-semibold small">{sp.accountHolderName || `Account ${i + 1}`}</span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          {[sp.bankName, sp.bankAccountNumber ? `A/C …${String(sp.bankAccountNumber).slice(-4)}` : null, sp.ifscCode].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-end ms-3 flex-shrink-0">
                        <div className="fw-bold" style={{ color, fontSize: '1.1rem' }}>₹{fmtINR(sp.amount)}</div>
                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>{sp.pct}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-top pt-3">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="small text-muted">
              <i className="bi bi-floppy me-1" />
              Saves a <strong>Pending</strong> payment record with the adjusted amount.
            </div>
            <button
              className="btn btn-primary fw-semibold"
              onClick={onSave}
              disabled={saving || adjustedNet <= 0 || alreadySaved}
              style={{ minWidth: 160 }}
            >
              {saving
                ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</>
                : alreadySaved
                  ? <><i className="bi bi-check-circle me-2" />Already Saved</>
                  : <><i className="bi bi-floppy me-2" />Save to Database</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */
const PaymentCalculator = () => {
  // customers state holds customer_units rows (id = customer_unit.id)
  const [customers,        setCustomers]        = useState([]);
  const [selectedId,       setSelectedId]       = useState('');      // customer_unit.id
  const [selectedOption,   setSelectedOption]   = useState(null);    // react-select option
  const [paymentDate,      setPaymentDate]       = useState(new Date().toISOString().split('T')[0]);
  const [calculation,      setCalculation]      = useState(null);
  const [loading,          setLoading]          = useState(false);
  const [pdfLoading,       setPdfLoading]       = useState(false);
  const [showBreakdown,    setShowBreakdown]    = useState(false);
  const [startDateAlert,   setStartDateAlert]   = useState(null);
  const [razorpayError,    setRazorpayError]    = useState(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNote,   setAdjustmentNote]   = useState('');
  const [saving,           setSaving]           = useState(false);
  const [savedRecord,      setSavedRecord]      = useState(null);
  const [existingRecord,   setExistingRecord]   = useState(null);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      // getAllCustomers now returns customer_units rows joined with customer identity
      const r = await customerService.getAllCustomers({ status: 'Active', limit: 1000 });
      setCustomers(r.data.customers || []);
    } catch {
      toast.error('Failed to load customers');
    }
  };

  /* ── Build react-select options ──
     value  = customer_unit.id  (used as customerUnitId in calculatePayment)
     label  = searchable text
  ── */
  const customerOptions = useMemo(() =>
    customers.map((c) => ({
      value:    c.id,                         // customer_unit.id
      label:    `${c.customer_name} · ${c.customer_ref || c.customer_id} · F${c.floor_no || '?'} U${c.unit_no || '?'} · ${c.agreement_type}`,
      customer: c,
    })), [customers]);

  /* Custom filter — search by name, ID, unit, floor, PAN */
  const filterCustomerOption = useCallback((option, inputValue) => {
    if (!inputValue) return true;
    const q = inputValue.toLowerCase();
    const c = option.data?.customer;
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

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      borderColor: state.isFocused ? '#86b7fe' : '#ced4da',
      boxShadow:   state.isFocused ? '0 0 0 0.25rem rgba(13,110,253,.25)' : 'none',
      minHeight: 34,
    }),
    menu: (base) => ({ ...base, zIndex: 9999 }),
    option: (base, { isFocused, isSelected }) => ({
      ...base,
      backgroundColor: isSelected ? '#0d6efd' : isFocused ? '#f0f4ff' : '#fff',
      color: isSelected ? '#fff' : '#212529',
      fontSize: '0.85rem',
      padding: '8px 12px',
    }),
  };

  /* ── Fetch existing DB record for this unit+month ── */
  const fetchExistingRecord = useCallback(async (dbCustomerId, rentMonth) => {
    if (!dbCustomerId || !rentMonth) return;
    try {
      const res = await paymentService.getPaymentByMonth(dbCustomerId, rentMonth);
      const rec = res?.data;
      if (rec) {
        setExistingRecord(rec);
        const savedAdj = parseFloat(rec.adjustment_amount) || 0;
        if (savedAdj !== 0) setAdjustmentAmount(String(savedAdj));
        if (rec.adjustment_note) {
          const pipeIdx   = rec.adjustment_note.lastIndexOf(' | Adjustment:');
          const cleanNote = pipeIdx > -1
            ? rec.adjustment_note.slice(0, pipeIdx).trim()
            : rec.adjustment_note.trim();
          if (cleanNote && !cleanNote.startsWith('Adjustment:'))
            setAdjustmentNote(cleanNote);
        }
      } else {
        setExistingRecord(null);
      }
    } catch {
      setExistingRecord(null);
    }
  }, []);

  const resetAll = () => {
    setAdjustmentAmount('');
    setAdjustmentNote('');
    setSavedRecord(null);
    setExistingRecord(null);
  };

  /* ── Calculation ──
     KEY FIX: pass customerUnitId (customer_unit.id) to calculatePayment.
     The backend now resolves the correct sqft, agreement_type, payment_closure_date
     etc. from customer_units + financial_records WHERE customer_unit_id = $unitId.
     This is what fixes the prorated rent issue — previously the wrong/missing
     payment_closure_date was causing full rent to show instead of prorated.
  ── */
  const doCalculate = useCallback(async (unitId, date) => {
    setStartDateAlert(null);
    setCalculation(null);
    setRazorpayError(null);
    resetAll();

    const unitRow   = customers.find((c) => c.id === unitId);
    const rentMonth = getRentMonth(date);

    // Check start month using unit's financial data (if available)
    if (
      unitRow?.payment_mode !== 'partial' &&
      unitRow?.payment_closure_date &&
      isBeforeStartMonth(rentMonth, unitRow.payment_closure_date)
    ) {
      const cd         = new Date(unitRow.payment_closure_date);
      const startMonth = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}`;
      setStartDateAlert({
        startDate: unitRow.payment_closure_date,
        startMonth,
        startMonthLabel: toMonthLabel(startMonth),
        rentMonth,
        customerName: unitRow.customer_name,
      });
      return;
    }

    try {
      setLoading(true);
      // Pass customerUnitId — backend does unit-based lookup for correct prorated calc
      const result = await paymentService.calculatePayment(null, date, unitId);
      setCalculation(result);
      // Use dbCustomerId from result (customers.id) for existing record lookup
      const dbCustId = result.dbCustomerId || result.customerId;
      if (dbCustId) fetchExistingRecord(dbCustId, result.rentMonth || rentMonth);
    } catch (err) {
      const errData = err?.response?.data || err || {};
      if (errData.code === 'PAYMENT_NOT_STARTED' || errData.startMonth) {
        setStartDateAlert({
          startDate:       errData.startDate       || null,
          startMonth:      errData.startMonth      || null,
          startMonthLabel: errData.startMonthLabel || toMonthLabel(errData.startMonth) || '',
          rentMonth:       errData.rentMonth       || rentMonth,
          customerName:    errData.customerName    || unitRow?.customer_name || '',
        });
      } else {
        toast.error(errData.error || 'Unable to calculate payment. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [customers, fetchExistingRecord]);

  /* ── Customer selection via react-select ── */
  const handleCustomerSelect = (option) => {
    setSelectedOption(option);
    setCalculation(null);
    setStartDateAlert(null);
    setShowBreakdown(false);
    setRazorpayError(null);
    resetAll();
    if (!option) { setSelectedId(''); return; }
    setSelectedId(option.value);
    doCalculate(option.value, paymentDate);
  };

  const handleDateChange = (date) => {
    setPaymentDate(date);
    setStartDateAlert(null);
    setRazorpayError(null);
    resetAll();
    if (selectedId) doCalculate(selectedId, date);
  };

  /* ── Save adjustment ── */
  const handleSaveAdjustment = async () => {
    if (!calculation || !selectedId) return;
    const adj         = parseFloat(adjustmentAmount) || 0;
    const baseNet     = derived?.isAnyPartial ? (derived.pTotals?.net ?? 0) : derived?.netPayout ?? 0;
    const adjustedNet = Math.round(baseNet + adj);

    if (adjustedNet <= 0) { toast.error('Adjusted net must be greater than 0.'); return; }

    try {
      setSaving(true);
      const splits  = calculation.payoutSplits;
      const splitBD = Array.isArray(splits) && splits.length > 0
        ? computeAdjustedSplits(adjustedNet, splits)
        : null;

      // Use dbCustomerId (customers.id) for the payment record
      const dbCustomerId = calculation.dbCustomerId || calculation.customerId;

      const payload = {
        customerId:        dbCustomerId,
        paymentDate,
        rentMonth:         calculation.rentMonth,
        grossAmount:       derived.isAnyPartial ? derived.pTotals.gross : derived.grossAmount,
        tdsAmount:         derived.isAnyPartial ? derived.pTotals.tds   : derived.tdsAmount,
        originalNetPayout: baseNet,
        adjustmentAmount:  adj,
        adjustedNetPayout: adjustedNet,
        adjustmentNote:    adjustmentNote || null,
        payoutSplits:      splits || null,
        payoutBreakdown:   splitBD,
      };

      const result = await paymentService.savePaymentWithAdjustment(payload);
      const savedData = result?.data?.data || result?.data || {};
      setSavedRecord(savedData);
      await fetchExistingRecord(dbCustomerId, calculation.rentMonth);
      toast.success('Payment saved with adjustment!');
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save payment.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived values ── */
  const derived = useMemo(() => {
    if (!calculation) return null;
    const {
      paymentMode, partialSubType, grossAmount, tdsAmount, netPayout,
      tdsApplied, tdsExempt, tdsAutoMode,
      tdsRate = 10, tdsThreshold = 50000,
      escalationRate = 0, yearsElapsed = 0,
      hasGst = false, gstNo = '', cgstRate = 9, sgstRate = 9,
      totalGstRate = 18, cgstAmount = 0, sgstAmount = 0,
      totalGstAmount = 0, totalInvoice = 0, netBankTransfer = 0,
      rentCalculationDetails: d = {},
    } = calculation;

    const instBD       = Array.isArray(calculation.installmentBreakdown) ? calculation.installmentBreakdown : [];
    const isFullMode   = paymentMode === 'full';
    const isPartialFin = paymentMode === 'partial' && partialSubType === 'financial';
    const isPartialInst = paymentMode === 'partial' && partialSubType === 'installment';
    const isUncfg      = paymentMode === 'partial_unconfigured';
    const isAnyPartial = isPartialFin || isPartialInst;
    const hasEscalation = escalationRate > 0;

    const pGross = Math.round(instBD.reduce((s, i) => s + toFloat(i.gross_amount ?? 0), 0));
    const pTds   = isPartialFin
      ? Math.round(tdsAmount)
      : Math.round(instBD.reduce((s, i) => s + toFloat(i.tds_amount ?? 0), 0));
    const pNet   = Math.round(pGross - pTds);
    const pTotals = isAnyPartial ? {
      base:       Math.round(instBD.reduce((s, i) => s + toFloat(i.base_rent ?? 0), 0)),
      escalation: Math.round(instBD.reduce((s, i) => s + toFloat(i.escalation_amount ?? 0), 0)),
      gross: pGross, tds: pTds, net: pNet,
    } : null;

    const netAfterTds = isAnyPartial ? pNet : Math.round(toFloat(netPayout));
    const gstProps = {
      hasGst, gstNo, cgstRate, sgstRate, totalGstRate,
      cgstAmount:     Math.round(cgstAmount),
      sgstAmount:     Math.round(sgstAmount),
      totalGstAmount: Math.round(totalGstAmount),
      netAmount:      netAfterTds,
    };
    const tdsProps = { tdsExempt, tdsAutoMode, tdsApplied, tdsThreshold };

    return {
      isFullMode, isPartialFin, isPartialInst, isUncfg, isAnyPartial, hasEscalation,
      instBD, pTotals, netAfterTds, gstProps, tdsProps,
      grossAmount:     Math.round(toFloat(grossAmount)),
      tdsAmount:       Math.round(toFloat(tdsAmount)),
      netPayout:       Math.round(toFloat(netPayout)),
      netBankTransfer: Math.round(toFloat(netBankTransfer)),
      totalInvoice:    Math.round(toFloat(totalInvoice)),
      tdsRate, escalationRate,
      yearsElapsed: Math.round(toFloat(yearsElapsed)),
      d,
    };
  }, [calculation]);

  /* ── Breakdown actions ── */
  const breakdownPayload = useMemo(() => ({ calculation, paymentDate }), [calculation, paymentDate]);
  const handleView     = () => viewBreakdown(breakdownPayload);
  const handleDownload = async () => {
    if (pdfLoading) return;
    try {
      await downloadBreakdown(breakdownPayload, (stage) => {
        if (stage === 'loading')   { setPdfLoading(true);  toast.info('Loading PDF engine…',   { toastId: 'pdf-progress', autoClose: false }); }
        if (stage === 'rendering') { toast.update('pdf-progress', { render: 'Generating PDF…' }); }
        if (stage === 'done')      { setPdfLoading(false); toast.update('pdf-progress', { render: '✅ PDF downloaded!', type: 'success', autoClose: 3000 }); }
        if (stage === 'error')     { setPdfLoading(false); }
      });
    } catch { toast.error('PDF generation failed.', { toastId: 'pdf-progress', autoClose: 4000 }); }
  };
  const handlePrint = () => printBreakdown(breakdownPayload);

  /* ── Badge helpers ── */
  const agreementBadge = (t) =>
    t === 'Construction'
      ? <span className="badge bg-warning text-dark"><i className="bi bi-building me-1" />Construction</span>
      : <span className="badge bg-success"><i className="bi bi-calendar3 me-1" />9-Year</span>;

  const modeBadge = (mode, sub) => {
    if (mode === 'partial' && sub === 'financial')   return <span className="badge bg-info text-white">Partial (Financial)</span>;
    if (mode === 'partial' && sub === 'installment') return <span className="badge bg-info text-white">Partial (Instalment)</span>;
    if (mode === 'partial_unconfigured')             return <span className="badge bg-warning text-dark">Partial (unconfigured)</span>;
    return <span className="badge bg-primary">Full Payment</span>;
  };

  const escalationBadge = (rate, floor) => {
    if (String(floor) !== '7') return <span className="badge bg-secondary">No Escalation</span>;
    const map = { 0: ['bg-secondary','0%'], 15: ['bg-info text-white','15%'], 32.25: ['bg-danger','32.25%'] };
    const [cls, label] = map[rate] || ['bg-primary', `${rate}%`];
    return <span className={`badge ${cls}`}>{label} Escalation</span>;
  };

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="bg-light min-vh-100 py-4 px-3">
      <div className="mb-4">
        <h4 className="fw-bold mb-1">
          <i className="bi bi-calculator text-primary me-2" />Payment Calculator
        </h4>
        <small className="text-muted">
          Select a customer/unit and date to calculate monthly rent, TDS, GST, and payout split
        </small>
      </div>

      <div className="alert alert-primary d-flex gap-3 align-items-start mb-4">
        <i className="bi bi-lightbulb-fill fs-5 text-primary flex-shrink-0 mt-1" />
        <div>
          <strong>Calculation Rules</strong>
          <ul className="mb-0 mt-1 small">
            <li><strong>Rent:</strong> Rounded to nearest whole rupee using Math.round.</li>
            <li><strong>Prorated:</strong> Applied only in the first (closure) month. Payment date triggers previous month's rent.</li>
            <li><strong>TDS (Auto):</strong> 10% when gross ≥ ₹50,000 for the month.</li>
            <li><strong>GST:</strong> CGST + SGST on <strong>Net Rent after TDS</strong>.</li>
            <li><strong>Net Bank Transfer = Net Rent (after TDS) + GST</strong></li>
          </ul>
        </div>
      </div>

      <div className="row g-4">

        {/* ══ LEFT: Inputs ══ */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-primary text-white py-3">
              <h6 className="mb-0 fw-semibold">
                <i className="bi bi-calculator me-2" />Calculate Payment
              </h6>
            </div>
            <div className="card-body p-4">

              {/* ── Searchable customer/unit dropdown ── */}
              <div className="mb-3">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Select Customer / Unit <span className="text-danger">*</span>
                </label>
                <Select
                  options={customerOptions}
                  value={selectedOption}
                  onChange={handleCustomerSelect}
                  filterOption={filterCustomerOption}
                  styles={selectStyles}
                  placeholder={
                    <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                      <i className="bi bi-search me-2" />Search by name, unit, floor, PAN…
                    </span>
                  }
                  isClearable
                  isSearchable
                  noOptionsMessage={({ inputValue }) =>
                    inputValue ? `No customers found for "${inputValue}"` : 'No active customers'
                  }
                  classNamePrefix="react-select"
                />
                <div className="form-text">
                  Type customer name, unit number, floor or PAN to filter
                </div>
              </div>

              {/* Date */}
              <div className="mb-3">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Payment Initiation Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={paymentDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
                {paymentDate && (
                  <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                    <small className="text-muted">Paying for:</small>
                    <span className="badge bg-primary">{getRentMonthLabel(paymentDate)}</span>
                    <span className="badge bg-secondary">{getRentMonth(paymentDate)}</span>
                  </div>
                )}
              </div>

              {loading && (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary me-2" />
                  <span className="text-muted small">Calculating...</span>
                </div>
              )}

              <RazorpayErrorAlert error={razorpayError} onDismiss={() => setRazorpayError(null)} />

              {startDateAlert && !loading && (
                <div className="alert alert-warning mt-2 border-warning">
                  <div className="d-flex gap-2 align-items-start">
                    <i className="bi bi-calendar-x-fill fs-5 text-warning flex-shrink-0 mt-1" />
                    <div>
                      <strong>Payment Not Yet Started</strong>
                      {startDateAlert.customerName && (
                        <p className="mb-1 mt-1 small">Payment for <strong>{startDateAlert.customerName}</strong> has not started yet.</p>
                      )}
                      <p className="mb-1 small">
                        Rent begins from <strong className="text-success">
                          {startDateAlert.startMonthLabel || toMonthLabel(startDateAlert.startMonth)}
                        </strong>.
                      </p>
                      <p className="mb-2 small">
                        Selected rent month <span className="badge bg-danger">{startDateAlert.rentMonth}</span> is before the start.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {calculation && !loading && derived && (
                <>
                  <div className="bg-light rounded p-3 mt-2 border">
                    <h6 className="fw-semibold small text-uppercase text-muted mb-3">
                      <i className="bi bi-person-badge me-1" />Customer Details
                    </h6>
                    <InfoRow label="Customer"    value={calculation.customerName} />
                    <InfoRow label="Unit"        value={`F${calculation.floorNo || '?'} · U${calculation.unitNo || '?'}`} />
                    <InfoRow label="Agreement"   badge={agreementBadge(calculation.agreementType)} />
                    <InfoRow label="Mode"        badge={modeBadge(calculation.paymentMode, calculation.partialSubType)} />
                    <InfoRow label="Rent Month"  badge={<strong className="text-primary small">{calculation.rentMonth}</strong>} />
                    <InfoRow label="TDS Mode"    badge={
                      derived.tdsProps.tdsExempt
                        ? <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>Exempt (N)</span>
                        : <span className="badge bg-success"  style={{ fontSize: '0.65rem' }}>Auto (₹50k threshold)</span>
                    } />
                    <InfoRow label="GST"         badge={
                      derived.gstProps.hasGst
                        ? <span className="badge bg-info text-white" style={{ fontSize: '0.65rem' }}>{derived.gstProps.gstNo} · {derived.gstProps.cgstRate}%+{derived.gstProps.sgstRate}%</span>
                        : <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>No GST</span>
                    } />
                    {/* Show rent type — confirms prorated vs full */}
                    {calculation.rentCalculationDetails?.rentType && (
                      <InfoRow label="Rent Type"  badge={
                        <span className={`badge ${calculation.rentCalculationDetails.rentType === 'prorated_closure_month' ? 'bg-warning text-dark' : 'bg-secondary'}`}
                          style={{ fontSize: '0.65rem' }}>
                          {calculation.rentCalculationDetails.rentType === 'prorated_closure_month'
                            ? `Prorated (${calculation.rentCalculationDetails.daysFromClosure}/${calculation.rentCalculationDetails.daysInClosureMonth} days)`
                            : 'Full Month'}
                        </span>
                      } />
                    )}
                  </div>

                  {derived.isUncfg && (
                    <div className="alert alert-warning py-2 small mt-2">
                      <strong>⚠ Partial not configured.</strong> Showing full rent estimate.
                    </div>
                  )}

                  <div className="d-flex gap-2 flex-wrap mt-3">
                    <button className="btn btn-outline-primary btn-sm" onClick={handleView}>
                      <i className="bi bi-eye me-1" />View
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowBreakdown(!showBreakdown)}>
                      <i className={`bi ${showBreakdown ? 'bi-eye-slash' : 'bi-file-text'} me-1`} />
                      {showBreakdown ? 'Hide' : 'Show'} Breakdown
                    </button>
                    <button className="btn btn-success btn-sm" onClick={handleDownload} disabled={pdfLoading}>
                      {pdfLoading
                        ? <><span className="spinner-border spinner-border-sm me-1" />PDF…</>
                        : <><i className="bi bi-file-earmark-pdf me-1" />PDF</>}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                      <i className="bi bi-printer me-1" />Print
                    </button>
                  </div>
                </>
              )}

              {!calculation && !loading && !startDateAlert && (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-calculator display-5 d-block mb-2 opacity-25" />
                  <p className="small mb-0">Select a customer to begin calculating</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Results ══ */}
        <div className="col-lg-7">

          {startDateAlert && !loading && (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-warning text-dark py-3">
                <h6 className="mb-0 fw-semibold">
                  <i className="bi bi-calendar-exclamation me-2" />Payment Not Started
                </h6>
              </div>
              <div className="card-body p-4 text-center">
                <i className="bi bi-calendar-x text-warning" style={{ fontSize: '3rem' }} />
                <h5 className="mt-3 fw-bold">No Rent Applicable for This Period</h5>
                <div className="alert alert-warning text-start mt-3">
                  <div className="mb-2">
                    <span className="text-muted small">Selected rent month:</span>{' '}
                    <span className="badge bg-danger fs-6">{startDateAlert.rentMonth}</span>
                  </div>
                  <div>
                    <span className="text-muted small">Payments begin from:</span>{' '}
                    <span className="badge bg-success fs-6">
                      {startDateAlert.startMonthLabel || toMonthLabel(startDateAlert.startMonth)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {calculation && !loading && derived && (
            <>
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-success text-white py-3 d-flex align-items-center justify-content-between">
                  <h6 className="mb-0 fw-semibold">
                    <i className="bi bi-receipt-cutoff me-2" />Payment Breakdown
                  </h6>
                  <span className="badge bg-white text-success">Rent for {calculation.rentMonth}</span>
                </div>
                <div className="card-body p-4">

                  {calculation.agreementType === '9-Year' && (
                    <div className="bg-light rounded p-3 border mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <div>
                        <div className="text-muted small fw-bold text-uppercase mb-1">Escalation</div>
                        {escalationBadge(derived.escalationRate, calculation.floorNo)}
                      </div>
                      {derived.hasEscalation && (
                        <strong style={{ color: '#7c3aed' }}>{derived.escalationRate}% on base rent</strong>
                      )}
                    </div>
                  )}

                  {/* FULL PAYMENT */}
                  {derived.isFullMode && (
                    <>
                      <div className="d-flex justify-content-between align-items-start mb-3 p-3 bg-light rounded border">
                        <div>
                          <div className="text-muted small fw-bold text-uppercase">Monthly Rent (Base)</div>
                          <div className="small text-muted">
                            {derived.d.sqft} sqft × ₹{derived.d.rentalValuePerSft}/sqft
                          </div>
                        </div>
                        <h5 className="text-muted mb-0">₹{fmtINR(derived.d.monthlyRent)}</h5>
                      </div>
                      <div className="d-flex justify-content-between align-items-start mb-3 p-3 bg-primary-subtle rounded border border-primary-subtle">
                        <div>
                          <div className="text-primary small fw-bold text-uppercase">
                            Gross Rent — {calculation.rentMonth}
                          </div>
                          <div className="small text-muted">
                            {derived.d.rentType === 'prorated_closure_month'
                              ? `Closure month → ${derived.d.daysFromClosure}/${derived.d.daysInClosureMonth} days`
                              : `Full month${derived.hasEscalation ? ` + ${derived.escalationRate}% escalation` : ''}`}
                          </div>
                        </div>
                        <h4 className="text-primary mb-0">₹{fmtINR(derived.grossAmount)}</h4>
                      </div>
                      <TdsInfoBox {...derived.tdsProps} tdsAmount={derived.tdsAmount} tdsRate={derived.tdsRate} grossAmount={derived.grossAmount} isPartial={false} />
                      <GstInfoBox {...derived.gstProps} />
                      <TotalPayableCard
                        grossAmount={derived.grossAmount} tdsAmount={derived.tdsAmount}
                        netPayout={derived.netPayout} {...derived.tdsProps} {...derived.gstProps}
                        netBankTransfer={derived.netBankTransfer} totalInvoice={derived.totalInvoice}
                        rentMonth={calculation.rentMonth} isPartial={false}
                      />
                    </>
                  )}

                  {/* PARTIAL FINANCIAL */}
                  {derived.isPartialFin && (
                    <>
                      <div className="bg-light rounded p-3 border mb-3">
                        <div className="fw-bold small text-uppercase text-muted mb-2">Combined Totals</div>
                        <SummaryRow label="Combined Gross Rent" value={`₹${fmtINR(derived.pTotals.gross)}`} cls="text-warning fw-bold" highlight />
                      </div>
                      <TdsInfoBox {...derived.tdsProps} tdsAmount={derived.pTotals.tds} tdsRate={derived.tdsRate} grossAmount={derived.pTotals.gross} isPartial />
                      <GstInfoBox {...derived.gstProps} />
                      <TotalPayableCard
                        grossAmount={derived.pTotals.gross} tdsAmount={derived.pTotals.tds}
                        netPayout={derived.pTotals.net} {...derived.tdsProps} {...derived.gstProps}
                        netBankTransfer={derived.netBankTransfer} totalInvoice={derived.totalInvoice}
                        rentMonth={calculation.rentMonth} isPartial
                      />
                    </>
                  )}

                  {/* PARTIAL INSTALMENT */}
                  {derived.isPartialInst && (
                    <>
                      <div className="d-flex justify-content-between align-items-start mb-3 p-3 bg-primary-subtle rounded border border-primary-subtle">
                        <div>
                          <div className="text-primary small fw-bold text-uppercase">
                            Total Gross — {calculation.rentMonth}
                          </div>
                          <div className="small text-muted">
                            Split into {derived.instBD.length} instalments
                          </div>
                        </div>
                        <h4 className="text-primary mb-0">₹{fmtINR(derived.grossAmount)}</h4>
                      </div>
                      <TdsInfoBox {...derived.tdsProps} tdsAmount={derived.pTotals.tds} tdsRate={derived.tdsRate} grossAmount={derived.pTotals.gross} isPartial={false} />
                      <GstInfoBox {...derived.gstProps} />
                      <TotalPayableCard
                        grossAmount={derived.pTotals.gross} tdsAmount={derived.pTotals.tds}
                        netPayout={derived.pTotals.net} {...derived.tdsProps} {...derived.gstProps}
                        netBankTransfer={derived.netBankTransfer} totalInvoice={derived.totalInvoice}
                        rentMonth={calculation.rentMonth} isPartial
                      />
                    </>
                  )}

                  <div className="alert alert-light border mt-3 mb-0 small">
                    <i className="bi bi-info-circle text-primary me-1" />
                    {derived.d.note || ''}
                  </div>
                </div>
              </div>

              {/* Adjustment section */}
              <AdjustmentSection
                calculation={calculation}
                derived={derived}
                adjustmentAmount={adjustmentAmount}
                setAdjustmentAmount={setAdjustmentAmount}
                adjustmentNote={adjustmentNote}
                setAdjustmentNote={setAdjustmentNote}
                onSave={handleSaveAdjustment}
                saving={saving}
                savedRecord={savedRecord}
                existingRecord={existingRecord}
              />
            </>
          )}

          {!calculation && !loading && !startDateAlert && (
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-5 text-muted">
                <i className="bi bi-calendar-check display-4 d-block mb-3 opacity-25" />
                <h5>No Calculation Yet</h5>
                <p className="small">
                  Select a customer/unit to begin.<br />
                  Use Adjustment to handle shortfalls or advances from previous months.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentCalculator;