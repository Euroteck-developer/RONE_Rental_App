// import React, { useState, useEffect, useCallback } from 'react';
// import { toast } from 'react-toastify';
// import customerService from '../../Services/customer.service';
// import financialService from '../../Services/financial.service';

// /* ─── Pure helpers ─────────────────────────────────────────────────────────── */
// const toFloat = (v) => parseFloat(v) || 0;
// const round2  = (v) => Math.round(toFloat(v) * 100) / 100;
// const round0  = (v) => Math.round(toFloat(v));
// const fmtINR  = (v) =>
//   round2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// const toInputDate = (v) => {
//   if (!v) return '';
//   const d = new Date(v);
//   return isNaN(d.getTime())
//     ? (typeof v === 'string' ? v.split('T')[0] : '')
//     : d.toISOString().split('T')[0];
// };

// /* Rent calculations */
// const calcFullRent = (sqft, rentPerSFT) => {
//   const q = toFloat(sqft), r = toFloat(rentPerSFT);
//   return q && r ? round2(q * r) : 0;
// };

// const calcPartialRent = (amountReceived, closureDateStr, totalSale, sqft, rentPerSFT) => {
//   const q = toFloat(sqft), r = toFloat(rentPerSFT);
//   if (!q || !r) return 0;
//   const a = toFloat(amountReceived), s = toFloat(totalSale);
//   if (!a || !s || !closureDateStr) return 0;
//   const d = new Date(closureDateStr);
//   if (isNaN(d.getTime())) return 0;
//   const totalDays   = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
//   const daysCharged = totalDays - d.getDate() + 1;
//   return round2((a / s) * (q * r) * (daysCharged / totalDays));
// };

// const autoTdsOnRent        = (rent) => rent >= 50000 ? round0(rent * 0.1) : 0;
// const resolveTdsApplicable = (override, rent) => {
//   if (override === 'Y') return 'Y';
//   if (override === 'N') return 'N';
//   return rent >= 50000 ? 'Y' : 'N';
// };

// const recalcPartials = (payments, totalSale, sqft, rentPerSFT) =>
//   payments.map((p) => {
//     const amt  = round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount));
//     const rent = calcPartialRent(amt, p.paymentClosureDate || '', totalSale, sqft, rentPerSFT);
//     return { ...p, rent };
//   });

// /* ─── Empty states ─────────────────────────────────────────────────────────── */
// const EMPTY_FORM = {
//   customerUnitId:         '',
//   sqft:                   '',
//   totalSaleConsideration: '',
//   rentalValuePerSFT:      '',
//   paymentClosureDate:     '',
//   bankCollection:         '',
//   tdsCollection:          '',
//   dateOfPayment:          '',
// };

// const EMPTY_ENTRY = () => ({
//   id:                 Date.now() + Math.random(),
//   bankAmount:         '',
//   tdsAmount:          '',
//   date:               '',
//   paymentClosureDate: '',
//   rent:               0,
// });

// /* ─── Sub-components ───────────────────────────────────────────────────────── */
// const StatCard = ({ label, value, sub, colorClass }) => (
//   <div className="col">
//     <div className={`card border-0 text-center p-2 h-100 ${colorClass}`}>
//       <div className="card-body p-1">
//         <div className="text-muted fw-semibold" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
//           {label}
//         </div>
//         <div className="fw-bold mt-1" style={{ fontSize: '0.95rem' }}>{value}</div>
//         {sub && <div className="text-muted" style={{ fontSize: '0.65rem' }}>{sub}</div>}
//       </div>
//     </div>
//   </div>
// );

// const TdsBadge = ({ applicable }) =>
//   applicable === 'Y' ? (
//     <span className="badge bg-warning text-dark py-2 px-3">
//       <i className="bi bi-exclamation-triangle-fill me-1" />TDS Applicable (≥ ₹50,000)
//     </span>
//   ) : (
//     <span className="badge bg-success py-2 px-3">
//       <i className="bi bi-check-circle-fill me-1" />No TDS (&lt; ₹50,000)
//     </span>
//   );

// /* ══════════════════════════════════════════════════════════════════════════════
//    MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════ */
// const FinancialManagement = () => {
//   // `units` holds all customer_units rows (joined with customer identity)
//   // Each unit is uniquely identifiable by its ID + label
//   const [units,           setUnits]           = useState([]);
//   const [selectedUnit,    setSelectedUnit]    = useState(null);   // the full unit object
//   const [formData,        setFormData]        = useState(EMPTY_FORM);
//   const [paymentMode,     setPaymentMode]     = useState('full');
//   const [tdsOverride,     setTdsOverride]     = useState('auto');
//   const [partialPayments, setPartialPayments] = useState([]);
//   const [errors,          setErrors]          = useState({});
//   const [loading,         setLoading]         = useState(false);

//   useEffect(() => { loadUnits(); }, []);

//   /* ── Load all units (1 row per flat) ── */
//   const loadUnits = async () => {
//     try {
//       const r = await customerService.getAllCustomers({ limit: 1000 });
//       setUnits(r.data.customers || []);
//     } catch {
//       toast.error('Failed to load units');
//     }
//   };

//   /* ── Derived values ── */
//   const totalSaleNum = toFloat(formData.totalSaleConsideration);

//   // Full
//   const fullBank    = toFloat(formData.bankCollection);
//   const fullTdsColl = toFloat(formData.tdsCollection);
//   const fullTotal   = round2(fullBank + fullTdsColl);
//   const fullPct     = totalSaleNum > 0 ? round2((fullTotal / totalSaleNum) * 100) : 0;
//   const fullOutst   = round2(totalSaleNum - fullTotal);
//   const fullRent    = calcFullRent(formData.sqft, formData.rentalValuePerSFT);
//   const fullTdsAppl = resolveTdsApplicable(tdsOverride === 'auto' ? null : tdsOverride, fullRent);
//   const fullAutoTds = autoTdsOnRent(fullRent);
//   const fullEstTds  = fullTdsAppl === 'Y' ? fullAutoTds : 0;
//   const fullNet     = round2(fullRent - fullEstTds);

//   // Partial
//   const pBankTotal = round2(partialPayments.reduce((s, p) => s + toFloat(p.bankAmount), 0));
//   const pTdsColl   = round2(partialPayments.reduce((s, p) => s + toFloat(p.tdsAmount),  0));
//   const pRcvd      = round2(pBankTotal + pTdsColl);
//   const pRent      = round2(partialPayments.reduce((s, p) => s + toFloat(p.rent),       0));
//   const pOutst     = round2(totalSaleNum - pRcvd);
//   const pPct       = totalSaleNum > 0 ? round2((pRcvd / totalSaleNum) * 100) : 0;
//   const pTdsAppl   = resolveTdsApplicable(tdsOverride === 'auto' ? null : tdsOverride, pRent);
//   const pAutoTds   = autoTdsOnRent(pRent);
//   const pEstTds    = pTdsAppl === 'Y' ? pAutoTds : 0;
//   const pNet       = round2(pRent - pEstTds);
//   const is100Pct   = totalSaleNum > 0 && pRcvd >= totalSaleNum;

//   const activeTdsAppl = paymentMode === 'full' ? fullTdsAppl : pTdsAppl;

//   /* ── Unit selection ── */
//   const handleUnitChange = async (e) => {
//     const unitId = e.target.value;
//     if (!unitId) { handleReset(); return; }

//     const sel = units.find((u) => u.id === unitId);
//     setSelectedUnit(sel || null);

//     try {
//       // financialService.getByCustomerId now accepts a unit ID
//       const res = await financialService.getByCustomerId(unitId);
//       if (res.success && res.data) {
//         const r    = res.data;
//         const mode = r.payment_mode || 'full';

//         setFormData({
//           customerUnitId:         unitId,
//           sqft:                   sel?.sqft || r.sqft || '',
//           totalSaleConsideration: r.total_sale_consideration || '',
//           rentalValuePerSFT:      r.rental_value_per_sft    || '',
//           paymentClosureDate:     toInputDate(r.payment_closure_date),
//           bankCollection:         r.bank_collection  ?? '',
//           tdsCollection:          r.tds_collection   ?? '',
//           dateOfPayment:          toInputDate(r.date_of_payment),
//         });
//         setPaymentMode(mode);
//         setTdsOverride(
//           r.tds_applicable === 'Y' || r.tds_applicable === 'N' ? r.tds_applicable : 'auto'
//         );

