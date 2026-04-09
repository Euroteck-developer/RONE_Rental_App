// ─── PayoutSplitBreakdown.jsx ─────────────────────────────────────────────────
// Reusable component — drop into any payment detail view.
// Props:
//   splits        : array from customer.payout_splits
//   netPayout     : number  (after TDS, before GST)
//   compact       : bool    (one-liner badge strip vs. full card)
//   showAmounts   : bool    (compute & show per-account rupee amounts)

import React, { useState } from 'react';
import { formatCurrency } from '../../Utils/helpers';

// ─── Split math (mirrors backend splitPayoutForPayment) ───────────────────────
const round2 = (v) => parseFloat((parseFloat(v) || 0).toFixed(2));

const computeSplitAmounts = (netPayout, splits) => {
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (splits.length === 1) {
    return [{ ...splits[0], amount: round2(netPayout) }];
  }
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

// ─── Compact badge strip (for table cells) ────────────────────────────────────
const CompactSplitBadges = ({ entries }) => (
  <div className="d-flex flex-wrap gap-1 mt-1">
    {entries.map((sp, i) => (
      <span
        key={i}
        className="badge bg-light text-dark border"
        style={{ fontSize: '0.7rem', fontWeight: 500 }}
        title={`${sp.bankName || sp.ifscCode} — ${sp.bankAccountNumber}`}
      >
        <i className="bi bi-bank2 me-1 text-success" />
        {sp.accountHolderName || `A/c #${i + 1}`}
        &nbsp;·&nbsp;
        <span className="text-primary fw-bold">{sp.percentage}%</span>
        {sp.amount !== undefined && (
          <>&nbsp;·&nbsp;<span className="text-success fw-semibold">{formatCurrency(sp.amount)}</span></>
        )}
      </span>
    ))}
  </div>
);

// ─── Full card (for detail modal / expanded row) ──────────────────────────────
const FullSplitCard = ({ entries, totalNet }) => (
  <div className="mt-2">
    <div
      className="rounded-3 overflow-hidden border"
      style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#f8fafc 100%)' }}
    >
      {/* Header */}
      <div
        className="d-flex align-items-center justify-content-between px-3 py-2"
        style={{ background: '#16a34a', color: '#fff' }}
      >
        <span className="fw-semibold small">
          <i className="bi bi-diagram-3 me-2" />
          Payout Split — {entries.length} Account{entries.length > 1 ? 's' : ''}
        </span>
        <span className="small opacity-75">
          Total: <strong>{formatCurrency(totalNet)}</strong>
        </span>
      </div>

      {/* Account rows */}
      {entries.map((sp, i) => (
        <div
          key={i}
          className="d-flex align-items-start gap-3 px-3 py-2"
          style={{
            borderTop: i > 0 ? '1px solid #e2f0e8' : 'none',
          }}
        >
          {/* Index bubble */}
          <div
            className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
            style={{
              width: 32, height: 32,
              background: '#dcfce7',
              color: '#16a34a',
              fontWeight: 700,
              fontSize: '0.8rem',
              border: '2px solid #bbf7d0',
            }}
          >
            {i + 1}
          </div>

          {/* Account details */}
          <div className="flex-grow-1 min-w-0">
            <div className="fw-semibold text-dark" style={{ fontSize: '0.88rem' }}>
              {sp.accountHolderName || `Account #${i + 1}`}
            </div>
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
              <span className="me-2">
                <i className="bi bi-credit-card me-1" />
                {maskAccount(sp.bankAccountNumber)}
              </span>
              <span className="me-2">·</span>
              <span className="me-2">{sp.ifscCode}</span>
              {sp.bankName && (
                <>
                  <span className="me-2">·</span>
                  <span>{sp.bankName}</span>
                </>
              )}
            </div>
          </div>

          {/* Percentage + Amount */}
          <div className="text-end flex-shrink-0">
            <div className="fw-bold text-success" style={{ fontSize: '0.95rem' }}>
              {formatCurrency(sp.amount)}
            </div>
            <div
              className="badge"
              style={{
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}
            >
              {sp.percentage}%
            </div>
          </div>
        </div>
      ))}

      {/* Total footer (only if >1 account) */}
      {entries.length > 1 && (
        <div
          className="d-flex justify-content-between align-items-center px-3 py-2"
          style={{
            borderTop: '1px solid #bbf7d0',
            background: '#dcfce7',
          }}
        >
          <span className="small text-muted fw-semibold">
            <i className="bi bi-check2-all me-1 text-success" />
            Total disbursed across {entries.length} accounts
          </span>
          <span className="fw-bold text-success">
            {formatCurrency(entries.reduce((s, sp) => s + sp.amount, 0))}
          </span>
        </div>
      )}
    </div>
  </div>
);

// ─── Main exported component ──────────────────────────────────────────────────
export const PayoutSplitBreakdown = ({
  splits,
  netPayout = 0,
  compact = false,
  showAmounts = true,
}) => {
  const raw = Array.isArray(splits) ? splits : null;
  if (!raw || raw.length === 0) return null;

  const entries = showAmounts
    ? computeSplitAmounts(netPayout, raw)
    : raw.map((sp) => ({ ...sp, amount: undefined }));

  if (compact) return <CompactSplitBadges entries={entries} />;
  return <FullSplitCard entries={entries} totalNet={round2(netPayout)} />;
};

export default PayoutSplitBreakdown;