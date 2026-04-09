import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import customerService from '../../Services/customer.service';
import Select from 'react-select';
import { formatDate } from '../../Utils/helpers';

// ─── Local validators (mirror the backend) ────────────────────────────────────
const validatePAN   = (v) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test((v || '').trim().toUpperCase());
const validateIFSC  = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test((v || '').trim().toUpperCase());
const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
const validatePhone = (v) => {
  const c = (v || '').replace(/[\s\-().+]/g, '');
  return /^\d{7,15}$/.test(c);
};
const validateGST = (v) => {
  if (!v) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test((v || '').trim().toUpperCase());
};
const validatePercentage = (v) => {
  if (v === '' || v === null || v === undefined) return true;
  const n = parseFloat(v);
  return !isNaN(n) && n >= 0 && n <= 100;
};

// ─── Payout split helpers ─────────────────────────────────────────────────────
const EMPTY_SPLIT = () => ({
  _key:               Date.now() + Math.random(),
  accountHolderName:  '',
  bankAccountNumber:  '',
  ifscCode:           '',
  bankName:           '',
  percentage:         '',
});

const splitTotal = (splits) =>
  splits.reduce((s, sp) => s + (parseFloat(sp.percentage) || 0), 0);

// ─── Component ────────────────────────────────────────────────────────────────
const CustomerForm = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const isEdit   = Boolean(id);

  const initialState = {
    customerId:              '',
    customerName:            '',
    nriStatus:               'No',
    panNumber:               '',
    gstNo:                   '',
    cgst:                    '9',
    sgst:                    '9',
    email:                   '',
    phone:                   '',
    dateOfBooking:           '',
    floorNo:                 '',
    unitNo:                  '',
    sqft:                    '',
    // Primary bank (kept for backward-compat; synced from splits[0])
    bankAccountNumber:       '',
    ifscCode:                '',
    bankName:                '',
    agreementType:           'Construction',
    investmentDate:          formatDate(new Date()),
    propertyName:            'R-ONE',
    constructionMonthlyRent: '',
    estimatedOccupancyDate:  '',
    baseRent9Year:           '',
    actualOccupancyDate:     '',
    tdsApplicable:           'N',
    address:                 '',
    status:                  'Active',
  };

  const [formData,       setFormData]       = useState(initialState);
  const [payoutSplits,   setPayoutSplits]   = useState([{ ...EMPTY_SPLIT(), percentage: '100' }]);
  const [loading,        setLoading]        = useState(false);
  const [errors,         setErrors]         = useState({});

  const floorOptions = Array.from({ length: 30 }, (_, i) => ({
    value: String(i + 1),
    label: `Floor ${i + 1}`,
  }));

  const isEscalationFloor = String(formData.floorNo) === '7';
  const totalGST          = (parseFloat(formData.cgst) || 0) + (parseFloat(formData.sgst) || 0);
  const splitSum          = splitTotal(payoutSplits);
  const splitOk           = Math.abs(splitSum - 100) < 0.01;

  // ── Load existing customer in edit mode ────────────────────────────────────
  useEffect(() => { 
    if (isEdit) fetchCustomer(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const data = await customerService.getCustomerById(id);

      setFormData({
        ...data,
        investmentDate:          data.investment_date           ? formatDate(data.investment_date)          : '',
        estimatedOccupancyDate:  data.estimated_occupancy_date  ? formatDate(data.estimated_occupancy_date) : '',
        actualOccupancyDate:     data.actual_occupancy_date     ? formatDate(data.actual_occupancy_date)    : '',
        dateOfBooking:           data.date_of_booking           ? formatDate(data.date_of_booking)          : '',
        customerId:              data.customer_id              || '',
        customerName:            data.customer_name            || '',
        nriStatus:               data.nri_status               || 'No',
        panNumber:               data.pan_number               || '',
        gstNo:                   data.gst_no                   || '',
        cgst:                    data.cgst  != null ? String(data.cgst) : '',
        sgst:                    data.sgst  != null ? String(data.sgst) : '',
        floorNo:                 data.floor_no                 || '',
        unitNo:                  data.unit_no                  || '',
        sqft:                    data.sqft                     || '',
        bankAccountNumber:       data.bank_account_number      || '',
        ifscCode:                data.ifsc_code                || '',
        bankName:                data.bank_name                || '',
        agreementType:           data.agreement_type           || 'Construction',
        propertyName:            data.property_name            || 'R-ONE',
        constructionMonthlyRent: data.construction_monthly_rent || '',
        baseRent9Year:           data.base_rent_9_year         || '',
        tdsApplicable:           data.tds_applicable           || 'N',
        address:                 data.address                  || '',
        status:                  data.status                   || 'Active',
      });

      // Restore payout splits if present
      if (Array.isArray(data.payout_splits) && data.payout_splits.length > 0) {
        setPayoutSplits(data.payout_splits.map((sp) => ({ ...sp, _key: Math.random() })));
      } else if (data.bank_account_number) {
        // Seed from primary bank fields (single split at 100 %)
        setPayoutSplits([{
          _key:               Math.random(),
          accountHolderName:  data.customer_name || '',
          bankAccountNumber:  data.bank_account_number || '',
          ifscCode:           data.ifsc_code || '',
          bankName:           data.bank_name || '',
          percentage:         '100',
        }]);
      }
    } catch {
      toast.error('Failed to load customer');
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  // ── Generic change handler ─────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    const upperFields = ['panNumber', 'ifscCode', 'gstNo'];
    const finalValue  = upperFields.includes(name) ? value.toUpperCase() : value;
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  // ── Payout split handlers ──────────────────────────────────────────────────
  const addSplit = () =>
    setPayoutSplits((prev) => [...prev, EMPTY_SPLIT()]);

  const removeSplit = (key) => {
    if (payoutSplits.length === 1) {
      toast.warn('At least one bank account is required');
      return;
    }
    setPayoutSplits((prev) => prev.filter((sp) => sp._key !== key));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith('split_')) delete next[k]; });
      return next;
    });
  };

  const changeSplit = (key, field, value) => {
    const upperSplitFields = ['ifscCode'];
    const finalValue = upperSplitFields.includes(field) ? value.toUpperCase() : value;
    setPayoutSplits((prev) =>
      prev.map((sp) => (sp._key !== key ? sp : { ...sp, [field]: finalValue }))
    );
    setErrors((prev) => ({ ...prev, [`split_${key}_${field}`]: '' }));
  };

  // Distribute remaining percentage evenly when "Auto-fill" is clicked
  const autoFillPercentages = () => {
    const each = parseFloat((100 / payoutSplits.length).toFixed(2));
    const splits = payoutSplits.map((sp, i) => ({
      ...sp,
      percentage: i === payoutSplits.length - 1
        ? String(parseFloat((100 - each * (payoutSplits.length - 1)).toFixed(2)))
        : String(each),
    }));
    setPayoutSplits(splits);
  };

  // ── Validate form ──────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};

    if (!formData.customerName.trim())            e.customerName      = 'Name is required';
    if (!validatePAN(formData.panNumber))         e.panNumber         = 'Invalid PAN (e.g. ABCDE1234F)';
    if (!validateEmail(formData.email))           e.email             = 'Invalid email address';
    if (!validatePhone(formData.phone))           e.phone             = 'Invalid phone (7–15 digits)';
    if (!formData.propertyName.trim())            e.propertyName      = 'Property name is required';
    if (!formData.dateOfBooking)                  e.dateOfBooking     = 'Date of Booking is required';
    if (!formData.floorNo?.trim())                e.floorNo           = 'Floor Number is required';
    if (!formData.unitNo?.trim())                 e.unitNo            = 'Unit number is required';
    if (!formData.sqft || parseFloat(formData.sqft) <= 0) e.sqft      = 'Valid sqft is required';

    if (formData.gstNo && !validateGST(formData.gstNo))
      e.gstNo = 'Invalid GST (e.g. 29ABCDE1234F1Z5)';
    if (!validatePercentage(formData.cgst)) e.cgst = 'CGST must be 0–100';
    if (!validatePercentage(formData.sgst)) e.sgst = 'SGST must be 0–100';
    if (formData.cgst !== '' && formData.sgst !== '' && totalGST > 100)
      e.cgst = 'CGST + SGST cannot exceed 100%';

    // ── Payout splits validation ───────────────────────────────────────────
    payoutSplits.forEach((sp, i) => {
      if (!sp.bankAccountNumber.trim())
        e[`split_${sp._key}_bankAccountNumber`] = `Account #${i + 1}: account number required`;
      if (!validateIFSC(sp.ifscCode))
        e[`split_${sp._key}_ifscCode`] = `Account #${i + 1}: invalid IFSC`;
      if (!sp.percentage || parseFloat(sp.percentage) <= 0)
        e[`split_${sp._key}_percentage`] = `Account #${i + 1}: percentage must be > 0`;
    });

    if (payoutSplits.length > 0 && !splitOk)
      e.splitTotal = `Percentages must sum to 100% (currently ${splitSum.toFixed(2)}%)`;

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error('Please fix the validation errors before submitting');
      return;
    }

    // Primary bank synced from first split entry for backward-compat
    const primary = payoutSplits[0];

    try {
      setLoading(true);
      const apiData = {
        customerName:            formData.customerName.trim(),
        nriStatus:               formData.nriStatus || 'No',
        panNumber:               formData.panNumber.toUpperCase().trim(),
        gstNo:                   formData.gstNo ? formData.gstNo.toUpperCase().trim() : null,
        cgst:                    formData.cgst !== '' ? parseFloat(formData.cgst) : null,
        sgst:                    formData.sgst !== '' ? parseFloat(formData.sgst) : null,
        email:                   formData.email.toLowerCase().trim(),
        phone:                   formData.phone.replace(/[\s\-().+]/g, ''),
        address:                 formData.address,
        dateOfBooking:           formData.dateOfBooking           || null,
        floorNo:                 formData.floorNo                 || null,
        sqft:                    formData.sqft                    || null,
        unitNo:                  formData.unitNo                  || null,
        // Primary bank = first split (backward-compat)
        bankAccountNumber:       primary.bankAccountNumber.trim(),
        ifscCode:                primary.ifscCode.toUpperCase().trim(),
        bankName:                primary.bankName,
        propertyName:            formData.propertyName.trim(),
        agreementType:           formData.agreementType,
        investmentDate:          formData.investmentDate          || null,
        constructionMonthlyRent: formData.constructionMonthlyRent || null,
        estimatedOccupancyDate:  formData.estimatedOccupancyDate  || null,
        baseRent9Year:           formData.baseRent9Year           || null,
        actualOccupancyDate:     formData.actualOccupancyDate     || null,
        tdsApplicable:           formData.tdsApplicable,
        status:                  formData.status,
        // Full split array
        payoutSplits: payoutSplits.map(({ _key, ...rest }) => ({
          ...rest,
          ifscCode:   rest.ifscCode.toUpperCase().trim(),
          percentage: parseFloat(rest.percentage),
        })),
      };

      if (isEdit) {
        await customerService.updateCustomer(id, apiData);
        toast.success('Customer updated successfully');
      } else {
        await customerService.createCustomer(apiData);
        toast.success('Customer created successfully');
        setFormData(initialState);
        setPayoutSplits([{ ...EMPTY_SPLIT(), percentage: '100' }]);
      }
      navigate('/customers');
    } catch (err) {
      const errData = err?.response?.data || err || {};
      toast.error(errData.error || 'Operation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading spinner (edit mode only) ──────────────────────────────────────
  if (loading && isEdit) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container-fluid">
      <div className="mb-4">
        <h4>{isEdit ? 'Edit Customer' : 'Add New Customer'}</h4>
        <p className="text-muted">Fill in the customer details</p>
      </div>

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Personal Information ─────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0"><i className="bi bi-person me-2" />Personal Information</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">

              <div className="col-md-6">
                <label className="form-label">Customer ID</label>
                <input
                  type="text" className="form-control"
                  name="customerId" value={formData.customerId}
                  placeholder="AUTO-GENERATED" disabled
                />
              </div>

              <div className="col-md-6">
                <label className="form-label">Full Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors.customerName ? 'is-invalid' : ''}`}
                  name="customerName" value={formData.customerName} onChange={handleChange}
                  placeholder="e.g. Rajesh Kumar"
                />
                {errors.customerName && <div className="invalid-feedback">{errors.customerName}</div>}
              </div>

              <div className="col-md-6">
                <label className="form-label">PAN Number <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors.panNumber ? 'is-invalid' : ''}`}
                  name="panNumber" value={formData.panNumber} onChange={handleChange}
                  maxLength={10} placeholder="ABCDE1234F"
                  style={{ textTransform: 'uppercase' }}
                />
                {errors.panNumber
                  ? <div className="invalid-feedback">{errors.panNumber}</div>
                  : <small className="text-muted">10 characters — 5 letters, 4 digits, 1 letter</small>}
              </div>

              <div className="col-md-6">
                <label className="form-label">Email <span className="text-danger">*</span></label>
                <input
                  type="email"
                  className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                  name="email" value={formData.email} onChange={handleChange}
                  placeholder="example@domain.com"
                />
                {errors.email && <div className="invalid-feedback">{errors.email}</div>}
              </div>

              <div className="col-md-6">
                <label className="form-label">Phone <span className="text-danger">*</span></label>
                <input
                  type="tel"
                  className={`form-control ${errors.phone ? 'is-invalid' : ''}`}
                  name="phone" value={formData.phone} onChange={handleChange}
                  maxLength={15} placeholder="9876543210 or +91-9876543210"
                />
                {errors.phone
                  ? <div className="invalid-feedback">{errors.phone}</div>
                  : <small className="text-muted">7–15 digits (Indian or international)</small>}
              </div>

              <div className="col-md-6">
                <label className="form-label">NRI Status</label>
                <select className="form-select" name="nriStatus" value={formData.nriStatus} onChange={handleChange}>
                  <option value="No">No</option>
                  <option value="Yes">Yes (NRI)</option>
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">Date of Booking <span className="text-danger">*</span></label>
                <input
                  type="date"
                  className={`form-control ${errors.dateOfBooking ? 'is-invalid' : ''}`}
                  name="dateOfBooking" value={formData.dateOfBooking} onChange={handleChange}
                />
                {errors.dateOfBooking && <div className="invalid-feedback">{errors.dateOfBooking}</div>}
              </div>

              <div className="col-md-4">
                <label className="form-label">Floor No <span className="text-danger">*</span></label>
                <Select
                  options={floorOptions}
                  value={floorOptions.find((o) => o.value === formData.floorNo) || null}
                  onChange={(selected) => {
                    setFormData((prev) => ({ ...prev, floorNo: selected ? selected.value : '' }));
                    if (errors.floorNo) setErrors((prev) => ({ ...prev, floorNo: '' }));
                  }}
                  placeholder="Search floor..."
                  isClearable
                  classNamePrefix="react-select"
                  styles={{
                    control: (base, state) => ({
                      ...base,
                      borderColor:  errors.floorNo ? '#dc3545' : state.isFocused ? '#86b7fe' : '#ced4da',
                      boxShadow:    errors.floorNo
                        ? '0 0 0 0.25rem rgba(220,53,69,.25)'
                        : state.isFocused ? '0 0 0 0.25rem rgba(13,110,253,.25)' : 'none',
                    }),
                    option: (base, { data }) => ({
                      ...base,
                      color:      data.value === '7' ? '#0d6efd' : base.color,
                      fontWeight: data.value === '7' ? '600' : 'normal',
                    }),
                  }}
                />
                {errors.floorNo && <div className="d-block invalid-feedback">{errors.floorNo}</div>}
                {isEscalationFloor && (
                  <div className="mt-2 p-2 rounded" style={{ backgroundColor: '#fff3cd', border: '1px solid #ffc107', fontSize: '0.82rem' }}>
                    ⚡ <strong>Escalation Notice:</strong> Floor 7 has rent escalation applied as per agreement.
                  </div>
                )}
              </div>

              <div className="col-md-4">
                <label className="form-label">Unit No <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors.unitNo ? 'is-invalid' : ''}`}
                  name="unitNo" value={formData.unitNo} onChange={handleChange}
                  placeholder="e.g. 501, A-12"
                />
                {errors.unitNo && <div className="invalid-feedback">{errors.unitNo}</div>}
              </div>

              <div className="col-md-4">
                <label className="form-label">Sqft <span className="text-danger">*</span></label>
                <input
                  type="number"
                  className={`form-control ${errors.sqft ? 'is-invalid' : ''}`}
                  name="sqft" value={formData.sqft} onChange={handleChange}
                  min="1" onWheel={(e) => e.target.blur()}
                />
                {errors.sqft && <div className="invalid-feedback">{errors.sqft}</div>}
              </div>

              <div className="col-md-12">
                <label className="form-label">Address</label>
                <textarea
                  className="form-control" name="address"
                  value={formData.address} onChange={handleChange} rows={2}
                  placeholder="Full address (optional)"
                />
              </div>

            </div>
          </div>
        </div>

        {/* ── GST Details ──────────────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header bg-warning text-dark">
            <h5 className="mb-0"><i className="bi bi-receipt me-2" />GST Details</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">

              <div className="col-md-4">
                <label className="form-label">GST Number</label>
                <input
                  type="text"
                  className={`form-control ${errors.gstNo ? 'is-invalid' : ''}`}
                  name="gstNo" value={formData.gstNo} onChange={handleChange}
                  maxLength={15} placeholder="29ABCDE1234F1Z5"
                  style={{ textTransform: 'uppercase' }}
                />
                {errors.gstNo
                  ? <div className="invalid-feedback">{errors.gstNo}</div>
                  : <small className="text-muted">15-character GSTIN (optional)</small>}
              </div>

              <div className="col-md-4">
                <label className="form-label">CGST (%)</label>
                <div className="input-group">
                  <input
                    type="number" step="0.01" min="0" max="100"
                    className={`form-control ${errors.cgst ? 'is-invalid' : ''}`}
                    name="cgst" value={formData.cgst} onChange={handleChange}
                    placeholder="9" onWheel={(e) => e.target.blur()}
                  />
                  <span className="input-group-text">%</span>
                  {errors.cgst && <div className="invalid-feedback">{errors.cgst}</div>}
                </div>
              </div>

              <div className="col-md-4">
                <label className="form-label">SGST (%)</label>
                <div className="input-group">
                  <input
                    type="number" step="0.01" min="0" max="100"
                    className={`form-control ${errors.sgst ? 'is-invalid' : ''}`}
                    name="sgst" value={formData.sgst} onChange={handleChange}
                    placeholder="9" onWheel={(e) => e.target.blur()}
                  />
                  <span className="input-group-text">%</span>
                  {errors.sgst && <div className="invalid-feedback">{errors.sgst}</div>}
                </div>
              </div>

              {(formData.cgst !== '' || formData.sgst !== '') && (
                <div className="col-12">
                  <div className="rounded p-3 d-flex align-items-center gap-4" style={{ background: '#fff8e1', border: '1px solid #ffe082' }}>
                    <div><span className="text-muted small">CGST</span><div className="fw-bold">{formData.cgst || '0'}%</div></div>
                    <div className="text-muted fs-5">+</div>
                    <div><span className="text-muted small">SGST</span><div className="fw-bold">{formData.sgst || '0'}%</div></div>
                    <div className="text-muted fs-5">=</div>
                    <div>
                      <span className="text-muted small">Total GST</span>
                      <div className={`fw-bold fs-5 ${totalGST > 100 ? 'text-danger' : 'text-success'}`}>{totalGST.toFixed(2)}%</div>
                    </div>
                    <div className="ms-auto">
                      {totalGST > 0 && totalGST <= 100
                        ? <span className="badge bg-success"><i className="bi bi-check-circle me-1" />Valid GST Rate</span>
                        : totalGST > 100
                          ? <span className="badge bg-danger"><i className="bi bi-exclamation-triangle me-1" />Exceeds 100%</span>
                          : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ── PAYOUT SPLIT ACCOUNTS (replaces old single Bank Details card) ──
            ══════════════════════════════════════════════════════════════════ */}
        <div className="card mb-4">
          <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
            <h5 className="mb-0"><i className="bi bi-bank me-2" />Payout Bank Accounts &amp; Split</h5>
            <div className="d-flex gap-2 align-items-center">
              {payoutSplits.length > 1 && (
                <button type="button" className="btn btn-light btn-sm" onClick={autoFillPercentages} title="Distribute equally">
                  <i className="bi bi-distribute-vertical me-1" />Auto-split equally
                </button>
              )}
              <button type="button" className="btn btn-light btn-sm" onClick={addSplit}>
                <i className="bi bi-plus-circle me-1" />Add Account
              </button>
            </div>
          </div>

          <div className="card-body">
            {/* Info banner */}
            <div className="alert alert-info d-flex gap-2 mb-3 py-2">
              <i className="bi bi-info-circle-fill mt-1 flex-shrink-0" />
              <div className="small">
                Add one account for a full payout, or multiple accounts with percentages that must total <strong>100%</strong>.
                Each month's rent is automatically split and disbursed to each account in proportion.
              </div>
            </div>

            {/* Global split-total error */}
            {errors.splitTotal && (
              <div className="alert alert-danger py-2 mb-3">
                <i className="bi bi-exclamation-triangle me-1" />{errors.splitTotal}
              </div>
            )}

            {/* Split rows */}
            {payoutSplits.map((sp, idx) => {
              // eslint-disable-next-line
              const splitAmount = splitOk
                ? null
                : null; // computed later per-payment
              return (
                <div
                  key={sp._key}
                  className="card border mb-3"
                  style={{ borderLeft: '4px solid #198754' }}
                >
                  <div className="card-body p-3">
                    {/* Row header */}
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="badge bg-success rounded-pill px-3 fs-6">Account #{idx + 1}</span>
                        {sp.bankName && <span className="badge bg-light text-dark border">{sp.bankName}</span>}
                        {sp.percentage && (
                          <span className={`badge ${parseFloat(sp.percentage) > 0 ? 'bg-primary' : 'bg-secondary'}`}>
                            {sp.percentage}%
                          </span>
                        )}
                      </div>
                      {payoutSplits.length > 1 && (
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeSplit(sp._key)}>
                          <i className="bi bi-trash me-1" />Remove
                        </button>
                      )}
                    </div>

                    <div className="row g-3">
                      {/* Account Holder Name */}
                      <div className="col-md-4">
                        <label className="form-label">Account Holder Name</label>
                        <input
                          type="text" className="form-control"
                          value={sp.accountHolderName}
                          onChange={(e) => changeSplit(sp._key, 'accountHolderName', e.target.value)}
                          placeholder="e.g. Rajesh Kumar"
                        />
                      </div>

                      {/* Account Number */}
                      <div className="col-md-4">
                        <label className="form-label">
                          Bank Account Number <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className={`form-control ${errors[`split_${sp._key}_bankAccountNumber`] ? 'is-invalid' : ''}`}
                          value={sp.bankAccountNumber}
                          onChange={(e) => changeSplit(sp._key, 'bankAccountNumber', e.target.value)}
                          placeholder="e.g. 00112233445566"
                        />
                        {errors[`split_${sp._key}_bankAccountNumber`] && (
                          <div className="invalid-feedback">{errors[`split_${sp._key}_bankAccountNumber`]}</div>
                        )}
                      </div>

                      {/* IFSC */}
                      <div className="col-md-4">
                        <label className="form-label">
                          IFSC Code <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className={`form-control ${errors[`split_${sp._key}_ifscCode`] ? 'is-invalid' : ''}`}
                          value={sp.ifscCode}
                          onChange={(e) => changeSplit(sp._key, 'ifscCode', e.target.value)}
                          maxLength={11} placeholder="SBIN0001234"
                          style={{ textTransform: 'uppercase' }}
                        />
                        {errors[`split_${sp._key}_ifscCode`]
                          ? <div className="invalid-feedback">{errors[`split_${sp._key}_ifscCode`]}</div>
                          : <small className="text-muted">4 letters, 0, 6 alphanumeric</small>}
                      </div>

                      {/* Bank Name */}
                      <div className="col-md-6">
                        <label className="form-label">Bank Name</label>
                        <input
                          type="text" className="form-control"
                          value={sp.bankName}
                          onChange={(e) => changeSplit(sp._key, 'bankName', e.target.value)}
                          placeholder="State Bank of India"
                        />
                      </div>

                      {/* Percentage */}
                      <div className="col-md-6">
                        <label className="form-label">
                          Split Percentage (%) <span className="text-danger">*</span>
                        </label>
                        <div className="input-group">
                          <input
                            type="number" step="0.01" min="0.01" max="100"
                            className={`form-control ${errors[`split_${sp._key}_percentage`] ? 'is-invalid' : ''}`}
                            value={sp.percentage}
                            onChange={(e) => changeSplit(sp._key, 'percentage', e.target.value)}
                            placeholder="e.g. 25"
                            onWheel={(e) => e.target.blur()}
                          />
                          <span className="input-group-text">%</span>
                          {errors[`split_${sp._key}_percentage`] && (
                            <div className="invalid-feedback">{errors[`split_${sp._key}_percentage`]}</div>
                          )}
                        </div>
                        <small className="text-muted">
                          All accounts must total 100%
                          {payoutSplits.length > 1 && ` — this account gets ${sp.percentage || 0}% of every rent payment`}
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Live percentage tracker */}
            <div className={`rounded p-3 mt-2 d-flex align-items-center gap-3 flex-wrap ${splitOk ? 'bg-success bg-opacity-10 border border-success' : 'bg-danger bg-opacity-10 border border-danger'}`}>
              <div>
                <span className="text-muted small">Accounts</span>
                <div className="fw-bold">{payoutSplits.length}</div>
              </div>
              <div className="vr" />
              {payoutSplits.map((sp, i) => (
                <div key={sp._key} className="text-center">
                  <span className="text-muted small">A/c #{i + 1}</span>
                  <div className="fw-bold text-primary">{sp.percentage || '0'}%</div>
                </div>
              ))}
              {payoutSplits.length > 1 && (
                <>
                  <div className="vr" />
                  <div>
                    <span className="text-muted small">Total</span>
                    <div className={`fw-bold fs-5 ${splitOk ? 'text-success' : 'text-danger'}`}>
                      {splitSum.toFixed(2)}%
                    </div>
                  </div>
                </>
              )}
              <div className="ms-auto">
                {splitOk
                  ? <span className="badge bg-success fs-6"><i className="bi bi-check-circle me-1" />Valid — sums to 100%</span>
                  : <span className="badge bg-danger fs-6"><i className="bi bi-exclamation-triangle me-1" />Must equal 100%</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Property & Agreement ─────────────────────────────── */}
        <div className="card mb-4">
          <div className="card-header bg-info text-white">
            <h5 className="mb-0"><i className="bi bi-building me-2" />Property &amp; Agreement</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">

              <div className="col-md-6">
                <label className="form-label">Property Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${errors.propertyName ? 'is-invalid' : ''}`}
                  name="propertyName" value={formData.propertyName} onChange={handleChange}
                />
                {errors.propertyName && <div className="invalid-feedback">{errors.propertyName}</div>}
              </div>

              <div className="col-md-6">
                <label className="form-label">Agreement Type</label>
                <select className="form-select" name="agreementType" value={formData.agreementType} onChange={handleChange}>
                  <option value="Construction">Construction Period</option>
                  <option value="9-Year">9-Year Rental</option>
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">Investment Date</label>
                <input type="date" className="form-control" name="investmentDate" value={formData.investmentDate} onChange={handleChange} />
              </div>

              <div className="col-md-6">
                <label className="form-label">Estimated Occupancy Date</label>
                <input type="date" className="form-control" name="estimatedOccupancyDate" value={formData.estimatedOccupancyDate} onChange={handleChange} />
              </div>

              <div className="col-md-6">
                <label className="form-label">Actual Occupancy Date</label>
                <input type="date" className="form-control" name="actualOccupancyDate" value={formData.actualOccupancyDate} onChange={handleChange} />
              </div>

              <div className="col-md-3">
                <label className="form-label">TDS Applicable</label>
                <select className="form-select" name="tdsApplicable" value={formData.tdsApplicable} onChange={handleChange}>
                  <option value="N">N — Auto threshold</option>
                  <option value="Y">Y — Always</option>
                </select>
              </div>

              <div className="col-md-3">
                <label className="form-label">Status</label>
                <select className="form-select" name="status" value={formData.status} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

            </div>
          </div>
        </div>

        {/* ── Action Buttons ───────────────────────────────────── */}
        <div className="d-flex gap-2 pb-4">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? <><span className="spinner-border spinner-border-sm me-2" />Processing...</>
              : <><i className="bi bi-check-circle me-2" />{isEdit ? 'Update Customer' : 'Create Customer'}</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/customers')} disabled={loading}>
            <i className="bi bi-x-circle me-2" />Cancel
          </button>
        </div>

      </form>
    </div>
  );
};

export default CustomerForm;