//         if (mode === 'partial' && Array.isArray(r.partial_payments) && r.partial_payments.length) {
//           const sqftVal = sel?.sqft || r.sqft || '';
//           const loaded  = r.partial_payments.map((p, idx) => ({
//             id:                 p.id ?? Date.now() + idx,
//             bankAmount:         String(p.bankAmount    ?? p.bank_amount    ?? ''),
//             tdsAmount:          String(p.tdsAmount     ?? p.tds_amount     ?? ''),
//             date:               toInputDate(p.date)                         || '',
//             paymentClosureDate: toInputDate(p.paymentClosureDate || p.payment_closure_date) || '',
//             rent:               toFloat(p.rent),
//           }));
//           setPartialPayments(
//             recalcPartials(loaded, r.total_sale_consideration, sqftVal, r.rental_value_per_sft)
//           );
//         } else {
//           setPartialPayments([]);
//         }
//         toast.info(`Financial data loaded for unit ${sel?.unit_ref}`);
//       } else {
//         setFormData((prev) => ({ ...prev, customerUnitId: unitId, sqft: sel?.sqft || '' }));
//         setPartialPayments([]);
//         setPaymentMode('full');
//         setTdsOverride('auto');
//       }
//     } catch {
//       setFormData((prev) => ({ ...prev, customerUnitId: unitId, sqft: sel?.sqft || '' }));
//       setPartialPayments([]);
//       setPaymentMode('full');
//       setTdsOverride('auto');
//     }
//   };

//   /* ── Field change ── */
//   const handleChange = useCallback((e) => {
//     const { name, value } = e.target;
//     setErrors((prev) => ({ ...prev, [name]: '' }));
//     setFormData((prev) => {
//       const updated = { ...prev, [name]: value };
//       if (['totalSaleConsideration', 'rentalValuePerSFT'].includes(name)) {
//         setPartialPayments((pp) =>
//           recalcPartials(pp, updated.totalSaleConsideration, updated.sqft, updated.rentalValuePerSFT)
//         );
//       }
//       return updated;
//     });
//   }, []);

//   /* ── Partial entry helpers ── */
//   const addEntry    = () => setPartialPayments((prev) => [...prev, EMPTY_ENTRY()]);
//   const removeEntry = (id) =>
//     setPartialPayments((prev) =>
//       recalcPartials(prev.filter((p) => p.id !== id), formData.totalSaleConsideration, formData.sqft, formData.rentalValuePerSFT)
//     );
//   const changeEntry = (id, field, value) =>
//     setPartialPayments((prev) =>
//       recalcPartials(prev.map((p) => p.id !== id ? p : { ...p, [field]: value }), formData.totalSaleConsideration, formData.sqft, formData.rentalValuePerSFT)
//     );

//   /* ── Validation ── */
//   const validate = () => {
//     const e = {};
//     if (!formData.customerUnitId)
//       e.customerUnitId = 'Select a unit';
//     if (!formData.totalSaleConsideration || toFloat(formData.totalSaleConsideration) <= 0)
//       e.totalSaleConsideration = 'Enter a valid total sale amount';
//     if (!formData.rentalValuePerSFT || toFloat(formData.rentalValuePerSFT) <= 0)
//       e.rentalValuePerSFT = 'Enter a valid rental rate';
//     if (paymentMode === 'full') {
//       if (formData.bankCollection === '' || formData.bankCollection === undefined)
//         e.bankCollection = 'Bank amount is required';
//       if (!formData.dateOfPayment)
//         e.dateOfPayment = 'Date of payment is required';
//     } else {
//       if (!partialPayments.length) e.partialPayments = 'Add at least one entry';
//       partialPayments.forEach((p, i) => {
//         if (!p.bankAmount)         e[`pBank_${i}`]    = 'Bank amount required';
//         if (!p.date)               e[`pDate_${i}`]    = 'Date required';
//         if (!p.paymentClosureDate) e[`pClosure_${i}`] = 'Closure date required';
//       });
//     }
//     setErrors(e);
//     return Object.keys(e).length === 0;
//   };

//   /* ── Submit ── */
//   const handleSubmit = async (ev) => {
//     ev.preventDefault();
//     if (!validate()) { toast.error('Please fill all required fields'); return; }

//     try {
//       setLoading(true);

//       const enrichedPartials = partialPayments.map((p, idx) => ({
//         id:                 p.id || idx + 1,
//         installment_no:     idx + 1,
//         bankAmount:         round2(toFloat(p.bankAmount)),
//         tdsAmount:          round2(toFloat(p.tdsAmount)),
//         amountReceived:     round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount)),
//         date:               p.date              || null,
//         paymentClosureDate: p.paymentClosureDate || null,
//         rent:               round2(toFloat(p.rent)),
//       }));

//       const payload = {
//         customerUnitId:         formData.customerUnitId,   // ← key change vs old code
//         totalSaleConsideration: formData.totalSaleConsideration,
//         rentalValuePerSFT:      formData.rentalValuePerSFT,
//         paymentClosureDate:     formData.paymentClosureDate || null,
//         paymentMode,
//         tdsApplicableOverride:  tdsOverride === 'auto' ? undefined : tdsOverride,
//         ...(paymentMode === 'full'
//           ? {
//               bankCollection: formData.bankCollection,
//               tdsCollection:  formData.tdsCollection || '0',
//               dateOfPayment:  formData.dateOfPayment,
//             }
//           : {
//               partialPayments: enrichedPartials,
//               bankCollection:  pBankTotal,
//               tdsCollection:   pTdsColl,
//             }
//         ),
//       };

//       await financialService.upsertFinancialRecord(payload);
//       toast.success('Financial data saved successfully!');
//       handleReset();
//     } catch (err) {
//       toast.error(err?.error || err?.message || 'Failed to save financial data');
//     } finally {
//       setLoading(false);
//     }
//   };

//   /* ── Reset ── */
//   const handleReset = () => {
//     setFormData(EMPTY_FORM);
//     setPartialPayments([]);
//     setPaymentMode('full');
//     setTdsOverride('auto');
//     setErrors({});
//     setSelectedUnit(null);
//   };

//   // Group units by customer for the dropdown optgroups
//   const groupedByCustomer = units.reduce((acc, u) => {
//     const key = u.customer_ref || u.customer_id;
//     if (!acc[key]) acc[key] = { label: `${u.customer_ref} — ${u.customer_name}`, options: [] };
//     acc[key].options.push(u);
//     return acc;
//   }, {});

//   /* ═══════════════════════════════════════ RENDER ═════════════════════════ */
//   return (
//     <div className="bg-light min-vh-100 py-4 px-3">

//       {/* Header */}
//       <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-3">
//         <div>
//           <h4 className="fw-bold mb-1">
//             <i className="bi bi-cash-stack text-primary me-2" />Financial Management
//           </h4>
//           <small className="text-muted">
//             Record sale collections, payment schedules &amp; rental calculations — <strong>per flat/unit</strong>
//           </small>
//         </div>
//         {selectedUnit && (
//           <div className="d-flex flex-wrap gap-2">
//             <span className="badge bg-primary-subtle border border-primary text-primary fs-6 px-3 py-2">
//               <i className="bi bi-building me-1" />
//               {selectedUnit.unit_ref} — {selectedUnit.property_name} F{selectedUnit.floor_no} U{selectedUnit.unit_no}
//             </span>
//             <span className="badge bg-success-subtle border border-success text-success fs-6 px-3 py-2">
//               <i className="bi bi-person-check me-1" />
//               {selectedUnit.customer_name} &nbsp;·&nbsp; {selectedUnit.sqft} sq.ft
//             </span>
//           </div>
//         )}
//       </div>

//       <form onSubmit={handleSubmit} noValidate>

//         {/* ══ STEP 1 — Unit & Property ══ */}
//         <div className="card border-0 shadow-sm mb-4">
//           <div className="card-header d-flex align-items-center py-3 bg-primary text-white">
//             <span className="badge bg-white text-primary me-2 fw-bold px-2">01</span>
//             <span className="fw-semibold">Select Unit &amp; Property Details</span>
//           </div>
//           <div className="card-body p-4">
//             <div className="row g-3">

