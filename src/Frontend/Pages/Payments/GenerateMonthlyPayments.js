import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import { formatCurrency } from '../../Utils/helpers';
import '../../Styles/GenerateMonthlyPayments.css';

// Initiation month M → Rent month M-1
const getRentMonthFromInitiation = (initiationMonth) => {
  if (!initiationMonth) return '';
  const [yr, mo] = initiationMonth.split('-').map(Number);
  const d = new Date(yr, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtMonth = (monthStr) => {
  if (!monthStr) return '';
  try { return new Date(`${monthStr}-01`).toLocaleString('default', { month: 'long', year: 'numeric' }); }
  catch { return monthStr; }
};

const GenerateMonthlyPayments = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);

  const today        = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [formData, setFormData] = useState({
    month:         currentMonth,
    agreementType: '',
  });

  const rentMonthPreview = getRentMonthFromInitiation(formData.month);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setResult(null);
  };

  const handleGenerate = async () => {
    if (!formData.month) { toast.error('Please select a month'); return; }

    const msg = formData.agreementType
      ? `Generate ${formData.agreementType} payments?\n\nInitiation month: ${fmtMonth(formData.month)}\nRent month: ${fmtMonth(rentMonthPreview)}`
      : `Generate payments for ALL active customers?\n\nInitiation month: ${fmtMonth(formData.month)}\nRent month: ${fmtMonth(rentMonthPreview)}`;

    if (!window.confirm(msg)) return;

    try {
      setLoading(true);
      setResult(null);
      const response = await paymentService.generateMonthlyPayments(formData);
      setResult(response.data);
      toast.success(response.message || `Generated ${response.data.paymentsGenerated} payment(s)`);
    } catch (error) {
      toast.error(error.error || 'Failed to generate payments');
    } finally {
      setLoading(false);
    }
  };

  // ── Totals computed once from result.payments ─────────────────────────────
  const payments    = result?.payments || [];
  const totalGross  = payments.reduce((s, p) => s + parseFloat(p.gross_amount    || 0), 0);
  const totalTds    = payments.reduce((s, p) => s + parseFloat(p.tds_amount      || 0), 0);
  const totalNet    = payments.reduce((s, p) => s + parseFloat(p.net_payout      || 0), 0);
  const totalCgst   = payments.reduce((s, p) => s + parseFloat(p.cgst_amount     || 0), 0);
  const totalSgst   = payments.reduce((s, p) => s + parseFloat(p.sgst_amount     || 0), 0);
  // eslint-disable-next-line
  const totalGst    = payments.reduce((s, p) => s + parseFloat(p.total_gst_amount|| 0), 0);
  // Net Transfer = Net Rent + GST (this is the ONE final amount)
  const totalTransfer = payments.reduce((s, p) => s + parseFloat(p.net_transfer  || p.net_payout || 0), 0);

  // Whether any payment in the result set has GST
  const hasAnyGst = payments.some((p) => p.has_gst);

  return (
    <div className="content-area generate-payments-container">
      <div className="generate-payments-header">
        <h4>
          <i className="bi bi-calendar-plus generate-icon me-2"></i>
          Generate Monthly Payments
        </h4>
        <p className="generate-subtitle">Create rent payments for all active customers</p>
      </div>

      {/* Form */}
      <div className="generate-card">
        <div className="generate-card-body">
          <div className="row g-4">
            <div className="col-md-4">
              <label className="form-label fw-semibold">
                <i className="bi bi-calendar3 me-2"></i>Initiation Month
              </label>
              <input
                type="month"
                className="form-control form-control-lg"
                name="month"
                value={formData.month}
                max={currentMonth}
                onChange={handleChange}
                disabled={loading}
              />
              <small className="text-muted">
                Selects rent for: <strong className="text-primary">{fmtMonth(rentMonthPreview)}</strong>
              </small>
            </div>

            <div className="col-md-4">
              <label className="form-label fw-semibold">
                <i className="bi bi-file-earmark-text me-2"></i>Agreement Type
              </label>
              <select
                className="form-select form-select-lg"
                name="agreementType"
                value={formData.agreementType}
                onChange={handleChange}
                disabled={loading}
              >
                <option value="">All Types</option>
                <option value="Construction">Construction</option>
                <option value="9-Year">9-Year Rental</option>
              </select>
              <small className="text-muted">Optional filter</small>
            </div>

            <div className="col-md-4 d-flex align-items-end">
              <button
                className="btn btn-primary btn-lg w-100 generate-btn"
                onClick={handleGenerate}
                disabled={loading || !formData.month}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
                ) : (
                  <><i className="bi bi-lightning-charge me-2"></i>Generate Payments</>
                )}
              </button>
            </div>
          </div>

          {/* Month mapping info */}
          {formData.month && (
            <div className="alert alert-info mt-3 mb-0 d-flex align-items-start gap-2">
              <i className="bi bi-info-circle-fill fs-5 mt-1"></i>
              <div>
                <strong>How month mapping works:</strong><br />
                Selecting <strong>{fmtMonth(formData.month)}</strong> as the initiation month will generate
                rent payments for <strong className="text-primary">{fmtMonth(rentMonthPreview)}</strong>.
                Payments are always generated for the <em>previous calendar month</em>.
                Customers whose payment started in <strong>{fmtMonth(formData.month)}</strong> will be
                included when you select <strong>{fmtMonth(
                  (() => {
                    const [yr, mo] = formData.month.split('-').map(Number);
                    const d = new Date(yr, mo, 1);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  })()
                )}</strong> as the initiation month.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="generate-results mt-4">
          {/* Rent month banner */}
          <div className="alert alert-success d-flex align-items-center gap-2 mb-3">
            <i className="bi bi-check-circle-fill fs-5"></i>
            <div>
              Payments generated for rent month:{' '}
              <strong>{result.rentMonthDisplay || fmtMonth(result.rentMonth)}</strong>
              {' '}— Initiated in: <strong>{result.initiationMonthDisplay || fmtMonth(result.initiationMonth)}</strong>
            </div>
          </div>

          {/* Summary cards — show Net Transfer (the single final amount) instead of Net Payout */}
          <div className="row g-3 mb-4">
            {[
              { label: 'Generated',         value: result.paymentsGenerated,       icon: 'check-circle',       cls: 'success' },
              { label: 'Skipped',            value: result.skippedCount,            icon: 'exclamation-circle', cls: 'warning' },
              { label: 'Duplicates',         value: result.duplicateCount,          icon: 'files',              cls: 'info'    },
              {
                label: hasAnyGst ? 'Total Net Transfer' : 'Total Net Payout',
                value: formatCurrency(totalTransfer),
                icon:  'currency-rupee',
                cls:   'primary',
              },
            ].map(({ label, value, icon, cls }) => (
              <div className="col-md-3" key={label}>
                <div className={`summary-card ${cls}`}>
                  <div className="summary-icon"><i className={`bi bi-${icon}`}></i></div>
                  <div className="summary-content">
                    <div className="summary-value">{value}</div>
                    <div className="summary-label">{label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Generated payments table */}
          {payments.length > 0 && (
            <div className="card mb-3">
              <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
                <h6 className="mb-0">
                  <i className="bi bi-check-circle me-2"></i>
                  Generated ({payments.length}) — Rent Month: {result.rentMonthDisplay || fmtMonth(result.rentMonth)}
                </h6>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Customer</th>
                        <th>Unit No</th>
                        <th>Floor</th>
                        <th>Period</th>
                        <th>Base Rent</th>
                        <th>Esc.</th>
                        <th>Gross</th>
                        <th>TDS</th>
                        <th>Net Rent</th>
                        {hasAnyGst && <th>CGST</th>}
                        {hasAnyGst && <th>SGST</th>}
                        {/* ONE final amount column — Net Rent + GST (or just Net Rent if no GST) */}
                        <th className="table-primary fw-bold">
                          {hasAnyGst ? 'Net Transfer' : 'Net Payout'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment, idx) => (
                        <tr key={payment.id || idx}>
                          <td className="text-muted">{idx + 1}</td>
                          <td>
                            <div className="fw-semibold">{payment.customer_name || '—'}</div>
                            {payment.customer_code && <small className="text-muted">{payment.customer_code}</small>}
                            {payment.has_gst && (
                              <div><small className="text-success"><i className="bi bi-patch-check-fill me-1"></i>GST: {payment.gst_no}</small></div>
                            )}
                          </td>
                          <td>{payment.unit_no || '—'}</td>
                          <td>{payment.floor_no ? `Floor ${payment.floor_no}` : '—'}</td>
                          <td>
                            <span className="badge bg-info text-dark">{payment.payment_period}</span>
                            {payment.installment_no && (
                              <div><small className="text-muted">Inst {payment.installment_no}/{payment.total_installments}</small></div>
                            )}
                          </td>
                          <td>{formatCurrency(payment.base_rent)}</td>
                          <td>
                            {payment.escalation_rate > 0
                              ? `${payment.escalation_rate}%`
                              : <span className="text-muted">—</span>}
                          </td>
                          <td>{formatCurrency(payment.gross_amount)}</td>
                          <td className="text-warning">{formatCurrency(payment.tds_amount)}</td>
                          <td>{formatCurrency(payment.net_payout)}</td>
                          {hasAnyGst && (
                            <td className="text-info">
                              {payment.has_gst ? formatCurrency(payment.cgst_amount) : <span className="text-muted">—</span>}
                            </td>
                          )}
                          {hasAnyGst && (
                            <td className="text-info">
                              {payment.has_gst ? formatCurrency(payment.sgst_amount) : <span className="text-muted">—</span>}
                            </td>
                          )}
                          {/* Final single amount */}
                          <td className="fw-bold text-success table-primary">
                            {formatCurrency(payment.net_transfer ?? payment.net_payout)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="table-secondary fw-bold">
                      <tr>
                        {/* Span all leading columns to push totals right */}
                        <td colSpan={hasAnyGst ? 7 : 7} className="text-end">Totals</td>
                        <td>{formatCurrency(totalGross)}</td>
                        <td className="text-warning">{formatCurrency(totalTds)}</td>
                        <td>{formatCurrency(totalNet)}</td>
                        {hasAnyGst && <td className="text-info">{formatCurrency(totalCgst)}</td>}
                        {hasAnyGst && <td className="text-info">{formatCurrency(totalSgst)}</td>}
                        {/* ONE total — this is the amount that will actually be transferred */}
                        <td className="text-success table-primary fs-6">{formatCurrency(totalTransfer)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Skipped */}
          {result.skipped?.length > 0 && (
            <div className="card mb-3">
              <div className="card-header bg-warning">
                <h6 className="mb-0"><i className="bi bi-exclamation-triangle me-2"></i>Skipped ({result.skipped.length})</h6>
              </div>
              <div className="card-body p-0">
                <table className="table table-sm mb-0">
                  <thead className="table-light"><tr><th>Customer</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.skipped.map((item, i) => (
                      <tr key={i}>
                        <td>{item.customerName || '—'}</td>
                        <td className="text-muted">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Duplicates */}
          {result.duplicates?.length > 0 && (
            <div className="card mb-3">
              <div className="card-header bg-secondary text-white">
                <h6 className="mb-0"><i className="bi bi-files me-2"></i>Duplicates Skipped ({result.duplicates.length})</h6>
              </div>
              <div className="card-body p-0">
                <table className="table table-sm mb-0">
                  <thead className="table-light"><tr><th>Customer</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.duplicates.map((item, i) => (
                      <tr key={i}>
                        <td>{item.customerName || '—'}</td>
                        <td className="text-muted">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="d-flex justify-content-end gap-2">
            <button className="btn btn-outline-secondary" onClick={() => setResult(null)}>
              <i className="bi bi-arrow-clockwise me-2"></i>Generate Again
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/payments/schedule?month=${formData.month}`)}>
              <i className="bi bi-calendar-check me-2"></i>View Payment Schedule
            </button>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="card mt-4">
        <div className="card-header bg-light">
          <h6 className="mb-0"><i className="bi bi-info-circle me-2"></i>How It Works</h6>
        </div>
        <div className="card-body small">
          <ul className="mb-0">
            <li className="mb-1"><strong>Month mapping:</strong> Selecting <em>February</em> generates rent payments for <em>January</em>. Always previous month.</li>
            <li className="mb-1"><strong>New customers:</strong> If a customer's payment started in February, they appear when you select <em>March</em> as the initiation month.</li>
            <li className="mb-1"><strong>Partial payments:</strong> Each active tranche is computed separately; TDS applies on the combined total.</li>
            <li className="mb-1"><strong>9-Year escalation:</strong> 0% (0–3 yrs), 15% (3–6 yrs), 32.25% (6+ yrs) — floor 7 only.</li>
            <li className="mb-1"><strong>TDS:</strong> 10% auto-deducted on amounts ≥ ₹50,000 unless marked exempt.</li>
            <li><strong>GST:</strong> CGST + SGST (18% total by default) applied on Net Rent for customers with a GST number. Net Transfer = Net Rent + GST.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default GenerateMonthlyPayments;