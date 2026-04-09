import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import customerService from '../../Services/customer.service';
import financialService from '../../Services/financial.service';

/* ─── Pure helpers ─────────────────────────────────────────────────────────── */
const toFloat   = (v) => parseFloat(v) || 0;
const round2    = (v) => Math.round(toFloat(v) * 100) / 100;
const round0    = (v) => Math.round(toFloat(v));
const fmtINR    = (v) =>
  round2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toInputDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? (typeof v === 'string' ? v.split('T')[0] : '')
    : d.toISOString().split('T')[0];
};

/* Rent calculations — mirrors the backend exactly */
const calcFullRent = (sqft, rentPerSFT) => {
  const q = toFloat(sqft);
  const r = toFloat(rentPerSFT);
  return q && r ? round2(q * r) : 0;
};

const calcPartialRent = (amountReceived, closureDateStr, totalSale, sqft, rentPerSFT) => {
  const q = toFloat(sqft);
  const r = toFloat(rentPerSFT);
  if (!q || !r) return 0;

  const a = toFloat(amountReceived);
  const s = toFloat(totalSale);
  if (!a || !s || !closureDateStr) return 0;

  const d = new Date(closureDateStr);
  if (isNaN(d.getTime())) return 0;

  const totalDays   = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysCharged = totalDays - d.getDate() + 1;

  return round2((a / s) * (q * r) * (daysCharged / totalDays));
};

const autoTdsOnRent       = (rent) => rent >= 50000 ? round0(rent * 0.1) : 0;
const resolveTdsApplicable = (override, rent) => {
  if (override === 'Y') return 'Y';
  if (override === 'N') return 'N';
  return rent >= 50000 ? 'Y' : 'N';
};

const recalcPartials = (payments, totalSale, sqft, rentPerSFT) =>
  payments.map((p) => {
    const amt  = round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount));
    const rent = calcPartialRent(amt, p.paymentClosureDate || '', totalSale, sqft, rentPerSFT);
    return { ...p, rent };
  });

/* ─── EMPTY FORM ───────────────────────────────────────────────────────────── */

const EMPTY_FORM = {
  customerId:             '',
  sqft:                   '',
  totalSaleConsideration: '',
  rentalValuePerSFT:      '',
  paymentClosureDate:     '',
  bankCollection:         '',
  tdsCollection:          '',
  dateOfPayment:          '',
};

const EMPTY_ENTRY = () => ({
  id:                 Date.now() + Math.random(),
  bankAmount:         '',
  tdsAmount:          '',
  date:               '',
  paymentClosureDate: '',
  rent:               0,
});

/* ─── Sub-components ───────────────────────────────────────────────────────── */

const StatCard = ({ label, value, sub, colorClass }) => (
  <div className="col">
    <div className={`card border-0 text-center p-2 h-100 ${colorClass}`}>
      <div className="card-body p-1">
        <div
          className="text-muted fw-semibold"
          style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          {label}
        </div>
        <div className="fw-bold mt-1" style={{ fontSize: '0.95rem' }}>{value}</div>
        {sub && <div className="text-muted" style={{ fontSize: '0.65rem' }}>{sub}</div>}
      </div>
    </div>
  </div>
);

const TdsBadge = ({ applicable }) =>
  applicable === 'Y' ? (
    <span className="badge bg-warning text-dark py-2 px-3">
      <i className="bi bi-exclamation-triangle-fill me-1" />TDS Applicable (≥ ₹50,000)
    </span>
  ) : (
    <span className="badge bg-success py-2 px-3">
      <i className="bi bi-check-circle-fill me-1" />No TDS (&lt; ₹50,000)
    </span>
  );

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