//               {/* Unit select — grouped by customer */}
//               <div className="col-12">
//                 <label className="form-label fw-semibold small text-uppercase text-muted">
//                   Select Flat / Unit <span className="text-danger">*</span>
//                 </label>
//                 <select
//                   className={`form-select form-select-sm ${errors.customerUnitId ? 'is-invalid' : ''}`}
//                   value={formData.customerUnitId}
//                   onChange={handleUnitChange}
//                 >
//                   <option value="">— Choose a flat/unit —</option>
//                   {Object.values(groupedByCustomer).map((grp) => (
//                     <optgroup key={grp.label} label={grp.label}>
//                       {grp.options.map((u) => (
//                         <option key={u.id} value={u.id}>
//                           {u.unit_ref} — {u.property_name} Floor {u.floor_no} Unit {u.unit_no}
//                           {' '}({u.sqft} sqft, {u.agreement_type}, {u.status})
//                         </option>
//                       ))}
//                     </optgroup>
//                   ))}
//                 </select>
//                 {errors.customerUnitId
//                   ? <div className="invalid-feedback">{errors.customerUnitId}</div>
//                   : <div className="form-text">Units are grouped by customer. Each flat has independent financials.</div>}
//               </div>

//               {/* Sqft (read-only) */}
//               <div className="col-md-3 col-sm-6">
//                 <label className="form-label fw-semibold small text-uppercase text-muted">Built-up Area (sq.ft)</label>
//                 <input className="form-control form-control-sm bg-light text-muted" value={formData.sqft} readOnly placeholder="Auto-filled" />
//                 <div className="form-text">From unit record</div>
//               </div>

//               {/* Total sale */}
//               <div className="col-md-3 col-sm-6">
//                 <label className="form-label fw-semibold small text-uppercase text-muted">
//                   Total Sale Consideration (₹) <span className="text-danger">*</span>
//                 </label>
//                 <input
//                   type="number" step="0.01" min="0"
//                   className={`form-control form-control-sm ${errors.totalSaleConsideration ? 'is-invalid' : ''}`}
//                   name="totalSaleConsideration" value={formData.totalSaleConsideration}
//                   onChange={handleChange} placeholder="e.g. 40000000"
//                   onWheel={(e) => e.target.blur()}
//                 />
//                 {errors.totalSaleConsideration && <div className="invalid-feedback">{errors.totalSaleConsideration}</div>}
//               </div>

//               {/* Rent per SFT */}
//               <div className="col-md-3 col-sm-6">
//                 <label className="form-label fw-semibold small text-uppercase text-muted">
//                   Rental Value per SFT (₹) <span className="text-danger">*</span>
//                 </label>
//                 <input
//                   type="number" step="0.01" min="0"
//                   className={`form-control form-control-sm ${errors.rentalValuePerSFT ? 'is-invalid' : ''}`}
//                   name="rentalValuePerSFT" value={formData.rentalValuePerSFT}
//                   onChange={handleChange} placeholder="e.g. 70"
//                   onWheel={(e) => e.target.blur()}
//                 />
//                 {errors.rentalValuePerSFT && <div className="invalid-feedback">{errors.rentalValuePerSFT}</div>}
//               </div>

//               {/* Overall closure date */}
//               <div className="col-md-3 col-sm-6">
//                 <label className="form-label fw-semibold small text-uppercase text-muted">Overall Payment Closure Date</label>
//                 <input
//                   type="date" className="form-control form-control-sm"
//                   name="paymentClosureDate" value={formData.paymentClosureDate} onChange={handleChange}
//                 />
//                 <div className="form-text">Payment start / first closure date</div>
//               </div>

//               {/* TDS override */}
//               <div className="col-md-4 col-sm-6">
//                 <label className="form-label fw-semibold small text-uppercase text-muted">TDS Applicable</label>
//                 <select
//                   className="form-select form-select-sm"
//                   value={tdsOverride}
//                   onChange={(e) => setTdsOverride(e.target.value)}
//                 >
//                   <option value="Y">Yes — TDS Applicable</option>
//                   <option value="N">No — No TDS</option>
//                 </select>
//               </div>
//             </div>

//             {/* Rent preview banner */}
//             {formData.sqft && formData.rentalValuePerSFT && (
//               <div className="alert alert-primary d-flex flex-wrap align-items-center gap-4 mt-3 mb-0 py-3">
//                 <div>
//                   <div className="small fw-bold text-uppercase text-primary opacity-75">Full Monthly Rent</div>
//                   <div className="fw-bold fs-4 text-primary">₹{fmtINR(fullRent)}</div>
//                   <small className="text-muted">
//                     {formData.sqft} sqft × ₹{formData.rentalValuePerSFT}/sqft
//                     {selectedUnit && <> — {selectedUnit.unit_ref}</>}
//                   </small>
//                 </div>
//                 <div className="border-start ps-4">
//                   <TdsBadge applicable={activeTdsAppl} />
//                   <div className="mt-2 small">
//                     {fullTdsAppl === 'Y' ? (
//                       <span className="text-warning fw-semibold">
//                         Auto TDS 10% = ₹{fmtINR(fullAutoTds)} &nbsp;|&nbsp; Net = ₹{fmtINR(fullRent - fullAutoTds)}
//                       </span>
//                     ) : (
//                       <span className="text-muted">No TDS — rent below ₹50,000 threshold</span>
//                     )}
//                   </div>
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* ══ STEP 2 — Payment Mode ══ */}
//         <div className="card border-0 shadow-sm mb-4">
//           <div className="card-header d-flex align-items-center py-3" style={{ background: '#7c3aed', color: '#fff' }}>
//             <span className="badge bg-white fw-bold me-2 px-2" style={{ color: '#7c3aed' }}>02</span>
//             <span className="fw-semibold">Payment Mode</span>
//           </div>
//           <div className="card-body p-4">
//             <div className="row g-3">
//               {[
//                 { mode: 'full',    icon: 'bi-cash-coin',     label: 'Full / Lump-Sum',         desc: 'Single bank transfer. Rent = Sqft × Rate (full month).',          color: 'primary' },
//                 { mode: 'partial', icon: 'bi-calendar-week', label: 'Partial / Installments', desc: 'Multiple payments. Rent prorated by remaining days in closure month.', color: 'success' },
//               ].map(({ mode, icon, label, desc, color }) => (
//                 <div className="col-md-6" key={mode}>
//                   <div
//                     className={`card h-100 border-2 ${paymentMode === mode ? `border-${color} bg-${color} bg-opacity-10` : 'border-light'}`}
//                     onClick={() => { setPaymentMode(mode); setErrors({}); }}
//                     role="button" style={{ cursor: 'pointer', transition: 'all 0.15s' }}
//                   >
//                     <div className="card-body d-flex gap-3 align-items-start p-3">
//                       <div className={`rounded-3 p-3 flex-shrink-0 ${paymentMode === mode ? `bg-${color}` : 'bg-light'}`}>
//                         <i className={`bi ${icon} fs-5 ${paymentMode === mode ? 'text-white' : 'text-muted'}`} />
//                       </div>
//                       <div>
//                         <div className="fw-bold">{label}</div>
//                         <div className="text-muted small mt-1">{desc}</div>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* ══ STEP 3A — Full Payment ══ */}
//         {paymentMode === 'full' && (
//           <div className="card border-0 shadow-sm mb-4">
//             <div className="card-header d-flex align-items-center py-3 text-white" style={{ background: '#16a34a' }}>
//               <span className="badge bg-white fw-bold me-2 px-2 text-success">03</span>
//               <span className="fw-semibold">Full Payment Details</span>
//             </div>
//             <div className="card-body p-4">
//               <div className="row g-3">
//                 <div className="col-md-4">
//                   <label className="form-label fw-semibold small text-uppercase text-muted">
//                     Date of Payment <span className="text-danger">*</span>
//                   </label>
//                   <input
//                     type="date"
//                     className={`form-control form-control-sm ${errors.dateOfPayment ? 'is-invalid' : ''}`}
//                     name="dateOfPayment" value={formData.dateOfPayment} onChange={handleChange}
//                   />
//                   {errors.dateOfPayment && <div className="invalid-feedback">{errors.dateOfPayment}</div>}
//                 </div>
//                 <div className="col-md-4">
//                   <label className="form-label fw-semibold small text-uppercase text-muted">
//                     Bank Amount Received (₹) <span className="text-danger">*</span>
//                   </label>
//                   <input
//                     type="number" step="0.01" min="0"
//                     className={`form-control form-control-sm ${errors.bankCollection ? 'is-invalid' : ''}`}
//                     name="bankCollection" value={formData.bankCollection}
//                     onChange={handleChange} placeholder="e.g. 40000000"
//                     onWheel={(e) => e.target.blur()}
//                   />
//                   {errors.bankCollection && <div className="invalid-feedback">{errors.bankCollection}</div>}
//                 </div>
//                 <div className="col-md-4">
//                   <label className="form-label fw-semibold small text-uppercase text-muted">TDS Collected (₹)</label>
//                   <input
//                     type="number" step="0.01" min="0"
//                     className="form-control form-control-sm"
//                     name="tdsCollection" value={formData.tdsCollection}
//                     onChange={handleChange} placeholder="0"
//                     onWheel={(e) => e.target.blur()}
//                   />
//                   {fullAutoTds > 0
//                     ? <div className="form-text text-warning fw-semibold">💡 Auto TDS on rent = ₹{fmtINR(fullAutoTds)}</div>
//                     : <div className="form-text">TDS deducted at source (can be 0)</div>}
//                 </div>
//               </div>

