import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import paymentService from '../../Services/payment.service';
import { formatCurrency } from '../../Utils/helpers';
import '../../Styles/InitiatePayment.css';

// ─── Token helpers ─────────────────────────────────────────────────────────────
const getTokenPayload = () => {
  try {
    const token =
      localStorage.getItem('accessToken') || localStorage.getItem('token') ||
      sessionStorage.getItem('accessToken') || sessionStorage.getItem('token');
    if (!token) return null;
    const b64 = token.split('.')[1];
    if (!b64) return null;
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
};

const getSecondsLeft = () => {
  const p = getTokenPayload();
  if (!p?.exp) return null;
  return p.exp - Math.floor(Date.now() / 1000);
};

const MIN_SESSION_SECONDS = 5 * 60;

// ─── Load Easebuzz checkout SDK ────────────────────────────────────────────────
const loadEasebuzz = () =>
  new Promise((resolve) => {
    if (window.EasebuzzCheckout) { resolve(true); return; }
    const s = document.createElement('script');
    s.src     = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/easebuzz-checkout.js';
    s.onload  = () => resolve(!!window.EasebuzzCheckout);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

// ─── GST helper ───────────────────────────────────────────────────────────────
const computeRowGst = (netPayout, row) => {
  const gstNo  = row.gst_no || null;
  const hasGst = !!gstNo;
  if (!hasGst) return { hasGst: false, cgstAmount: 0, sgstAmount: 0, totalGst: 0, netTransfer: netPayout };
  const cgstRate = parseFloat(row.cgst || 9);
  const sgstRate = parseFloat(row.sgst || 9);
  const cgstAmt  = parseFloat((netPayout * cgstRate / 100).toFixed(2));
  const sgstAmt  = parseFloat((netPayout * sgstRate / 100).toFixed(2));
  const totalGst = parseFloat((cgstAmt + sgstAmt).toFixed(2));
  return { hasGst: true, gstNo, cgstRate, sgstRate, cgstAmount: cgstAmt, sgstAmount: sgstAmt, totalGst, netTransfer: parseFloat((netPayout + totalGst).toFixed(2)) };
};

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

// ─── Split detail modal ───────────────────────────────────────────────────────
const SplitModal = ({ group, onClose }) => {
  if (!group) return null;
  const entries  = group.splitEntries || [];
  const net      = group.net || 0;
  const hasGst   = group.hasGst;
  const transfer = group.netTransfer || net;

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
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
                Payout Split — {group.customer_name}
              </h5>
              <div className="small opacity-75 mt-1">
                {group.payment_month
                  ? new Date(`${group.payment_month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })
                  : '—'}
                &nbsp;·&nbsp;{group.customer_code}
                &nbsp;·&nbsp;Unit {group.unit_no || '—'}, Floor {group.floor_no || '—'}
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
                { label: 'Gross',        value: formatCurrency(group.gross),    color: '#1e293b' },
                { label: 'TDS',          value: formatCurrency(group.tds),      color: '#f59e0b' },
                { label: 'Net Rent',     value: formatCurrency(net),            color: '#0ea5e9' },
                hasGst && { label: `CGST (${group.cgstRate || 9}%)`, value: formatCurrency(group.cgstAmount), color: '#8b5cf6' },
                hasGst && { label: `SGST (${group.sgstRate || 9}%)`, value: formatCurrency(group.sgstAmount), color: '#8b5cf6' },
                { label: hasGst ? 'Net Transfer' : 'Net Payout', value: formatCurrency(transfer), color: '#16a34a', bold: true },
              ].filter(Boolean).map(({ label, value, color, bold }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: bold ? '1.05rem' : '0.9rem', fontWeight: bold ? 700 : 600, color }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Accounts */}
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
                        <div
                          className="mt-1 fw-semibold"
                          style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#0f172a' }}
                        >
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

// ─── Session Banner ────────────────────────────────────────────────────────────
const SessionBanner = ({ secondsLeft, onLogout }) => {
  if (secondsLeft === null || secondsLeft > MIN_SESSION_SECONDS) return null;
  const expired = secondsLeft <= 0;
  const mins = Math.floor(Math.max(0, secondsLeft) / 60);
  const secs = Math.max(0, secondsLeft) % 60;
  return (
    <div className={`alert ${expired ? 'alert-danger' : 'alert-warning'} d-flex align-items-start gap-2 mb-3`}>
      <i className={`bi ${expired ? 'bi-lock-fill' : 'bi-exclamation-triangle-fill'} fs-4 mt-1`} />
      <div className="flex-grow-1">
        {expired
          ? <><strong>Session Expired.</strong> Please logout and login again.</>
          : <><strong>Session expiring in {mins}m {secs}s.</strong> You need &gt;5 min remaining to initiate payments. Please re-login.</>}
      </div>
      <button className="btn btn-sm btn-outline-danger" onClick={onLogout}>Logout Now</button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  InitiatePayment  — main component
// ═══════════════════════════════════════════════════════════════════════════════
const InitiatePayment = () => {
  const navigate = useNavigate();

  const [payments,      setPayments]      = useState([]);
  const [selectedKeys,  setSelectedKeys]  = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [processing,    setProcessing]    = useState(false);
  const [secondsLeft,   setSecondsLeft]   = useState(getSecondsLeft());
  const [ebReady,       setEbReady]       = useState(false);
  const [activeOrderIds, setActiveOrderIds] = useState([]);
  const [expandedKeys,  setExpandedKeys]  = useState(new Set());
  const [splitModal,    setSplitModal]    = useState(null);   // group object

  useEffect(() => {
    const iv = setInterval(() => setSecondsLeft(getSecondsLeft()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { loadEasebuzz().then(setEbReady); }, []);
  useEffect(() => { fetchPending(); }, []);

  const fetchPending = async () => {
    try {
      setLoading(true);
      const res = await paymentService.getPaymentSchedule({ status: 'Pending' });
      setPayments(res.data || []);
      setSelectedKeys([]);
      setExpandedKeys(new Set());
    } catch {
      toast.error('Failed to load pending payments');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => { localStorage.clear(); sessionStorage.clear(); navigate('/login'); };
  const sessionOk    = secondsLeft !== null && secondsLeft > MIN_SESSION_SECONDS;

  // ── Expand / collapse a group row ──────────────────────────────────────────
  const toggleExpand = (key, e) => {
    e.stopPropagation();
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Build grouped rows ─────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const key = `${p.customer_id}_${p.payment_month}`;
      if (!map.has(key)) {
        // Parse splits from the first payment in this group (all payments for
        // the same customer share the same split config)
        const splits = parseSplits(p.payout_splits ?? p.customer_payout_splits);
        map.set(key, {
          key,
          customer_id:    p.customer_id,
          customer_name:  p.customer_name,
          customer_code:  p.customer_code,
          unit_no:        p.unit_no,
          floor_no:       p.floor_no,
          payment_month:  p.payment_month,
          payment_period: p.payment_period,
          agreement_type: p.agreement_type,
          gst_no:  p.gst_no  || null,
          cgst:    p.cgst    || 9,
          sgst:    p.sgst    || 9,
          splits,                         // raw split array
          ids:          [],
          installments: [],
          gross: 0,
          tds:   0,
          net:   0,
        });
      }
      const g = map.get(key);
      g.ids.push(p.id);
      g.installments.push({ no: p.installment_no, total: p.total_installments });
      g.gross += parseFloat(p.gross_amount || 0);
      g.tds   += parseFloat(p.tds_amount   || 0);
      g.net   += parseFloat(p.net_payout   || 0);
    }

    return Array.from(map.values()).map((g) => {
      g.gross = round2(g.gross);
      g.tds   = round2(g.tds);
      g.net   = round2(g.net);

      const gst = computeRowGst(g.net, g);

      // Compute per-account split amounts against net payout
      const splitEntries = g.splits
        ? computeSplitAmounts(g.net, g.splits)
        : null;

      return { ...g, ...gst, splitEntries };
    });
  }, [payments]);

  const hasAnyGst     = groups.some((g) => g.hasGst);
  const hasAnySplit   = groups.some((g) => g.splitEntries && g.splitEntries.length > 1);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleAll   = (checked) => setSelectedKeys(checked ? groups.map((g) => g.key) : []);
  const toggleGroup = (key, checked) =>
    setSelectedKeys((prev) => checked ? [...prev, key] : prev.filter((k) => k !== key));

  const selectedGroups = groups.filter((g) => selectedKeys.includes(g.key));
  const selectedIds    = selectedGroups.flatMap((g) => g.ids);
  const selGross       = selectedGroups.reduce((s, g) => s + g.gross,       0);
  const selTds         = selectedGroups.reduce((s, g) => s + g.tds,         0);
  const selNet         = selectedGroups.reduce((s, g) => s + g.net,         0);
  const selNetTransfer = selectedGroups.reduce((s, g) => s + g.netTransfer, 0);
  const selCgst        = selectedGroups.reduce((s, g) => s + g.cgstAmount,  0);
  const selSgst        = selectedGroups.reduce((s, g) => s + g.sgstAmount,  0);

  // ── Reset Order_Created → Pending ─────────────────────────────────────────
  const resetOrderCreatedPayments = useCallback(async (ids) => {
    if (!ids?.length) return;
    try { await paymentService.resetOrderCreated(ids); }
    catch (e) { console.warn('Could not reset Order_Created payments:', e); }
  }, []);

  // ── Pay via Easebuzz ───────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (!selectedKeys.length) { toast.error('Select at least one payment'); return; }

    const left = getSecondsLeft();
    if (left === null || left <= MIN_SESSION_SECONDS) {
      toast.error(left !== null && left <= 0 ? 'Session expired — please re-login.' : 'Session < 5 min — please re-login first.');
      return;
    }
    if (!ebReady) { toast.error('Easebuzz checkout could not load — check your connection.'); return; }

    const dispAmt = formatCurrency(selNetTransfer);
    if (!window.confirm(`Pay ${dispAmt} for ${selectedKeys.length} customer(s) — ${selectedIds.length} payment(s) via Easebuzz?`)) return;

    const snapshotIds = [...selectedIds];
    let txnid = null;

    try {
      setProcessing(true);

      const { data: order } = await paymentService.createEasebuzzOrder(snapshotIds);
      txnid = order.txnid;
      setActiveOrderIds(snapshotIds);

      const easebuzzCheckout = new window.EasebuzzCheckout(order.key, order.env);

      easebuzzCheckout.initiatePayment({
        access_key: order.accessKey,
        onResponse: async (response) => {
          const { status } = response;

          if (status === 'success') {
            try {
              setProcessing(true);
              const verify = await paymentService.verifyEasebuzzPayment({
                paymentIds: snapshotIds,
                easebuzzResponse: response,
              });
              toast.success(verify.message || 'Payments completed successfully!');
              setActiveOrderIds([]);
              await fetchPending();
              setTimeout(() => navigate('/payments/schedule'), 1500);
            } catch (err) {
              const errData = err?.response?.data || err || {};
              toast.error(errData.error || `Verification failed. EasyPay ID: ${response.easepayid || 'N/A'}`);
              await resetOrderCreatedPayments(snapshotIds);
              await fetchPending();
            } finally {
              setProcessing(false);
            }

          } else if (status === 'userCancelled') {
            toast.warn('Payment cancelled — payments are back in the list.');
            await paymentService.reportEasebuzzFailure(snapshotIds, txnid, response);
            await resetOrderCreatedPayments(snapshotIds);
            setActiveOrderIds([]);
            setProcessing(false);
            await fetchPending();

          } else {
            toast.error(`Payment failed: ${response.error_Message || response.status || 'Unknown error'}`);
            await paymentService.reportEasebuzzFailure(snapshotIds, txnid, response);
            await resetOrderCreatedPayments(snapshotIds);
            setActiveOrderIds([]);
            setProcessing(false);
            await fetchPending();
          }
        },
      });

    } catch (err) {
      const errData = err?.response?.data || err || {};
      toast.error(errData.error || 'Failed to create payment order. Try again.');
      await resetOrderCreatedPayments(snapshotIds);
      setActiveOrderIds([]);
      setProcessing(false);
      await fetchPending();
    }
  }, [selectedKeys, selectedIds, ebReady, selNetTransfer, navigate, resetOrderCreatedPayments]);

  const timerLabel = () => {
    if (secondsLeft === null) return null;
    if (secondsLeft <= 0) return 'Expired';
    return `${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="content-area initiate-payment-container">
      <div className="initiate-payment-header">
        <h4>
          <i className="bi bi-send initiate-payment-icon me-2" />
          Initiate Payments
        </h4>
        <p className="initiate-payment-subtitle">Select pending payments to process via Easebuzz</p>
      </div>

      <SessionBanner secondsLeft={secondsLeft} onLogout={handleLogout} />

      {!ebReady && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-3">
          <i className="bi bi-wifi-off fs-5" />
          <span>Easebuzz checkout could not load — please check your internet connection.</span>
        </div>
      )}

      <div className="initiate-payment-card">
        <div className="initiate-payment-card-body">

          {loading ? (
            <div className="initiate-loading-container">
              <div className="spinner-border initiate-loading-spinner" />
              <p className="initiate-loading-text">Loading pending payments...</p>
            </div>

          ) : groups.length === 0 ? (
            <div className="initiate-empty-state">
              <i className="bi bi-inbox initiate-empty-icon" />
              <p className="initiate-empty-text">No pending payments</p>
              <p className="text-muted small">All payments completed, or none generated yet.</p>
              <div className="d-flex gap-2 justify-content-center mt-2">
                <button className="btn initiate-btn-view" onClick={() => navigate('/payments/generate')}>
                  <i className="bi bi-lightning-charge me-2" />Generate Payments
                </button>
                <button className="btn btn-outline-secondary" onClick={() => navigate('/payments/schedule')}>
                  <i className="bi bi-calendar-check me-2" />View Schedule
                </button>
              </div>
            </div>

          ) : (
            <>
              {/* ── Selection summary bar ──────────────────────────────────── */}
              {selectedKeys.length > 0 && (
                <div className="alert alert-primary d-flex justify-content-between align-items-center mb-3 py-2 flex-wrap gap-2">
                  <span className="small">
                    <strong>{selectedKeys.length}</strong>/{groups.length} selected
                    &nbsp;|&nbsp; Gross: <strong>{formatCurrency(selGross)}</strong>
                    &nbsp;|&nbsp; TDS: <strong className="text-warning">{formatCurrency(selTds)}</strong>
                    &nbsp;|&nbsp; Net: <strong>{formatCurrency(selNet)}</strong>
                    {hasAnyGst && (
                      <>
                        &nbsp;|&nbsp; CGST: <strong className="text-info">{formatCurrency(selCgst)}</strong>
                        &nbsp;|&nbsp; SGST: <strong className="text-info">{formatCurrency(selSgst)}</strong>
                        &nbsp;|&nbsp;<span className="text-success fw-bold">Transfer: {formatCurrency(selNetTransfer)}</span>
                      </>
                    )}
                  </span>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => setSelectedKeys([])}>Clear</button>
                </div>
              )}

              {/* ── Hint when any multi-split customers present ─────────────── */}
              {hasAnySplit && (
                <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3">
                  <i className="bi bi-diagram-3 fs-5 flex-shrink-0" />
                  <small>
                    Some customers have <strong>multi-account payout splits</strong>.
                    Click <i className="bi bi-chevron-right" /> to expand or <strong>Splits</strong> to view full details.
                  </small>
                </div>
              )}

              <div className="initiate-table-responsive">
                <table className="initiate-payment-table table">
                  <thead>
                    <tr>
                      {/* Expand toggle col */}
                      <th style={{ width: 32 }}></th>
                      <th>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selectedKeys.length === groups.length && groups.length > 0}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedKeys.length > 0 && selectedKeys.length < groups.length;
                          }}
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                      </th>
                      <th>Customer</th>
                      <th>Unit / Floor</th>
                      <th>Rent Month</th>
                      <th>Period / Inst</th>
                      <th>Gross</th>
                      <th>TDS</th>
                      <th>Net Rent</th>
                      {hasAnyGst && <th className="text-info">CGST</th>}
                      {hasAnyGst && <th className="text-info">SGST</th>}
                      <th className={hasAnyGst ? 'table-success' : ''}>
                        {hasAnyGst ? 'Net Transfer' : 'Net Payout'}
                      </th>
                      {/* Payout accounts column — always shown */}
                      <th>Payout Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const isSelected  = selectedKeys.includes(g.key);
                      const isExpanded  = expandedKeys.has(g.key);
                      const hasMulti    = g.splitEntries && g.splitEntries.length > 1;

                      const maxInst   = g.installments.reduce((m, i) => Math.max(m, i.total || 1), 1);
                      const instNos   = g.installments.map((i) => i.no).filter(Boolean).sort((a, b) => a - b);
                      const instLabel = instNos.length > 0
                        ? instNos.length === 1
                          ? `Inst ${instNos[0]}/${maxInst}`
                          : `Inst ${instNos[0]}–${instNos[instNos.length - 1]}/${maxInst}`
                        : null;

                      return (
                        <React.Fragment key={g.key}>
                          {/* ── Main row ── */}
                          <tr
                            className={isSelected ? 'initiate-selected' : ''}
                            onClick={() => toggleGroup(g.key, !isSelected)}
                            style={{ cursor: 'pointer' }}
                          >
                            {/* Expand chevron */}
                            <td onClick={(e) => toggleExpand(g.key, e)} style={{ cursor: 'pointer', textAlign: 'center' }}>
                              {g.splitEntries && g.splitEntries.length > 0 && (
                                <i
                                  className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`}
                                  style={{ color: isExpanded ? '#16a34a' : '#94a3b8', fontSize: '0.9rem' }}
                                />
                              )}
                            </td>

                            {/* Checkbox */}
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={isSelected}
                                onChange={(e) => toggleGroup(g.key, e.target.checked)}
                              />
                            </td>

                            {/* Customer */}
                            <td>
                              <div className="initiate-customer-name">{g.customer_name}</div>
                              <small className="text-muted">{g.customer_code}</small>
                              {g.hasGst && (
                                <div>
                                  <small className="text-success">
                                    <i className="bi bi-patch-check-fill me-1" />GST: {g.gstNo}
                                  </small>
                                </div>
                              )}
                            </td>

                            {/* Unit / Floor */}
                            <td>
                              <div>{g.unit_no || '—'}</div>
                              <small className="text-muted">{g.floor_no ? `Floor ${g.floor_no}` : '—'}</small>
                            </td>

                            {/* Month */}
                            <td>
                              <span className="badge bg-info text-dark">
                                {g.payment_month
                                  ? new Date(`${g.payment_month}-01`).toLocaleString('default', { month: 'short', year: 'numeric' })
                                  : '—'}
                              </span>
                            </td>

                            {/* Period / installment */}
                            <td>
                              <span className="initiate-period-badge">{g.payment_period}</span>
                              {instLabel && <div><small className="text-muted">{instLabel}</small></div>}
                              {g.ids.length > 1 && (
                                <div>
                                  <small className="text-primary">
                                    <i className="bi bi-layers me-1" />{g.ids.length} combined
                                  </small>
                                </div>
                              )}
                            </td>

                            {/* Amounts */}
                            <td className="initiate-amount-gross">{formatCurrency(g.gross)}</td>
                            <td className="initiate-amount-tds">{formatCurrency(g.tds)}</td>
                            <td>{formatCurrency(g.net)}</td>

                            {hasAnyGst && (
                              <td className="text-info">
                                {g.hasGst ? formatCurrency(g.cgstAmount) : <span className="text-muted">—</span>}
                              </td>
                            )}
                            {hasAnyGst && (
                              <td className="text-info">
                                {g.hasGst ? formatCurrency(g.sgstAmount) : <span className="text-muted">—</span>}
                              </td>
                            )}

                            <td className={`fw-bold ${hasAnyGst ? 'text-success' : 'initiate-amount-net'}`}>
                              {formatCurrency(g.netTransfer)}
                            </td>

                            {/* Payout accounts inline summary */}
                            <td
                              style={{ minWidth: 200 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {g.splitEntries && g.splitEntries.length > 0 ? (
                                <div>
                                  {g.splitEntries.map((sp, i) => (
                                    <div
                                      key={i}
                                      className="d-flex align-items-center gap-1 mb-1"
                                      style={{ fontSize: '0.76rem' }}
                                    >
                                      {/* Account index bubble */}
                                      <span
                                        className="d-inline-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0"
                                        style={{
                                          width: 17, height: 17,
                                          background: '#dcfce7',
                                          color: '#16a34a',
                                          fontSize: '0.62rem',
                                          border: '1px solid #bbf7d0',
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

                                      {/* Percentage badge */}
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

                                  {/* Detail button (only for multi-split) */}
                                  {hasMulti && (
                                    <button
                                      className="btn btn-sm btn-outline-success mt-1"
                                      style={{ fontSize: '0.68rem', padding: '1px 7px' }}
                                      onClick={(e) => { e.stopPropagation(); setSplitModal(g); }}
                                    >
                                      <i className="bi bi-diagram-3 me-1" />Full Detail
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted small">Single account</span>
                              )}
                            </td>
                          </tr>

                          {/* ── Expanded split detail sub-row ── */}
                          {isExpanded && g.splitEntries && g.splitEntries.length > 0 && (
                            <tr style={{ background: '#f0fdf4' }}>
                              <td colSpan={hasAnyGst ? 14 : 12} className="py-0">
                                <div className="px-4 pb-3 pt-2">
                                  <div
                                    className="fw-semibold mb-2"
                                    style={{ color: '#16a34a', fontSize: '0.82rem' }}
                                  >
                                    <i className="bi bi-diagram-3 me-1" />
                                    Payout Split for {g.customer_name} — {
                                      g.payment_month
                                        ? new Date(`${g.payment_month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })
                                        : '—'
                                    }
                                  </div>

                                  <div className="row g-2">
                                    {g.splitEntries.map((sp, i) => (
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

                                  {/* Sub-row total + full detail link */}
                                  {g.splitEntries.length > 1 && (
                                    <div
                                      className="d-flex justify-content-end align-items-center gap-3 mt-2"
                                      style={{ fontSize: '0.8rem' }}
                                    >
                                      <span className="text-muted">
                                        Total across {g.splitEntries.length} accounts:
                                      </span>
                                      <span className="fw-bold text-success">
                                        {formatCurrency(g.splitEntries.reduce((s, sp) => s + sp.amount, 0))}
                                      </span>
                                      <button
                                        className="btn btn-sm btn-outline-success"
                                        style={{ fontSize: '0.7rem', padding: '2px 10px' }}
                                        onClick={(e) => { e.stopPropagation(); setSplitModal(g); }}
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
                </table>
              </div>

              {/* ── Footer ──────────────────────────────────────────────────── */}
              <div className="initiate-footer">
                <div className="initiate-summary">
                  <div className="initiate-summary-item">
                    <span className="initiate-summary-label">Selected:</span>
                    <span className="initiate-summary-value">{selectedKeys.length} / {groups.length}</span>
                  </div>
                  <div className="initiate-summary-item">
                    <span className="initiate-summary-label">
                      {hasAnyGst && selectedKeys.length > 0 ? 'Net Transfer:' : 'Net Total:'}
                    </span>
                    <span className="initiate-total-value">{formatCurrency(selNetTransfer)}</span>
                  </div>
                </div>
                <div className="initiate-actions">
                  <button
                    className="btn initiate-btn-cancel"
                    onClick={() => navigate('/payments/schedule')}
                    disabled={processing}
                  >
                    <i className="bi bi-x-circle me-2" />Cancel
                  </button>
                  {/* <button
                    className="btn initiate-btn-primary"
                    onClick={handlePay}
                    disabled={!selectedKeys.length || processing || !sessionOk || !ebReady}
                    title={
                      !sessionOk            ? 'Session expiring — re-login first'
                      : !ebReady            ? 'Easebuzz not loaded — check connection'
                      : !selectedKeys.length ? 'Select at least one payment'
                      : ''
                    }
                  >
                    {processing ? (
                      <><span className="spinner-border initiate-processing-spinner me-2" />Processing...</>
                    ) : (
                      <>
                        <i className="bi bi-credit-card me-2" />
                        Pay{selectedKeys.length > 0
                          ? ` ${selectedKeys.length} · ${formatCurrency(selNetTransfer)}`
                          : ' via Easebuzz'}
                      </>
                    )}
                  </button> */}
                </div>
              </div>

              {/* Session timer */}
              {secondsLeft !== null && (
                <div className={`mt-2 text-end small ${!sessionOk ? 'text-danger fw-bold' : 'text-muted'}`}>
                  <i className="bi bi-clock me-1" />Session: {timerLabel()}
                  {!sessionOk && (
                    <button className="btn btn-link btn-sm text-danger p-0 ms-2" onClick={handleLogout}>
                      Logout now
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Split detail modal */}
      {splitModal && (
        <SplitModal
          group={splitModal}
          onClose={() => setSplitModal(null)}
        />
      )}
    </div>
  );
};

export default InitiatePayment;