const FinancialManagement = () => {
  const [customers,       setCustomers]       = useState([]);
  const [formData,        setFormData]        = useState(EMPTY_FORM);
  const [paymentMode,     setPaymentMode]     = useState('full');
  const [tdsOverride,     setTdsOverride]     = useState('auto');
  const [partialPayments, setPartialPayments] = useState([]);
  const [errors,          setErrors]          = useState({});
  const [loading,         setLoading]         = useState(false);

  useEffect(() => { loadCustomers(); }, []);

  /* ── Derived values ── */

  const totalSaleNum = toFloat(formData.totalSaleConsideration);

  // Full
  const fullBank    = toFloat(formData.bankCollection);
  const fullTdsColl = toFloat(formData.tdsCollection);
  const fullTotal   = round2(fullBank + fullTdsColl);
  const fullPct     = totalSaleNum > 0 ? round2((fullTotal / totalSaleNum) * 100) : 0;
  const fullOutst   = round2(totalSaleNum - fullTotal);
  const fullRent    = calcFullRent(formData.sqft, formData.rentalValuePerSFT);
  const fullTdsAppl = resolveTdsApplicable(tdsOverride === 'auto' ? null : tdsOverride, fullRent);
  const fullAutoTds = autoTdsOnRent(fullRent);
  const fullEstTds  = fullTdsAppl === 'Y' ? fullAutoTds : 0;
  const fullNet     = round2(fullRent - fullEstTds);

  // Partial
  const pBankTotal = round2(partialPayments.reduce((s, p) => s + toFloat(p.bankAmount), 0));
  const pTdsColl   = round2(partialPayments.reduce((s, p) => s + toFloat(p.tdsAmount),  0));
  const pRcvd      = round2(pBankTotal + pTdsColl);
  const pRent      = round2(partialPayments.reduce((s, p) => s + toFloat(p.rent),       0));
  const pOutst     = round2(totalSaleNum - pRcvd);
  const pPct       = totalSaleNum > 0 ? round2((pRcvd / totalSaleNum) * 100) : 0;
  const pTdsAppl   = resolveTdsApplicable(tdsOverride === 'auto' ? null : tdsOverride, pRent);
  const pAutoTds   = autoTdsOnRent(pRent);
  const pEstTds    = pTdsAppl === 'Y' ? pAutoTds : 0;
  const pNet       = round2(pRent - pEstTds);
  const is100Pct   = totalSaleNum > 0 && pRcvd >= totalSaleNum;

  const activeTdsAppl = paymentMode === 'full' ? fullTdsAppl : pTdsAppl;

  /* ── Data loaders ── */

  const loadCustomers = async () => {
    try {
      const r = await customerService.getAllCustomers({ limit: 1000 });
      setCustomers(r.data.customers || []);
    } catch {
      toast.error('Failed to load customers');
    }
  };

  const handleCustomerChange = async (e) => {
    const customerId = e.target.value;
    if (!customerId) { handleReset(); return; }

    const sel = customers.find((c) => c.id === customerId);

    try {
      const res = await financialService.getByCustomerId(customerId);
      if (res.success && res.data) {
        const r    = res.data;
        const mode = r.payment_mode || 'full';

        setFormData({
          customerId,
          sqft:                   sel?.sqft || r.sqft || '',
          totalSaleConsideration: r.total_sale_consideration || '',
          rentalValuePerSFT:      r.rental_value_per_sft    || '',
          paymentClosureDate:     toInputDate(r.payment_closure_date),
          bankCollection:         r.bank_collection          ?? '',
          tdsCollection:          r.tds_collection           ?? '',
          dateOfPayment:          toInputDate(r.date_of_payment),
        });
        setPaymentMode(mode);
        setTdsOverride(
          r.tds_applicable === 'Y' || r.tds_applicable === 'N' ? r.tds_applicable : 'auto'
        );

        if (mode === 'partial' && Array.isArray(r.partial_payments) && r.partial_payments.length) {
          const sqftVal = sel?.sqft || r.sqft || '';
          const loaded  = r.partial_payments.map((p, idx) => ({
            id:                 p.id ?? Date.now() + idx,
            bankAmount:         String(p.bankAmount    ?? p.bank_amount    ?? ''),
            tdsAmount:          String(p.tdsAmount     ?? p.tds_amount     ?? ''),
            date:               toInputDate(p.date)                         || '',
            paymentClosureDate: toInputDate(p.paymentClosureDate || p.payment_closure_date) || '',
            rent:               toFloat(p.rent),
          }));
          setPartialPayments(
            recalcPartials(loaded, r.total_sale_consideration, sqftVal, r.rental_value_per_sft)
          );
        } else {
          setPartialPayments([]);
        }

        toast.info('Financial data loaded for this customer');
      } else {
        setFormData((prev) => ({ ...prev, customerId, sqft: sel?.sqft || '' }));
        setPartialPayments([]);
        setPaymentMode('full');
        setTdsOverride('auto');
      }
    } catch {
      setFormData((prev) => ({ ...prev, customerId, sqft: sel?.sqft || '' }));
      setPartialPayments([]);
      setPaymentMode('full');
      setTdsOverride('auto');
    }
  };

  /* ── Field change ── */

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (['totalSaleConsideration', 'rentalValuePerSFT'].includes(name)) {
        setPartialPayments((pp) =>
          recalcPartials(pp, updated.totalSaleConsideration, updated.sqft, updated.rentalValuePerSFT)
        );
      }
      return updated;
    });
  }, []);

  /* ── Partial entry helpers ── */

  const addEntry = () =>
    setPartialPayments((prev) => [...prev, EMPTY_ENTRY()]);

  const removeEntry = (id) =>
    setPartialPayments((prev) =>
      recalcPartials(
        prev.filter((p) => p.id !== id),
        formData.totalSaleConsideration, formData.sqft, formData.rentalValuePerSFT
      )
    );

  const changeEntry = (id, field, value) =>
    setPartialPayments((prev) =>
      recalcPartials(
        prev.map((p) => (p.id !== id ? p : { ...p, [field]: value })),
        formData.totalSaleConsideration, formData.sqft, formData.rentalValuePerSFT
      )
    );

  /* ── Validation ── */

  const validate = () => {
    const e = {};
    if (!formData.customerId)              e.customerId             = 'Select a customer';
    if (!formData.totalSaleConsideration || toFloat(formData.totalSaleConsideration) <= 0)
      e.totalSaleConsideration = 'Enter a valid total sale amount';
    if (!formData.rentalValuePerSFT || toFloat(formData.rentalValuePerSFT) <= 0)
      e.rentalValuePerSFT = 'Enter a valid rental rate';

    if (paymentMode === 'full') {
      if (formData.bankCollection === '' || formData.bankCollection === undefined)
        e.bankCollection = 'Bank amount is required';
      if (!formData.dateOfPayment) e.dateOfPayment = 'Date of payment is required';
    } else {
      if (!partialPayments.length) e.partialPayments = 'Add at least one entry';
      partialPayments.forEach((p, i) => {
        if (!p.bankAmount)         e[`pBank_${i}`]    = 'Bank amount required';
        if (!p.date)               e[`pDate_${i}`]    = 'Date required';
        if (!p.paymentClosureDate) e[`pClosure_${i}`] = 'Closure date required';
      });
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Submit ── */

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) { toast.error('Please fill all required fields'); return; }

    try {
      setLoading(true);

      const enrichedPartials = partialPayments.map((p, idx) => ({
        id:                 p.id || idx + 1,
        installment_no:     idx + 1,
        bankAmount:         round2(toFloat(p.bankAmount)),
        tdsAmount:          round2(toFloat(p.tdsAmount)),
        amountReceived:     round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount)),
        date:               p.date               || null,
        paymentClosureDate: p.paymentClosureDate  || null,
        rent:               round2(toFloat(p.rent)),
      }));

      const payload = {
        customerId:             formData.customerId,
        totalSaleConsideration: formData.totalSaleConsideration,
        rentalValuePerSFT:      formData.rentalValuePerSFT,
        paymentClosureDate:     formData.paymentClosureDate || null,
        paymentMode,
        tdsApplicableOverride:  tdsOverride === 'auto' ? undefined : tdsOverride,
        ...(paymentMode === 'full'
          ? {
              bankCollection: formData.bankCollection,
              tdsCollection:  formData.tdsCollection || '0',
              dateOfPayment:  formData.dateOfPayment,
            }
          : {
              partialPayments: enrichedPartials,
              bankCollection:  pBankTotal,
              tdsCollection:   pTdsColl,
            }
        ),
      };

      await financialService.upsertFinancialRecord(payload);
      toast.success('Financial data saved successfully!');
      handleReset();

    } catch (err) {
      toast.error(err?.error || err?.message || 'Failed to save financial data');
    } finally {
      setLoading(false);
    }
  };

  /* ── Reset ── */

  const handleReset = () => {
    setFormData(EMPTY_FORM);
    setPartialPayments([]);
    setPaymentMode('full');
    setTdsOverride('auto');
    setErrors({});
  };

  /* ══════════════════════════════ RENDER ══════════════════════════════════ */

  return (
    <div className="bg-light min-vh-100 py-4 px-3">

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-cash-stack text-primary me-2" />Financial Management
          </h4>
          <small className="text-muted">
            Record sale collections, payment schedules &amp; rental calculations
          </small>
        </div>
        {formData.customerId && (
          <span className="badge bg-success-subtle border border-success text-success fs-6 px-3 py-2">
            <i className="bi bi-person-check me-1" />
            {formData.sqft} sq.ft &nbsp;·&nbsp; ₹{toFloat(formData.totalSaleConsideration).toLocaleString('en-IN')}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate>

        {/* ══ STEP 1 — Customer & Property ══ */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex align-items-center py-3 bg-primary text-white">
            <span className="badge bg-white text-primary me-2 fw-bold px-2">01</span>
            <span className="fw-semibold">Customer &amp; Property Details</span>
          </div>

          <div className="card-body p-4">
            <div className="row g-3">

              {/* Customer select */}
              <div className="col-12">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Select Customer <span className="text-danger">*</span>
                </label>
                <select
                  className={`form-select form-select-sm ${errors.customerId ? 'is-invalid' : ''}`}
                  name="customerId" value={formData.customerId} onChange={handleCustomerChange}
                >
                  <option value="">— Choose a customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customer_id} — {c.customer_name} ({c.property_name})
                    </option>
                  ))}
                </select>
                {errors.customerId
                  ? <div className="invalid-feedback">{errors.customerId}</div>
                  : <div className="form-text">Auto-loads existing financial data when selected</div>}
              </div>

              {/* Sqft (read-only) */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Built-up Area (sq.ft)
                </label>
                <input
                  className="form-control form-control-sm bg-light text-muted"
                  value={formData.sqft} readOnly placeholder="Auto-filled"
                />
                <div className="form-text">From customer record</div>
              </div>

              {/* Total sale */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Total Sale Consideration (₹) <span className="text-danger">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className={`form-control form-control-sm ${errors.totalSaleConsideration ? 'is-invalid' : ''}`}
                  name="totalSaleConsideration" value={formData.totalSaleConsideration}
                  onChange={handleChange} placeholder="e.g. 40000000"
                  onWheel={(e) => e.target.blur()}
                />
                {errors.totalSaleConsideration && (
                  <div className="invalid-feedback">{errors.totalSaleConsideration}</div>
                )}
              </div>

              {/* Rent per SFT */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Rental Value per SFT (₹) <span className="text-danger">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className={`form-control form-control-sm ${errors.rentalValuePerSFT ? 'is-invalid' : ''}`}
                  name="rentalValuePerSFT" value={formData.rentalValuePerSFT}
                  onChange={handleChange} placeholder="e.g. 70"
                  onWheel={(e) => e.target.blur()}
                />
                {errors.rentalValuePerSFT && (
                  <div className="invalid-feedback">{errors.rentalValuePerSFT}</div>
                )}
              </div>

              {/* Overall closure date */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Overall Payment Closure Date
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  name="paymentClosureDate" value={formData.paymentClosureDate}
                  onChange={handleChange}
                />
                <div className="form-text">Payment start / first closure date</div>
              </div>

              {/* TDS override */}
              <div className="col-md-4 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  TDS Applicable
                </label>
                <select
                  className="form-select form-select-sm"
                  value={tdsOverride}
                  onChange={(e) => setTdsOverride(e.target.value)}
                >
                  <option value="Y">Yes — TDS Applicable</option>
                  <option value="N">No — No TDS</option>
                </select>
              </div>
            </div>

            {/* Rent preview banner */}
            {formData.sqft && formData.rentalValuePerSFT && (
              <div className="alert alert-primary d-flex flex-wrap align-items-center gap-4 mt-3 mb-0 py-3">
                <div>
                  <div className="small fw-bold text-uppercase text-primary opacity-75">
                    Full Monthly Rent
                  </div>
                  <div className="fw-bold fs-4 text-primary">₹{fmtINR(fullRent)}</div>
                  <small className="text-muted">
                    {formData.sqft} sqft × ₹{formData.rentalValuePerSFT}/sqft
                  </small>
                </div>
                <div className="border-start ps-4">
                  <TdsBadge applicable={activeTdsAppl} />
                  <div className="mt-2 small">
                    {fullTdsAppl === 'Y' ? (
                      <span className="text-warning fw-semibold">
                        Auto TDS 10% = ₹{fmtINR(fullAutoTds)} &nbsp;|&nbsp; Net = ₹{fmtINR(fullRent - fullAutoTds)}
                      </span>
                    ) : (
                      <span className="text-muted">No TDS — rent below ₹50,000 threshold</span>
                    )}
                  </div>
                </div>
                {tdsOverride !== 'auto' && (
                  <span className="badge bg-warning-subtle text-warning border border-warning-subtle py-2 px-3">
                    <i className="bi bi-gear-fill me-1" />TDS manually forced: {tdsOverride}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ STEP 2 — Payment Mode ══ */}
        <div className="card border-0 shadow-sm mb-4">
          <div
            className="card-header d-flex align-items-center py-3"
            style={{ background: '#7c3aed', color: '#fff' }}
          >
            <span className="badge bg-white fw-bold me-2 px-2" style={{ color: '#7c3aed' }}>02</span>
            <span className="fw-semibold">Payment Mode</span>
          </div>

          <div className="card-body p-4">
            <div className="row g-3">
              {[
                {
                  mode:  'full',
                  icon:  'bi-cash-coin',
                  label: 'Full / Lump-Sum',
                  desc:  'Single bank transfer. Rent = Sqft × Rate (full month, no proration).',
                  color: 'primary',
                },
                {
                  mode:  'partial',
                  icon:  'bi-calendar-week',
                  label: 'Partial / Installments',
                  desc:  'Multiple payments. Rent prorated by remaining days in closure month.',
                  color: 'success',
                },
              ].map(({ mode, icon, label, desc, color }) => (
                <div className="col-md-6" key={mode}>
                  <div
                    className={`card h-100 border-2 ${
                      paymentMode === mode
                        ? `border-${color} bg-${color} bg-opacity-10`
                        : 'border-light'
                    }`}
                    onClick={() => { setPaymentMode(mode); setErrors({}); }}
                    role="button"
                    style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    <div className="card-body d-flex gap-3 align-items-start p-3">
                      <div className={`rounded-3 p-3 flex-shrink-0 ${paymentMode === mode ? `bg-${color}` : 'bg-light'}`}>
                        <i className={`bi ${icon} fs-5 ${paymentMode === mode ? 'text-white' : 'text-muted'}`} />
                      </div>
                      <div>
                        <div className="fw-bold">{label}</div>
                        <div className="text-muted small mt-1">{desc}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ STEP 3A — Full Payment ══ */}
        {paymentMode === 'full' && (
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header d-flex align-items-center py-3 text-white" style={{ background: '#16a34a' }}>
              <span className="badge bg-white fw-bold me-2 px-2 text-success">03</span>
              <span className="fw-semibold">Full Payment Details</span>
            </div>

            <div className="card-body p-4">
              <div className="alert alert-info d-flex gap-2 mb-4">
                <i className="bi bi-calculator fs-5 text-info flex-shrink-0 mt-1" />
                <div>
                  <strong>Rent = Sqft × Rent/SFT</strong> — full month, no proration.<br />
                  <small>Auto TDS @ 10% applies when rent ≥ ₹50,000. Override using TDS selector above.</small>
                </div>
              </div>

              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label fw-semibold small text-uppercase text-muted">
                    Date of Payment <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    className={`form-control form-control-sm ${errors.dateOfPayment ? 'is-invalid' : ''}`}
                    name="dateOfPayment" value={formData.dateOfPayment} onChange={handleChange}
                  />
                  {errors.dateOfPayment && (
                    <div className="invalid-feedback">{errors.dateOfPayment}</div>
                  )}
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold small text-uppercase text-muted">
                    Bank Amount Received (₹) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    className={`form-control form-control-sm ${errors.bankCollection ? 'is-invalid' : ''}`}
                    name="bankCollection" value={formData.bankCollection}
                    onChange={handleChange} placeholder="e.g. 40000000"
                    onWheel={(e) => e.target.blur()}
                  />
                  {errors.bankCollection
                    ? <div className="invalid-feedback">{errors.bankCollection}</div>
                    : <div className="form-text">Direct bank transfer amount</div>}
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold small text-uppercase text-muted">
                    TDS Collected (₹)
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    className="form-control form-control-sm"
                    name="tdsCollection" value={formData.tdsCollection}
                    onChange={handleChange} placeholder="0"
                    onWheel={(e) => e.target.blur()}
                  />
                  {fullAutoTds > 0
                    ? <div className="form-text text-warning fw-semibold">💡 Auto TDS on rent = ₹{fmtINR(fullAutoTds)}</div>
                    : <div className="form-text">TDS deducted at source (can be 0)</div>}
                </div>
              </div>

              {/* Calculated results */}
              {formData.bankCollection && formData.sqft && formData.rentalValuePerSFT && (
                <div className="mt-4">
                  <hr className="my-3" />
                  <p className="text-muted fw-semibold small text-uppercase mb-3">
                    📊 Calculated Results
                  </p>
                  <div className="row row-cols-3 row-cols-md-6 g-2">
                    <StatCard label="Total Received" value={`₹${fmtINR(fullTotal)}`}  sub="Bank + TDS"    colorClass="bg-success-subtle" />
                    <StatCard label="Received %"     value={`${fullPct}%`}             sub="of Total Sale" colorClass="bg-primary-subtle" />
                    <StatCard label="Outstanding"    value={`₹${fmtINR(fullOutst)}`}  sub={fullOutst <= 0 ? '✓ Fully Paid' : 'Remaining'} colorClass={fullOutst > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'} />
                    <StatCard label="Monthly Rent"   value={`₹${fmtINR(fullRent)}`}   sub="Full month"    colorClass="bg-warning-subtle" />
                    <StatCard label="TDS (10%)"      value={`₹${fmtINR(fullEstTds)}`} sub={fullTdsAppl === 'Y' ? 'Auto deducted' : 'Not applicable'} colorClass="bg-info-subtle" />
                    <StatCard label="Net Payout"     value={`₹${fmtINR(fullNet)}`}    sub="After TDS"     colorClass="bg-success-subtle" />
                  </div>
                  <div className="mt-3"><TdsBadge applicable={fullTdsAppl} /></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ STEP 3B — Partial Payments ══ */}
        {paymentMode === 'partial' && (
          <div className="card border-0 shadow-sm mb-4">
            <div
              className="card-header d-flex align-items-center justify-content-between py-3 text-white"
              style={{ background: '#16a34a' }}
            >
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-white fw-bold px-2 text-success">03</span>
                <span className="fw-semibold">Installment Entries</span>
                {partialPayments.length > 0 && (
                  <span className="badge bg-white text-success">{partialPayments.length}</span>
                )}
              </div>
              <button type="button" className="btn btn-light btn-sm fw-semibold" onClick={addEntry}>
                <i className="bi bi-plus-circle me-1" />Add Entry
              </button>
            </div>

            <div className="card-body p-4">
              <div className="alert alert-info d-flex gap-2 mb-4">
                <i className="bi bi-calculator fs-5 text-info flex-shrink-0 mt-1" />
                <div>
                  <strong>Proration = Remaining days from closure date ÷ Total days in month</strong><br />
                  Formula: (Amount ÷ Total Sale) × (Sqft × Rate/SFT) × (<strong>remaining days / total days</strong>)<br />
                  <small className="text-muted">
                    e.g. Closure Feb 20 → (28−20+1)=9 days → 9/28
                  </small>
                </div>
              </div>

              {/* Progress banner */}
              {pRcvd > 0 && (
                <div className={`alert ${is100Pct ? 'alert-success' : 'alert-warning'} d-flex align-items-center gap-2 mb-3`}>
                  <i className={`bi ${is100Pct ? 'bi-check-circle-fill' : 'bi-hourglass-split'} fs-5`} />
                  {is100Pct ? (
                    <><strong>100% received</strong> — ₹{fmtINR(pRcvd)} of ₹{fmtINR(totalSaleNum)}</>
                  ) : (
                    <><strong>{pPct}%</strong> received — ₹{fmtINR(pRcvd)} of ₹{fmtINR(totalSaleNum)}
                      &nbsp;(₹{fmtINR(pOutst)} outstanding)</>
                  )}
                </div>
              )}

              {errors.partialPayments && (
                <div className="alert alert-danger py-2 mb-3">
                  <i className="bi bi-exclamation-triangle me-1" />{errors.partialPayments}
                </div>
              )}

              {/* Empty state */}
              {partialPayments.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-inbox display-4 d-block mb-2" />
                  <p className="fw-semibold mb-1">No entries yet</p>
                  <p className="small mb-3">Click "Add Entry" to record the first installment.</p>
                  <button type="button" className="btn btn-success btn-sm" onClick={addEntry}>
                    <i className="bi bi-plus-circle me-1" />Add First Entry
                  </button>
                </div>
              ) : (
                partialPayments.map((p, i) => {
                  const rowAmt       = round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount));
                  const rowPct       = totalSaleNum > 0 ? round2((rowAmt / totalSaleNum) * 100) : 0;
                  const cD           = p.paymentClosureDate ? new Date(p.paymentClosureDate) : null;
                  const validDate    = cD && !isNaN(cD.getTime());
                  const totDays      = validDate ? new Date(cD.getFullYear(), cD.getMonth() + 1, 0).getDate() : null;
                  const dayNum       = validDate ? cD.getDate() : null;
                  const remDays      = (totDays && dayNum) ? totDays - dayNum + 1 : null;
                  const entryRent    = round2(toFloat(p.rent));
                  const entryAutoTds = autoTdsOnRent(entryRent);
                  const entryNetRent = round2(entryRent - entryAutoTds);

                  return (
                    <div key={p.id} className={`card border mb-3 ${i % 2 === 0 ? '' : 'bg-light'}`}>
                      <div className="card-body p-3">

                        {/* Entry header */}
                        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <span className="badge bg-primary rounded-pill px-3">#{i + 1}</span>
                            {entryRent > 0 && (
                              <span className="badge bg-success-subtle text-success border border-success-subtle">
                                <i className="bi bi-house me-1" />Rent: ₹{fmtINR(entryRent)}
                              </span>
                            )}
                            {entryRent > 0 && entryAutoTds > 0 && (
                              <span className="badge bg-warning text-dark">
                                <i className="bi bi-percent me-1" />Auto TDS: ₹{fmtINR(entryAutoTds)}
                              </span>
                            )}
                            {!p.paymentClosureDate && rowAmt > 0 && (
                              <span className="badge bg-warning text-dark">
                                <i className="bi bi-exclamation-triangle me-1" />Set closure date to calculate rent
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => removeEntry(p.id)}
                          >
                            <i className="bi bi-trash me-1" />Remove
                          </button>
                        </div>

                        {/* Entry fields */}
                        <div className="row g-3">
                          <div className="col-md-3 col-sm-6">
                            <label className="form-label fw-semibold small text-uppercase text-muted">
                              Bank Amount (₹) <span className="text-danger">*</span>
                            </label>
                            <input
                              type="number" step="0.01" min="0"
                              className={`form-control form-control-sm ${errors[`pBank_${i}`] ? 'is-invalid' : ''}`}
                              placeholder="e.g. 4000000" value={p.bankAmount}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) => changeEntry(p.id, 'bankAmount', e.target.value)}
                            />
                            {errors[`pBank_${i}`]
                              ? <div className="invalid-feedback">{errors[`pBank_${i}`]}</div>
                              : <div className="form-text">Via bank transfer</div>}
                          </div>

                          <div className="col-md-3 col-sm-6">
                            <label className="form-label fw-semibold small text-uppercase text-muted">
                              TDS Received (₹)
                            </label>
                            <input
                              type="number" step="0.01" min="0"
                              className="form-control form-control-sm"
                              placeholder="0" value={p.tdsAmount}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) => changeEntry(p.id, 'tdsAmount', e.target.value)}
                            />
                            {entryAutoTds > 0
                              ? <div className="form-text text-warning fw-semibold">💡 Auto TDS on rent = ₹{fmtINR(entryAutoTds)}</div>
                              : <div className="form-text">TDS on sale (can be 0)</div>}
                          </div>

                          <div className="col-md-3 col-sm-6">
                            <label className="form-label fw-semibold small text-uppercase text-muted">
                              Date of Payment <span className="text-danger">*</span>
                            </label>
                            <input
                              type="date"
                              className={`form-control form-control-sm ${errors[`pDate_${i}`] ? 'is-invalid' : ''}`}
                              value={p.date}
                              onChange={(e) => changeEntry(p.id, 'date', e.target.value)}
                            />
                            {errors[`pDate_${i}`]
                              ? <div className="invalid-feedback">{errors[`pDate_${i}`]}</div>
                              : <div className="form-text">Date installment was received</div>}
                          </div>

                          <div className="col-md-3 col-sm-6">
                            <label className="form-label fw-semibold small text-uppercase text-muted">
                              Closure Date <span className="text-danger">*</span>
                            </label>
                            <input
                              type="date"
                              className={`form-control form-control-sm ${errors[`pClosure_${i}`] ? 'is-invalid' : ''}`}
                              value={p.paymentClosureDate}
                              onChange={(e) => changeEntry(p.id, 'paymentClosureDate', e.target.value)}
                            />
                            {errors[`pClosure_${i}`] ? (
                              <div className="invalid-feedback">{errors[`pClosure_${i}`]}</div>
                            ) : validDate && remDays ? (
                              <div className="form-text text-success fw-semibold">
                                📅 {remDays} remaining days ({dayNum}→{totDays}) → {remDays}/{totDays}
                              </div>
                            ) : (
                              <div className="form-text">Rent prorated from this date</div>
                            )}
                          </div>
                        </div>

                        {/* Entry summary row */}
                        {rowAmt > 0 && (
                          <div className="d-flex flex-wrap gap-4 align-items-center bg-success bg-opacity-10 border border-success-subtle rounded p-2 mt-3">
                            {[
                              {
                                lbl: 'Total Received',
                                val: `₹${fmtINR(rowAmt)}`,
                                sub: `Bank ₹${fmtINR(p.bankAmount)} + TDS ₹${fmtINR(p.tdsAmount)}`,
                                cls: 'text-success',
                              },
                              {
                                lbl: 'Prorated Rent',
                                val: entryRent > 0 ? `₹${fmtINR(entryRent)}` : '—',
                                sub: remDays ? `${remDays}/${totDays} days` : 'Enter closure date',
                                cls: 'text-warning',
                              },
                              {
                                lbl: 'Auto TDS (10%)',
                                val: entryAutoTds > 0 ? `₹${fmtINR(entryAutoTds)}` : 'N/A',
                                sub: entryAutoTds > 0 ? `Net = ₹${fmtINR(entryNetRent)}` : 'Rent < ₹50,000',
                                cls: entryAutoTds > 0 ? 'text-danger' : 'text-muted',
                              },
                              {
                                lbl: '% of Sale',
                                val: `${rowPct}%`,
                                sub: '',
                                cls: 'text-primary',
                              },
                            ].map(({ lbl, val, sub, cls }) => (
                              <div key={lbl}>
                                <div
                                  className="text-muted fw-bold"
                                  style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                >
                                  {lbl}
                                </div>
                                <div className={`fw-bold fs-6 ${cls}`}>{val}</div>
                                {sub && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{sub}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Combined partial summary */}
              {partialPayments.length > 1 && (
                <div className="card border-0 bg-primary bg-opacity-10 mt-3">
                  <div className="card-body p-3">
                    <p className="fw-bold small text-uppercase text-primary mb-3">
                      <i className="bi bi-bar-chart me-1" />
                      Combined Summary — {partialPayments.length} Installments
                    </p>
                    <div className="row row-cols-3 row-cols-md-6 g-2">
                      <StatCard label="Total Bank"     value={`₹${fmtINR(pBankTotal)}`} sub="Bank only"    colorClass="bg-success-subtle" />
                      <StatCard label="Total TDS Rcvd" value={`₹${fmtINR(pTdsColl)}`}   sub="TDS only"    colorClass="bg-info-subtle" />
                      <StatCard label="Total Received" value={`₹${fmtINR(pRcvd)}`}      sub={`${pPct}%`}  colorClass="bg-primary-subtle" />
                      <StatCard label="Total Rent"     value={`₹${fmtINR(pRent)}`}      sub="Prorated sum" colorClass="bg-warning-subtle" />
                      <StatCard label="Auto TDS (10%)" value={`₹${fmtINR(pEstTds)}`}    sub={pTdsAppl === 'Y' ? 'Deducted' : 'Not applicable'} colorClass="bg-danger-subtle" />
                      <StatCard label="Net Payout"     value={`₹${fmtINR(pNet)}`}       sub="After auto TDS" colorClass="bg-success-subtle" />
                    </div>
                    <div className="mt-3 d-flex align-items-center gap-3 flex-wrap">
                      <TdsBadge applicable={pTdsAppl} />
                      {pAutoTds > 0 && tdsOverride === 'auto' && (
                        <small className="text-muted">
                          Auto-calculated: ₹{fmtINR(pAutoTds)} | Override using TDS selector above
                        </small>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ Financial Summary ══ */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex align-items-center py-3 text-white" style={{ background: '#0891b2' }}>
            <i className="bi bi-graph-up me-2" />
            <span className="fw-semibold">Financial Summary</span>
          </div>

          <div className="card-body p-4">
            <div className="row row-cols-3 row-cols-md-6 g-2">
              <StatCard
                label="Total Sale"
                value={`₹${fmtINR(formData.totalSaleConsideration)}`}
                sub="Property value"
                colorClass="bg-primary-subtle"
              />
              <StatCard
                label="Total Received"
                value={`₹${fmtINR(paymentMode === 'full' ? fullTotal : pRcvd)}`}
                sub={paymentMode === 'full' ? 'Bank + TDS' : `${partialPayments.length} installment(s)`}
                colorClass="bg-success-subtle"
              />
              <StatCard
                label="Outstanding"
                value={`₹${fmtINR(paymentMode === 'full' ? fullOutst : pOutst)}`}
                sub={(paymentMode === 'full' ? fullOutst : pOutst) <= 0 ? '✓ Paid' : 'Pending'}
                colorClass={(paymentMode === 'full' ? fullOutst : pOutst) > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'}
              />
              <StatCard
                label="Received %"
                value={`${paymentMode === 'full' ? fullPct : pPct}%`}
                sub="of Total Sale"
                colorClass="bg-info-subtle"
              />
              <StatCard
                label={paymentMode === 'full' ? 'Monthly Rent' : 'Total Rent'}
                value={`₹${fmtINR(paymentMode === 'full' ? fullRent : pRent)}`}
                sub={paymentMode === 'full' ? 'Full month' : 'Sum prorated'}
                colorClass="bg-warning-subtle"
              />
              <StatCard
                label="Net Payout"
                value={`₹${fmtINR(paymentMode === 'full' ? fullNet : pNet)}`}
                sub="After auto TDS"
                colorClass="bg-success-subtle"
              />
            </div>
            <div className="mt-3"><TdsBadge applicable={activeTdsAppl} /></div>
          </div>
        </div>

        {/* ══ Action Buttons ══ */}
        <div className="d-flex gap-3 flex-wrap pb-4">
          <button
            type="submit"
            className="btn btn-primary px-4 fw-bold"
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
            ) : (
              <><i className="bi bi-check-circle-fill me-2" />Save Financial Data</>
            )}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary px-4 fw-semibold"
            onClick={handleReset}
            disabled={loading}
          >
            <i className="bi bi-arrow-counterclockwise me-2" />Reset Form
          </button>
        </div>

      </form>
    </div>
  );
};

export default FinancialManagement;