//               {formData.bankCollection && formData.sqft && formData.rentalValuePerSFT && (
//                 <div className="mt-4">
//                   <hr className="my-3" />
//                   <p className="text-muted fw-semibold small text-uppercase mb-3">📊 Calculated Results</p>
//                   <div className="row row-cols-3 row-cols-md-6 g-2">
//                     <StatCard label="Total Received" value={`₹${fmtINR(fullTotal)}`}  sub="Bank + TDS"    colorClass="bg-success-subtle" />
//                     <StatCard label="Received %"     value={`${fullPct}%`}             sub="of Total Sale" colorClass="bg-primary-subtle" />
//                     <StatCard label="Outstanding"    value={`₹${fmtINR(fullOutst)}`}  sub={fullOutst <= 0 ? '✓ Fully Paid' : 'Remaining'} colorClass={fullOutst > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'} />
//                     <StatCard label="Monthly Rent"   value={`₹${fmtINR(fullRent)}`}   sub="Full month"    colorClass="bg-warning-subtle" />
//                     <StatCard label="TDS (10%)"      value={`₹${fmtINR(fullEstTds)}`} sub={fullTdsAppl === 'Y' ? 'Auto deducted' : 'N/A'} colorClass="bg-info-subtle" />
//                     <StatCard label="Net Payout"     value={`₹${fmtINR(fullNet)}`}    sub="After TDS"     colorClass="bg-success-subtle" />
//                   </div>
//                   <div className="mt-3"><TdsBadge applicable={fullTdsAppl} /></div>
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         {/* ══ STEP 3B — Partial Payments ══ */}
//         {paymentMode === 'partial' && (
//           <div className="card border-0 shadow-sm mb-4">
//             <div
//               className="card-header d-flex align-items-center justify-content-between py-3 text-white"
//               style={{ background: '#16a34a' }}
//             >
//               <div className="d-flex align-items-center gap-2">
//                 <span className="badge bg-white fw-bold px-2 text-success">03</span>
//                 <span className="fw-semibold">Installment Entries</span>
//                 {partialPayments.length > 0 && (
//                   <span className="badge bg-white text-success">{partialPayments.length}</span>
//                 )}
//               </div>
//               <button type="button" className="btn btn-light btn-sm fw-semibold" onClick={addEntry}>
//                 <i className="bi bi-plus-circle me-1" />Add Entry
//               </button>
//             </div>
//             <div className="card-body p-4">
//               {pRcvd > 0 && (
//                 <div className={`alert ${is100Pct ? 'alert-success' : 'alert-warning'} d-flex align-items-center gap-2 mb-3`}>
//                   <i className={`bi ${is100Pct ? 'bi-check-circle-fill' : 'bi-hourglass-split'} fs-5`} />
//                   {is100Pct ? (
//                     <><strong>100% received</strong> — ₹{fmtINR(pRcvd)} of ₹{fmtINR(totalSaleNum)}</>
//                   ) : (
//                     <><strong>{pPct}%</strong> received — ₹{fmtINR(pRcvd)} of ₹{fmtINR(totalSaleNum)} (₹{fmtINR(pOutst)} outstanding)</>
//                   )}
//                 </div>
//               )}
//               {errors.partialPayments && (
//                 <div className="alert alert-danger py-2 mb-3">
//                   <i className="bi bi-exclamation-triangle me-1" />{errors.partialPayments}
//                 </div>
//               )}

//               {partialPayments.length === 0 ? (
//                 <div className="text-center py-5 text-muted">
//                   <i className="bi bi-inbox display-4 d-block mb-2" />
//                   <p className="fw-semibold mb-1">No entries yet</p>
//                   <button type="button" className="btn btn-success btn-sm" onClick={addEntry}>
//                     <i className="bi bi-plus-circle me-1" />Add First Entry
//                   </button>
//                 </div>
//               ) : (
//                 partialPayments.map((p, i) => {
//                   const rowAmt    = round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount));
//                   const rowPct    = totalSaleNum > 0 ? round2((rowAmt / totalSaleNum) * 100) : 0;
//                   const cD        = p.paymentClosureDate ? new Date(p.paymentClosureDate) : null;
//                   const validDate = cD && !isNaN(cD.getTime());
//                   const totDays   = validDate ? new Date(cD.getFullYear(), cD.getMonth() + 1, 0).getDate() : null;
//                   const dayNum    = validDate ? cD.getDate() : null;
//                   const remDays   = (totDays && dayNum) ? totDays - dayNum + 1 : null;
//                   const entryRent    = round2(toFloat(p.rent));
//                   const entryAutoTds = autoTdsOnRent(entryRent);

//                   return (
//                     <div key={p.id} className={`card border mb-3 ${i % 2 === 0 ? '' : 'bg-light'}`}>
//                       <div className="card-body p-3">
//                         <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
//                           <div className="d-flex align-items-center gap-2 flex-wrap">
//                             <span className="badge bg-primary rounded-pill px-3">#{i + 1}</span>
//                             {entryRent > 0 && (
//                               <span className="badge bg-success-subtle text-success border border-success-subtle">
//                                 Rent: ₹{fmtINR(entryRent)}
//                               </span>
//                             )}
//                           </div>
//                           <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeEntry(p.id)}>
//                             <i className="bi bi-trash me-1" />Remove
//                           </button>
//                         </div>
//                         <div className="row g-3">
//                           <div className="col-md-3 col-sm-6">
//                             <label className="form-label fw-semibold small text-uppercase text-muted">Bank Amount (₹) <span className="text-danger">*</span></label>
//                             <input
//                               type="number" step="0.01" min="0"
//                               className={`form-control form-control-sm ${errors[`pBank_${i}`] ? 'is-invalid' : ''}`}
//                               placeholder="e.g. 4000000" value={p.bankAmount}
//                               onWheel={(e) => e.target.blur()}
//                               onChange={(e) => changeEntry(p.id, 'bankAmount', e.target.value)}
//                             />
//                             {errors[`pBank_${i}`] && <div className="invalid-feedback">{errors[`pBank_${i}`]}</div>}
//                           </div>
//                           <div className="col-md-3 col-sm-6">
//                             <label className="form-label fw-semibold small text-uppercase text-muted">TDS Received (₹)</label>
//                             <input
//                               type="number" step="0.01" min="0"
//                               className="form-control form-control-sm"
//                               placeholder="0" value={p.tdsAmount}
//                               onWheel={(e) => e.target.blur()}
//                               onChange={(e) => changeEntry(p.id, 'tdsAmount', e.target.value)}
//                             />
//                           </div>
//                           <div className="col-md-3 col-sm-6">
//                             <label className="form-label fw-semibold small text-uppercase text-muted">Date of Payment <span className="text-danger">*</span></label>
//                             <input
//                               type="date"
//                               className={`form-control form-control-sm ${errors[`pDate_${i}`] ? 'is-invalid' : ''}`}
//                               value={p.date}
//                               onChange={(e) => changeEntry(p.id, 'date', e.target.value)}
//                             />
//                             {errors[`pDate_${i}`] && <div className="invalid-feedback">{errors[`pDate_${i}`]}</div>}
//                           </div>
//                           <div className="col-md-3 col-sm-6">
//                             <label className="form-label fw-semibold small text-uppercase text-muted">Closure Date <span className="text-danger">*</span></label>
//                             <input
//                               type="date"
//                               className={`form-control form-control-sm ${errors[`pClosure_${i}`] ? 'is-invalid' : ''}`}
//                               value={p.paymentClosureDate}
//                               onChange={(e) => changeEntry(p.id, 'paymentClosureDate', e.target.value)}
//                             />
//                             {errors[`pClosure_${i}`] ? (
//                               <div className="invalid-feedback">{errors[`pClosure_${i}`]}</div>
//                             ) : validDate && remDays ? (
//                               <div className="form-text text-success fw-semibold">📅 {remDays}/{totDays} days</div>
//                             ) : null}
//                           </div>
//                         </div>
//                         {rowAmt > 0 && (
//                           <div className="d-flex flex-wrap gap-4 align-items-center bg-success bg-opacity-10 border border-success-subtle rounded p-2 mt-3">
//                             {[
//                               { lbl: 'Total Received', val: `₹${fmtINR(rowAmt)}`, sub: `Bank ₹${fmtINR(p.bankAmount)} + TDS ₹${fmtINR(p.tdsAmount)}`, cls: 'text-success' },
//                               { lbl: 'Prorated Rent',  val: entryRent > 0 ? `₹${fmtINR(entryRent)}` : '—', sub: remDays ? `${remDays}/${totDays} days` : 'Enter closure date', cls: 'text-warning' },
//                               { lbl: 'Auto TDS (10%)', val: entryAutoTds > 0 ? `₹${fmtINR(entryAutoTds)}` : 'N/A', sub: entryAutoTds > 0 ? `Net = ₹${fmtINR(entryRent - entryAutoTds)}` : 'Rent < ₹50k', cls: entryAutoTds > 0 ? 'text-danger' : 'text-muted' },
//                               { lbl: '% of Sale',      val: `${rowPct}%`, sub: '', cls: 'text-primary' },
//                             ].map(({ lbl, val, sub, cls }) => (
//                               <div key={lbl}>
//                                 <div className="text-muted fw-bold" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>{lbl}</div>
//                                 <div className={`fw-bold fs-6 ${cls}`}>{val}</div>
//                                 {sub && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{sub}</div>}
//                               </div>
//                             ))}
//                           </div>
//                         )}
//                       </div>
//                     </div>
//                   );
//                 })
//               )}

//               {partialPayments.length > 1 && (
//                 <div className="card border-0 bg-primary bg-opacity-10 mt-3">
//                   <div className="card-body p-3">
//                     <p className="fw-bold small text-uppercase text-primary mb-3">
//                       <i className="bi bi-bar-chart me-1" />Combined Summary — {partialPayments.length} Installments
//                     </p>
//                     <div className="row row-cols-3 row-cols-md-6 g-2">
//                       <StatCard label="Total Bank"     value={`₹${fmtINR(pBankTotal)}`} sub="Bank only"      colorClass="bg-success-subtle" />
//                       <StatCard label="Total TDS Rcvd" value={`₹${fmtINR(pTdsColl)}`}   sub="TDS only"      colorClass="bg-info-subtle" />
//                       <StatCard label="Total Received" value={`₹${fmtINR(pRcvd)}`}      sub={`${pPct}%`}    colorClass="bg-primary-subtle" />
//                       <StatCard label="Total Rent"     value={`₹${fmtINR(pRent)}`}      sub="Prorated sum"  colorClass="bg-warning-subtle" />
//                       <StatCard label="Auto TDS (10%)" value={`₹${fmtINR(pEstTds)}`}    sub={pTdsAppl === 'Y' ? 'Deducted' : 'N/A'} colorClass="bg-danger-subtle" />
//                       <StatCard label="Net Payout"     value={`₹${fmtINR(pNet)}`}       sub="After auto TDS" colorClass="bg-success-subtle" />
//                     </div>
//                     <div className="mt-3"><TdsBadge applicable={pTdsAppl} /></div>
//                   </div>
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         {/* ══ Financial Summary ══ */}
//         <div className="card border-0 shadow-sm mb-4">
//           <div className="card-header d-flex align-items-center py-3 text-white" style={{ background: '#0891b2' }}>
//             <i className="bi bi-graph-up me-2" />
//             <span className="fw-semibold">Financial Summary</span>
//             {selectedUnit && <span className="ms-2 opacity-75 small">— {selectedUnit.unit_ref}</span>}
//           </div>
//           <div className="card-body p-4">
//             <div className="row row-cols-3 row-cols-md-6 g-2">
//               <StatCard label="Total Sale"     value={`₹${fmtINR(formData.totalSaleConsideration)}`} sub="Property value"              colorClass="bg-primary-subtle" />
//               <StatCard label="Total Received" value={`₹${fmtINR(paymentMode === 'full' ? fullTotal : pRcvd)}`} sub={paymentMode === 'full' ? 'Bank + TDS' : `${partialPayments.length} installment(s)`} colorClass="bg-success-subtle" />
//               <StatCard label="Outstanding"    value={`₹${fmtINR(paymentMode === 'full' ? fullOutst : pOutst)}`} sub={(paymentMode === 'full' ? fullOutst : pOutst) <= 0 ? '✓ Paid' : 'Pending'} colorClass={(paymentMode === 'full' ? fullOutst : pOutst) > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'} />
//               <StatCard label="Received %"     value={`${paymentMode === 'full' ? fullPct : pPct}%`} sub="of Total Sale"              colorClass="bg-info-subtle" />
//               <StatCard label={paymentMode === 'full' ? 'Monthly Rent' : 'Total Rent'} value={`₹${fmtINR(paymentMode === 'full' ? fullRent : pRent)}`} sub={paymentMode === 'full' ? 'Full month' : 'Sum prorated'} colorClass="bg-warning-subtle" />
//               <StatCard label="Net Payout"     value={`₹${fmtINR(paymentMode === 'full' ? fullNet : pNet)}`} sub="After auto TDS"    colorClass="bg-success-subtle" />
//             </div>
//             <div className="mt-3"><TdsBadge applicable={activeTdsAppl} /></div>
//           </div>
//         </div>

//         {/* ══ Action Buttons ══ */}
//         <div className="d-flex gap-3 flex-wrap pb-4">
//           <button type="submit" className="btn btn-primary px-4 fw-bold" disabled={loading}>
//             {loading
//               ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
//               : <><i className="bi bi-check-circle-fill me-2" />Save Financial Data</>}
//           </button>
//           <button type="button" className="btn btn-outline-secondary px-4 fw-semibold" onClick={handleReset} disabled={loading}>
//             <i className="bi bi-arrow-counterclockwise me-2" />Reset Form
//           </button>
//         </div>

//       </form>
//     </div>
//   );
// };

// export default FinancialManagement;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import Select from 'react-select';
import customerService from '../../Services/customer.service';
import financialService from '../../Services/financial.service';

/* ─── Pure helpers ─────────────────────────────────────────────────────────── */
const toFloat = (v) => parseFloat(v) || 0;
const round2  = (v) => Math.round(toFloat(v) * 100) / 100;
const round0  = (v) => Math.round(toFloat(v));
const fmtINR  = (v) =>
  round2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toInputDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? (typeof v === 'string' ? v.split('T')[0] : '')
    : d.toISOString().split('T')[0];
};

const calcFullRent = (sqft, rentPerSFT) => {
  const q = toFloat(sqft), r = toFloat(rentPerSFT);
  return q && r ? round2(q * r) : 0;
};

const calcPartialRent = (amountReceived, closureDateStr, totalSale, sqft, rentPerSFT) => {
  const q = toFloat(sqft), r = toFloat(rentPerSFT);
  if (!q || !r) return 0;
  const a = toFloat(amountReceived), s = toFloat(totalSale);
  if (!a || !s || !closureDateStr) return 0;
  const d = new Date(closureDateStr);
  if (isNaN(d.getTime())) return 0;
  const totalDays   = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysCharged = totalDays - d.getDate() + 1;
  return round2((a / s) * (q * r) * (daysCharged / totalDays));
};

const autoTdsOnRent        = (rent) => rent >= 50000 ? round0(rent * 0.1) : 0;
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

/* ─── Empty states ─────────────────────────────────────────────────────────── */
const EMPTY_FORM = {
  customerUnitId:         '',
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
        <div className="text-muted fw-semibold"
          style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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

/* ─── Custom react-select option renderer ─────────────────────────────────── */
const UnitOption = ({ data, innerProps, isFocused, isSelected }) => (
  <div
    {...innerProps}
    className="px-3 py-2"
    style={{
      cursor: 'pointer',
      backgroundColor: isSelected ? '#0d6efd' : isFocused ? '#f0f4ff' : '#fff',
      color: isSelected ? '#fff' : '#212529',
      borderBottom: '1px solid #f0f0f0',
    }}
  >
    <div className="d-flex align-items-center gap-2 flex-wrap">
      <span className={`badge ${isSelected ? 'bg-light text-primary' : 'bg-primary'}`}
        style={{ fontSize: '0.7rem' }}>
        {data.unit.unit_ref || 'UNIT'}
      </span>
      <strong style={{ fontSize: '0.88rem' }}>
        Floor {data.unit.floor_no || '?'} · Unit {data.unit.unit_no || '?'}
      </strong>
      <span className={`badge ${isSelected ? 'bg-light text-success' : 'bg-success-subtle text-success'}`}
        style={{ fontSize: '0.7rem' }}>
        {data.unit.sqft || '?'} sqft
      </span>
      <span className={`badge ${isSelected ? 'bg-light text-dark' : 'bg-light text-secondary'}`}
        style={{ fontSize: '0.7rem' }}>
        {data.unit.agreement_type}
      </span>
      <span className={`badge ${
        data.unit.status === 'Active'
          ? (isSelected ? 'bg-light text-success' : 'bg-success')
          : 'bg-secondary'
      }`} style={{ fontSize: '0.7rem', color: isSelected && data.unit.status === 'Active' ? undefined : '#fff' }}>
        {data.unit.status}
      </span>
    </div>
    <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>
      {data.unit.property_name}
    </div>
  </div>
);

const GroupLabel = ({ data }) => (
  <div className="px-3 py-2" style={{ background: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
    <div className="d-flex align-items-center gap-2">
      <i className="bi bi-person-circle text-primary" />
      <strong style={{ fontSize: '0.85rem', color: '#0d6efd' }}>{data.label}</strong>
      <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.65rem' }}>
        {data.options.length} unit{data.options.length > 1 ? 's' : ''}
      </span>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
const FinancialManagement = () => {
  const [units,           setUnits]           = useState([]);
  const [selectedUnit,    setSelectedUnit]    = useState(null);
  const [selectedOption,  setSelectedOption]  = useState(null);
  const [formData,        setFormData]        = useState(EMPTY_FORM);
  const [paymentMode,     setPaymentMode]     = useState('full');
  const [tdsOverride,     setTdsOverride]     = useState('auto');
  const [partialPayments, setPartialPayments] = useState([]);
  const [errors,          setErrors]          = useState({});
  const [loading,         setLoading]         = useState(false);

  useEffect(() => { loadUnits(); }, []);

  /* ── Load all units ── */
  const loadUnits = async () => {
    try {
      const r = await customerService.getAllCustomers({ limit: 1000 });
      setUnits(r.data.customers || []);
    } catch {
      toast.error('Failed to load units');
    }
  };

  /* ── Build grouped react-select options ── */
  const groupedOptions = useMemo(() => {
    const map = {};
    units.forEach((u) => {
      const key = u.customer_ref || u.customer_id || u.id;
      if (!map[key]) {
        map[key] = {
          label: `${u.customer_ref || u.customer_id} — ${u.customer_name}`,
          options: [],
        };
      }
      map[key].options.push({
        value: u.id,
        label: `${u.unit_ref || 'UNIT'} · F${u.floor_no || '?'} U${u.unit_no || '?'} · ${u.sqft || '?'} sqft · ${u.agreement_type} · ${u.status}`,
        unit: u,
      });
    });
    return Object.values(map);
  }, [units]);

  /* ── Custom filter: search by customer name, unit ref, unit no, floor ── */
  const filterOption = useCallback((option, inputValue) => {
    if (!inputValue) return true;
    const q = inputValue.toLowerCase();
    const u = option.data?.unit;
    if (!u) return false;
    return (
      (u.customer_name || '').toLowerCase().includes(q) ||
      (u.customer_ref  || '').toLowerCase().includes(q) ||
      (u.unit_ref      || '').toLowerCase().includes(q) ||
      (u.unit_no       || '').toLowerCase().includes(q) ||
      (u.floor_no      || '').toLowerCase().includes(q) ||
      (u.property_name || '').toLowerCase().includes(q) ||
      (u.pan_number    || '').toLowerCase().includes(q)
    );
  }, []);

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

  /* ── Unit selection ── */
  const handleUnitSelect = async (option) => {
    setSelectedOption(option);
    if (!option) { handleReset(); return; }

    const unitId = option.value;
    const sel    = option.unit;
    setSelectedUnit(sel);

    try {
      const res = await financialService.getByCustomerId(unitId);
      if (res.success && res.data) {
        const r    = res.data;
        const mode = r.payment_mode || 'full';

        setFormData({
          customerUnitId:         unitId,
          sqft:                   sel?.sqft || r.sqft || '',
          totalSaleConsideration: r.total_sale_consideration || '',
          rentalValuePerSFT:      r.rental_value_per_sft    || '',
          paymentClosureDate:     toInputDate(r.payment_closure_date),
          bankCollection:         r.bank_collection  ?? '',
          tdsCollection:          r.tds_collection   ?? '',
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
        toast.info(`Financial data loaded for ${sel?.unit_ref || 'unit'}`);
      } else {
        setFormData((prev) => ({ ...prev, customerUnitId: unitId, sqft: sel?.sqft || '' }));
        setPartialPayments([]);
        setPaymentMode('full');
        setTdsOverride('auto');
      }
    } catch {
      setFormData((prev) => ({ ...prev, customerUnitId: unitId, sqft: sel?.sqft || '' }));
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
  const addEntry    = () => setPartialPayments((prev) => [...prev, EMPTY_ENTRY()]);
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
        prev.map((p) => p.id !== id ? p : { ...p, [field]: value }),
        formData.totalSaleConsideration, formData.sqft, formData.rentalValuePerSFT
      )
    );

  /* ── Validation ── */
  const validate = () => {
    const e = {};
    if (!formData.customerUnitId)
      e.customerUnitId = 'Select a unit';
    if (!formData.totalSaleConsideration || toFloat(formData.totalSaleConsideration) <= 0)
      e.totalSaleConsideration = 'Enter a valid total sale amount';
    if (!formData.rentalValuePerSFT || toFloat(formData.rentalValuePerSFT) <= 0)
      e.rentalValuePerSFT = 'Enter a valid rental rate';
    if (paymentMode === 'full') {
      if (formData.bankCollection === '' || formData.bankCollection === undefined)
        e.bankCollection = 'Bank amount is required';
      if (!formData.dateOfPayment)
        e.dateOfPayment = 'Date of payment is required';
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
        date:               p.date              || null,
        paymentClosureDate: p.paymentClosureDate || null,
        rent:               round2(toFloat(p.rent)),
      }));

      const payload = {
        customerUnitId:         formData.customerUnitId,
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
    setSelectedUnit(null);
    setSelectedOption(null);
  };

  /* ─── react-select custom styles ─── */
  const selectStyles = {
    control: (base, state) => ({
      ...base,
      borderColor: errors.customerUnitId
        ? '#dc3545'
        : state.isFocused ? '#86b7fe' : '#ced4da',
      boxShadow: errors.customerUnitId
        ? '0 0 0 0.25rem rgba(220,53,69,.25)'
        : state.isFocused ? '0 0 0 0.25rem rgba(13,110,253,.25)' : 'none',
      minHeight: 38,
    }),
    option: () => ({}),           // handled by UnitOption component
    groupHeading: () => ({}),     // handled by GroupLabel component
    menu: (base) => ({ ...base, zIndex: 9999 }),
  };

  /* ═══════════════════════════════════════ RENDER ══════════════════════════ */
  return (
    <div className="bg-light min-vh-100 py-4 px-3">

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-cash-stack text-primary me-2" />Financial Management
          </h4>
          <small className="text-muted">
            Record sale collections, payment schedules &amp; rental calculations — <strong>per flat/unit</strong>
          </small>
        </div>
        {selectedUnit && (
          <div className="d-flex flex-wrap gap-2">
            <span className="badge bg-primary-subtle border border-primary text-primary fs-6 px-3 py-2">
              <i className="bi bi-building me-1" />
              {selectedUnit.unit_ref} — {selectedUnit.property_name} F{selectedUnit.floor_no} U{selectedUnit.unit_no}
            </span>
            <span className="badge bg-success-subtle border border-success text-success fs-6 px-3 py-2">
              <i className="bi bi-person-check me-1" />
              {selectedUnit.customer_name} &nbsp;·&nbsp; {selectedUnit.sqft} sq.ft
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate>

        {/* ══ STEP 1 — Unit Selection ══ */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex align-items-center py-3 bg-primary text-white">
            <span className="badge bg-white text-primary me-2 fw-bold px-2">01</span>
            <span className="fw-semibold">Select Unit &amp; Property Details</span>
          </div>
          <div className="card-body p-4">
            <div className="row g-3">

              {/* ── Searchable unit dropdown ── */}
              <div className="col-12">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Select Flat / Unit <span className="text-danger">*</span>
                </label>
                <Select
                  options={groupedOptions}
                  value={selectedOption}
                  onChange={handleUnitSelect}
                  filterOption={filterOption}
                  components={{ Option: UnitOption, GroupHeading: GroupLabel }}
                  styles={selectStyles}
                  placeholder={
                    <span className="text-muted">
                      <i className="bi bi-search me-2" />Search by customer name, unit no, floor…
                    </span>
                  }
                  isClearable
                  isSearchable
                  noOptionsMessage={({ inputValue }) =>
                    inputValue ? `No units found for "${inputValue}"` : 'No units available'
                  }
                  classNamePrefix="react-select"
                />
                {errors.customerUnitId && (
                  <div className="text-danger small mt-1">
                    <i className="bi bi-exclamation-circle me-1" />{errors.customerUnitId}
                  </div>
                )}
                <div className="form-text">
                  Type a name, unit number, floor or PAN to search. Units are grouped by customer.
                </div>
              </div>

              {/* Sqft */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Built-up Area (sq.ft)
                </label>
                <input
                  className="form-control form-control-sm bg-light text-muted"
                  value={formData.sqft}
                  readOnly
                  placeholder="Auto-filled"
                />
                <div className="form-text">From unit record</div>
              </div>

              {/* Total sale */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Total Sale Consideration (₹) <span className="text-danger">*</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  className={`form-control form-control-sm ${errors.totalSaleConsideration ? 'is-invalid' : ''}`}
                  name="totalSaleConsideration"
                  value={formData.totalSaleConsideration}
                  onChange={handleChange}
                  placeholder="e.g. 40000000"
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
                  name="rentalValuePerSFT"
                  value={formData.rentalValuePerSFT}
                  onChange={handleChange}
                  placeholder="e.g. 70"
                  onWheel={(e) => e.target.blur()}
                />
                {errors.rentalValuePerSFT && (
                  <div className="invalid-feedback">{errors.rentalValuePerSFT}</div>
                )}
              </div>

              {/* Closure date */}
              <div className="col-md-3 col-sm-6">
                <label className="form-label fw-semibold small text-uppercase text-muted">
                  Overall Payment Closure Date
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  name="paymentClosureDate"
                  value={formData.paymentClosureDate}
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

            {/* Rent preview */}
            {formData.sqft && formData.rentalValuePerSFT && (
              <div className="alert alert-primary d-flex flex-wrap align-items-center gap-4 mt-3 mb-0 py-3">
                <div>
                  <div className="small fw-bold text-uppercase text-primary opacity-75">
                    Full Monthly Rent
                  </div>
                  <div className="fw-bold fs-4 text-primary">₹{fmtINR(fullRent)}</div>
                  <small className="text-muted">
                    {formData.sqft} sqft × ₹{formData.rentalValuePerSFT}/sqft
                    {selectedUnit && <> — {selectedUnit.unit_ref}</>}
                  </small>
                </div>
                <div className="border-start ps-4">
                  <TdsBadge applicable={activeTdsAppl} />
                  <div className="mt-2 small">
                    {fullTdsAppl === 'Y' ? (
                      <span className="text-warning fw-semibold">
                        Auto TDS 10% = ₹{fmtINR(fullAutoTds)} &nbsp;|&nbsp;
                        Net = ₹{fmtINR(fullRent - fullAutoTds)}
                      </span>
                    ) : (
                      <span className="text-muted">No TDS — rent below ₹50,000 threshold</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══ STEP 2 — Payment Mode ══ */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex align-items-center py-3"
            style={{ background: '#7c3aed', color: '#fff' }}>
            <span className="badge bg-white fw-bold me-2 px-2" style={{ color: '#7c3aed' }}>02</span>
            <span className="fw-semibold">Payment Mode</span>
          </div>
          <div className="card-body p-4">
            <div className="row g-3">
              {[
                {
                  mode: 'full', icon: 'bi-cash-coin', label: 'Full / Lump-Sum', color: 'primary',
                  desc: 'Single bank transfer. Rent = Sqft × Rate (full month).',
                },
                {
                  mode: 'partial', icon: 'bi-calendar-week', label: 'Partial / Installments', color: 'success',
                  desc: 'Multiple payments. Rent prorated by remaining days in closure month.',
                },
              ].map(({ mode, icon, label, desc, color }) => (
                <div className="col-md-6" key={mode}>
                  <div
                    className={`card h-100 border-2 ${
                      paymentMode === mode ? `border-${color} bg-${color} bg-opacity-10` : 'border-light'
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
            <div className="card-header d-flex align-items-center py-3 text-white"
              style={{ background: '#16a34a' }}>
              <span className="badge bg-white fw-bold me-2 px-2 text-success">03</span>
              <span className="fw-semibold">Full Payment Details</span>
            </div>
            <div className="card-body p-4">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label fw-semibold small text-uppercase text-muted">
                    Date of Payment <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    className={`form-control form-control-sm ${errors.dateOfPayment ? 'is-invalid' : ''}`}
                    name="dateOfPayment"
                    value={formData.dateOfPayment}
                    onChange={handleChange}
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
                    name="bankCollection"
                    value={formData.bankCollection}
                    onChange={handleChange}
                    placeholder="e.g. 40000000"
                    onWheel={(e) => e.target.blur()}
                  />
                  {errors.bankCollection && (
                    <div className="invalid-feedback">{errors.bankCollection}</div>
                  )}
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-semibold small text-uppercase text-muted">
                    TDS Collected (₹)
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    className="form-control form-control-sm"
                    name="tdsCollection"
                    value={formData.tdsCollection}
                    onChange={handleChange}
                    placeholder="0"
                    onWheel={(e) => e.target.blur()}
                  />
                  {fullAutoTds > 0
                    ? <div className="form-text text-warning fw-semibold">💡 Auto TDS = ₹{fmtINR(fullAutoTds)}</div>
                    : <div className="form-text">TDS deducted at source (can be 0)</div>}
                </div>
              </div>

              {formData.bankCollection && formData.sqft && formData.rentalValuePerSFT && (
                <div className="mt-4">
                  <hr className="my-3" />
                  <p className="text-muted fw-semibold small text-uppercase mb-3">📊 Calculated Results</p>
                  <div className="row row-cols-3 row-cols-md-6 g-2">
                    <StatCard label="Total Received" value={`₹${fmtINR(fullTotal)}`}  sub="Bank + TDS"    colorClass="bg-success-subtle" />
                    <StatCard label="Received %"     value={`${fullPct}%`}             sub="of Total Sale" colorClass="bg-primary-subtle" />
                    <StatCard label="Outstanding"    value={`₹${fmtINR(fullOutst)}`}  sub={fullOutst <= 0 ? '✓ Fully Paid' : 'Remaining'} colorClass={fullOutst > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'} />
                    <StatCard label="Monthly Rent"   value={`₹${fmtINR(fullRent)}`}   sub="Full month"    colorClass="bg-warning-subtle" />
                    <StatCard label="TDS (10%)"      value={`₹${fmtINR(fullEstTds)}`} sub={fullTdsAppl === 'Y' ? 'Auto deducted' : 'N/A'} colorClass="bg-info-subtle" />
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
            <div className="card-header d-flex align-items-center justify-content-between py-3 text-white"
              style={{ background: '#16a34a' }}>
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
              {pRcvd > 0 && (
                <div className={`alert ${is100Pct ? 'alert-success' : 'alert-warning'} d-flex align-items-center gap-2 mb-3`}>
                  <i className={`bi ${is100Pct ? 'bi-check-circle-fill' : 'bi-hourglass-split'} fs-5`} />
                  {is100Pct
                    ? <><strong>100% received</strong> — ₹{fmtINR(pRcvd)} of ₹{fmtINR(totalSaleNum)}</>
                    : <><strong>{pPct}%</strong> received — ₹{fmtINR(pRcvd)} of ₹{fmtINR(totalSaleNum)} (₹{fmtINR(pOutst)} outstanding)</>}
                </div>
              )}
              {errors.partialPayments && (
                <div className="alert alert-danger py-2 mb-3">
                  <i className="bi bi-exclamation-triangle me-1" />{errors.partialPayments}
                </div>
              )}

              {partialPayments.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-inbox display-4 d-block mb-2" />
                  <p className="fw-semibold mb-1">No entries yet</p>
                  <button type="button" className="btn btn-success btn-sm" onClick={addEntry}>
                    <i className="bi bi-plus-circle me-1" />Add First Entry
                  </button>
                </div>
              ) : (
                partialPayments.map((p, i) => {
                  const rowAmt    = round2(toFloat(p.bankAmount) + toFloat(p.tdsAmount));
                  const rowPct    = totalSaleNum > 0 ? round2((rowAmt / totalSaleNum) * 100) : 0;
                  const cD        = p.paymentClosureDate ? new Date(p.paymentClosureDate) : null;
                  const validDate = cD && !isNaN(cD.getTime());
                  const totDays   = validDate ? new Date(cD.getFullYear(), cD.getMonth() + 1, 0).getDate() : null;
                  const dayNum    = validDate ? cD.getDate() : null;
                  const remDays   = (totDays && dayNum) ? totDays - dayNum + 1 : null;
                  const entryRent    = round2(toFloat(p.rent));
                  const entryAutoTds = autoTdsOnRent(entryRent);

                  return (
                    <div key={p.id} className={`card border mb-3 ${i % 2 === 0 ? '' : 'bg-light'}`}>
                      <div className="card-body p-3">
                        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <span className="badge bg-primary rounded-pill px-3">#{i + 1}</span>
                            {entryRent > 0 && (
                              <span className="badge bg-success-subtle text-success border border-success-subtle">
                                Rent: ₹{fmtINR(entryRent)}
                              </span>
                            )}
                          </div>
                          <button type="button" className="btn btn-outline-danger btn-sm"
                            onClick={() => removeEntry(p.id)}>
                            <i className="bi bi-trash me-1" />Remove
                          </button>
                        </div>
                        <div className="row g-3">
                          <div className="col-md-3 col-sm-6">
                            <label className="form-label fw-semibold small text-uppercase text-muted">
                              Bank Amount (₹) <span className="text-danger">*</span>
                            </label>
                            <input
                              type="number" step="0.01" min="0"
                              className={`form-control form-control-sm ${errors[`pBank_${i}`] ? 'is-invalid' : ''}`}
                              placeholder="e.g. 4000000"
                              value={p.bankAmount}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) => changeEntry(p.id, 'bankAmount', e.target.value)}
                            />
                            {errors[`pBank_${i}`] && (
                              <div className="invalid-feedback">{errors[`pBank_${i}`]}</div>
                            )}
                          </div>
                          <div className="col-md-3 col-sm-6">
                            <label className="form-label fw-semibold small text-uppercase text-muted">
                              TDS Received (₹)
                            </label>
                            <input
                              type="number" step="0.01" min="0"
                              className="form-control form-control-sm"
                              placeholder="0"
                              value={p.tdsAmount}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) => changeEntry(p.id, 'tdsAmount', e.target.value)}
                            />
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
                            {errors[`pDate_${i}`] && (
                              <div className="invalid-feedback">{errors[`pDate_${i}`]}</div>
                            )}
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
                                📅 {remDays}/{totDays} days
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {rowAmt > 0 && (
                          <div className="d-flex flex-wrap gap-4 align-items-center bg-success bg-opacity-10 border border-success-subtle rounded p-2 mt-3">
                            {[
                              { lbl: 'Total Received', val: `₹${fmtINR(rowAmt)}`,    sub: `Bank ₹${fmtINR(p.bankAmount)} + TDS ₹${fmtINR(p.tdsAmount)}`, cls: 'text-success' },
                              { lbl: 'Prorated Rent',  val: entryRent > 0 ? `₹${fmtINR(entryRent)}` : '—', sub: remDays ? `${remDays}/${totDays} days` : 'Enter closure date', cls: 'text-warning' },
                              { lbl: 'Auto TDS (10%)', val: entryAutoTds > 0 ? `₹${fmtINR(entryAutoTds)}` : 'N/A', sub: entryAutoTds > 0 ? `Net = ₹${fmtINR(entryRent - entryAutoTds)}` : 'Rent < ₹50k', cls: entryAutoTds > 0 ? 'text-danger' : 'text-muted' },
                              { lbl: '% of Sale',      val: `${rowPct}%`,             sub: '',                  cls: 'text-primary' },
                            ].map(({ lbl, val, sub, cls }) => (
                              <div key={lbl}>
                                <div className="text-muted fw-bold"
                                  style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>{lbl}</div>
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

              {partialPayments.length > 1 && (
                <div className="card border-0 bg-primary bg-opacity-10 mt-3">
                  <div className="card-body p-3">
                    <p className="fw-bold small text-uppercase text-primary mb-3">
                      <i className="bi bi-bar-chart me-1" />
                      Combined Summary — {partialPayments.length} Installments
                    </p>
                    <div className="row row-cols-3 row-cols-md-6 g-2">
                      <StatCard label="Total Bank"     value={`₹${fmtINR(pBankTotal)}`} sub="Bank only"       colorClass="bg-success-subtle" />
                      <StatCard label="Total TDS Rcvd" value={`₹${fmtINR(pTdsColl)}`}   sub="TDS only"       colorClass="bg-info-subtle" />
                      <StatCard label="Total Received" value={`₹${fmtINR(pRcvd)}`}      sub={`${pPct}%`}     colorClass="bg-primary-subtle" />
                      <StatCard label="Total Rent"     value={`₹${fmtINR(pRent)}`}      sub="Prorated sum"   colorClass="bg-warning-subtle" />
                      <StatCard label="Auto TDS (10%)" value={`₹${fmtINR(pEstTds)}`}    sub={pTdsAppl === 'Y' ? 'Deducted' : 'N/A'} colorClass="bg-danger-subtle" />
                      <StatCard label="Net Payout"     value={`₹${fmtINR(pNet)}`}        sub="After auto TDS" colorClass="bg-success-subtle" />
                    </div>
                    <div className="mt-3"><TdsBadge applicable={pTdsAppl} /></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ Financial Summary ══ */}
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header d-flex align-items-center py-3 text-white"
            style={{ background: '#0891b2' }}>
            <i className="bi bi-graph-up me-2" />
            <span className="fw-semibold">Financial Summary</span>
            {selectedUnit && (
              <span className="ms-2 opacity-75 small">— {selectedUnit.unit_ref}</span>
            )}
          </div>
          <div className="card-body p-4">
            <div className="row row-cols-3 row-cols-md-6 g-2">
              <StatCard label="Total Sale"     value={`₹${fmtINR(formData.totalSaleConsideration)}`} sub="Property value"              colorClass="bg-primary-subtle" />
              <StatCard label="Total Received" value={`₹${fmtINR(paymentMode === 'full' ? fullTotal : pRcvd)}`} sub={paymentMode === 'full' ? 'Bank + TDS' : `${partialPayments.length} installment(s)`} colorClass="bg-success-subtle" />
              <StatCard label="Outstanding"    value={`₹${fmtINR(paymentMode === 'full' ? fullOutst : pOutst)}`} sub={(paymentMode === 'full' ? fullOutst : pOutst) <= 0 ? '✓ Paid' : 'Pending'} colorClass={(paymentMode === 'full' ? fullOutst : pOutst) > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'} />
              <StatCard label="Received %"     value={`${paymentMode === 'full' ? fullPct : pPct}%`} sub="of Total Sale"              colorClass="bg-info-subtle" />
              <StatCard label={paymentMode === 'full' ? 'Monthly Rent' : 'Total Rent'} value={`₹${fmtINR(paymentMode === 'full' ? fullRent : pRent)}`} sub={paymentMode === 'full' ? 'Full month' : 'Sum prorated'} colorClass="bg-warning-subtle" />
              <StatCard label="Net Payout"     value={`₹${fmtINR(paymentMode === 'full' ? fullNet : pNet)}`} sub="After auto TDS"    colorClass="bg-success-subtle" />
            </div>
            <div className="mt-3"><TdsBadge applicable={activeTdsAppl} /></div>
          </div>
        </div>

        {/* ══ Action Buttons ══ */}
        <div className="d-flex gap-3 flex-wrap pb-4">
          <button type="submit" className="btn btn-primary px-4 fw-bold" disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
              : <><i className="bi bi-check-circle-fill me-2" />Save Financial Data</>}
          </button>
          <button type="button" className="btn btn-outline-secondary px-4 fw-semibold"
            onClick={handleReset} disabled={loading}>
            <i className="bi bi-arrow-counterclockwise me-2" />Reset Form
          </button>
        </div>

      </form>
    </div>
  );
};

export default FinancialManagement;