'use strict';

const { query, transaction } = require('../config/database');

// ─── Math helpers ─────────────────────────────────────────────────────────────
const toFloat      = (v, fb = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
const round2       = (v) => parseFloat(toFloat(v).toFixed(2));
const calculateTDS = (amount) => amount >= 50000 ? Math.round(amount * 0.10) : 0;
const calculateGSTSplit = (netAmount, cgstRate = 9, sgstRate = 9) => {
  const cgst = round2(netAmount * cgstRate / 100);
  const sgst = round2(netAmount * sgstRate / 100);
  return { cgst, sgst, total: round2(cgst + sgst) };
};

// ─── Month helpers ────────────────────────────────────────────────────────────
/**
 * Given the payment initiation date (the month admin clicks "generate"),
 * return the PREVIOUS month as the rent month string (YYYY-MM).
 * e.g. initiation 2024-02-05 → rentMonth "2024-01"
 */
const getRentMonth = (initiationDate) => {
  const d = new Date(initiationDate.getFullYear(), initiationDate.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const toMonthKey = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const toMonthLabel = (monthKey) => {
  if (!monthKey) return '';
  try {
    return new Date(`${monthKey}-01`).toLocaleString('default', { month: 'long', year: 'numeric' });
  } catch { return monthKey; }
};

// ─── Effective start date ─────────────────────────────────────────────────────
/**
 * For partial-financial customers, the effective start date is the EARLIEST
 * paymentClosureDate across all tranches (rent starts from that month).
 * For full-payment customers it is simply payment_closure_date.
 */
const getEffectiveStartDate = (cust) => {
  if ((cust.payment_mode || 'full') === 'partial') {
    const parsed = parseFinancialPartials(cust.partial_payments);
    if (parsed?.type === 'financial' && parsed.entries.length > 0) {
      const dates = parsed.entries
        .map((e) => e.paymentClosureDate ?? e.payment_closure_date)
        .filter(Boolean)
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a - b);
      if (dates.length > 0) {
        const d = dates[0];
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
  }
  return cust.payment_closure_date || null;
};

// ─── Rent calculation helpers ─────────────────────────────────────────────────
/**
 * Calculate the rent for a given rentMonth given:
 *  - monthlyRent  : sqft × rentPerSFT  (the full-month amount)
 *  - closureDate  : payment_closure_date (Date object or null)
 *  - rentMonth    : 'YYYY-MM'
 *
 * If rentMonth === the closure month → prorate (daysRemaining / totalDays).
 * Any other month → full monthly rent.
 */
const calcRentForMonth = (monthlyRent, closureDate, rentMonth) => {
  if (!monthlyRent) return { rent: 0, rentType: 'unknown' };

  if (!closureDate) {
    return {
      rent:             round2(monthlyRent),
      rentType:         'full_month',
      closureMonthKey:  null,
      daysInClosureMonth: null,
      daysFromClosure:  null,
      closureDay:       null,
      monthlyRent:      round2(monthlyRent),
      proratedRent:     round2(monthlyRent),
    };
  }

  const yr     = closureDate.getFullYear();
  const moIdx  = closureDate.getMonth();
  const day    = closureDate.getDate();
  const days   = new Date(yr, moIdx + 1, 0).getDate();        // total days in closure month
  const key    = `${yr}-${String(moIdx + 1).padStart(2, '0')}`;
  const remainingDays = days - day + 1;                        // closure day → end of month
  const pror   = round2(monthlyRent * (remainingDays / days));

  if (rentMonth === key) {
    // We're generating rent FOR the closure month → prorated
    return {
      rent:               pror,
      rentType:           'prorated_closure_month',
      closureMonthKey:    key,
      daysInClosureMonth: days,
      daysFromClosure:    remainingDays,
      closureDay:         day,
      monthlyRent:        round2(monthlyRent),
      proratedRent:       pror,
    };
  }

  // Any subsequent month → full rent
  return {
    rent:               round2(monthlyRent),
    rentType:           'full_month',
    closureMonthKey:    key,
    daysInClosureMonth: days,
    daysFromClosure:    remainingDays,
    closureDay:         day,
    monthlyRent:        round2(monthlyRent),
    proratedRent:       pror,
  };
};

/**
 * Rent for ONE partial tranche for a given rentMonth.
 *
 * Formula:
 *   rent = (amountReceived / totalSale) × (sqft × rentPerSFT) × (daysCharged / totalDaysInClosureMonth)
 *
 * daysCharged:
 *   - If we're generating rent for the SAME month as the closure → (totalDays − closureDay + 1)
 *   - Any later month → totalDays (full month proportion)
 */
const calcPartialBaseRent = (amountReceived, entryClosure, totalSale, sqft, rentPerSFT, rentMonth) => {
  const q = toFloat(sqft), r = toFloat(rentPerSFT);
  if (!q || !r) return 0;

  const a = toFloat(amountReceived), s = toFloat(totalSale);
  if (!a || !s) return 0;

  // Full monthly proportional rent for this tranche (no proration)
  const fullMonthRent = round2((a / s) * (q * r));

  if (!entryClosure) return fullMonthRent;

  const closureDate = new Date(entryClosure);
  if (isNaN(closureDate.getTime())) return fullMonthRent;

  const totalDays       = new Date(closureDate.getFullYear(), closureDate.getMonth() + 1, 0).getDate();
  const closureMonthKey = `${closureDate.getFullYear()}-${String(closureDate.getMonth() + 1).padStart(2, '0')}`;
  const isClosureMonth  = rentMonth != null && rentMonth !== '' && rentMonth === closureMonthKey;

  // Only prorate in the closure month itself; full proportion in subsequent months
  const daysCharged = isClosureMonth ? (totalDays - closureDate.getDate() + 1) : totalDays;
  return round2((a / s) * (q * r) * (daysCharged / totalDays));
};

const calcPartialInstallments = (raw) => {
  const parsed = parseFinancialPartials(raw);
  if (!parsed || parsed.type !== 'installment') return null;
  const list = parsed.entries;
  const tot  = list.reduce((s, i) => s + Number(i.percentage || 0), 0);
  if (Math.abs(tot - 100) > 0.01)
    throw new Error(`Instalment percentages must sum to 100 (got ${tot})`);
  return list.map((i, idx) => ({
    installment_no: i.installment_no || idx + 1,
    percentage:     Number(i.percentage),
    due_day:        Number(i.due_day || 1),
    description:    i.description || `Instalment ${i.installment_no || idx + 1}`,
  }));
};

const buildInstallmentBreakdown = (installments, grossAmount, tdsExempt) => {
  let rem = round2(grossAmount);
  return installments.map((inst, idx) => {
    const isLast = idx === installments.length - 1;
    const gross  = isLast ? round2(rem) : round2(grossAmount * inst.percentage / 100);
    rem = round2(rem - gross);
    const tds = tdsExempt ? 0 : calculateTDS(gross);
    return {
      installment_no: inst.installment_no,
      percentage:     inst.percentage,
      due_day:        inst.due_day,
      description:    inst.description,
      gross_amount:   gross,
      tds_amount:     tds,
      net_payout:     round2(gross - tds),
    };
  });
};

const buildScheduledDate = (monthStr, dueDay) => {
  const [yr, mo] = monthStr.split('-').map(Number);
  const max = new Date(yr, mo, 0).getDate();
  return `${monthStr}-${String(Math.min(Number(dueDay) || 1, max)).padStart(2, '0')}`;
};

// ─── Partial payments parsing ─────────────────────────────────────────────────
const parseFinancialPartials = (raw) => {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const list   = Array.isArray(parsed) ? parsed : [];
    if (!list.length) return null;
    if (list.some((e) => e.bankAmount !== undefined || e.amountReceived !== undefined))
      return { type: 'financial', entries: list };
    if (list.some((i) => i.percentage !== undefined && Number(i.percentage) > 0))
      return { type: 'installment', entries: list };
    return null;
  } catch { return null; }
};

const getEntryClosureDate = (e) => e.paymentClosureDate ?? e.payment_closure_date ?? null;

/**
 * Filter partial tranches that are ACTIVE for the given rentMonth.
 * A tranche is active if its closure date month <= rentMonth
 * (i.e. the tranche has already been received by this rent month).
 */
const filterActiveEntries = (allEntries, rentMonth) =>
  allEntries.filter((e) => {
    const cd = getEntryClosureDate(e);
    if (!cd) return true;          // no closure date → always active
    const mk = toMonthKey(cd);
    return mk !== null && mk <= rentMonth;
  });

// ─── Core gross computation ───────────────────────────────────────────────────
/**
 * Compute the gross rent for a customer's unit for rentMonth.
 *
 * monthlyRent = sqft × rental_value_per_sft  (always recalculated from unit data)
 * Falls back to financial_rent only when no sqft/rentPerSft is available.
 *
 * For 9-Year agreements on floor 7, applies escalation tiers:
 *   0–2 years → 0%,  3–5 years → 15%,  6+ years → 32.25%
 */
const computeGrossForCustomer = (customer, closureDate, rentMonth) => {
  const rentPerSft  = toFloat(customer.rental_value_per_sft);
  const sqft        = toFloat(customer.sqft);

  // Always compute from sqft × rentPerSft; fall back to stored financial_rent
  const monthlyRent = sqft && rentPerSft ? round2(sqft * rentPerSft) : 0;

  let grossAmount = 0, escalationRate = 0, yearsElapsed = 0, rentDetails = {};

  const safeClosureDate = closureDate && !isNaN(new Date(closureDate).getTime())
    ? (closureDate instanceof Date ? closureDate : new Date(closureDate))
    : null;

  if (customer.agreement_type === 'Construction') {
    if (monthlyRent > 0) {
      const c    = calcRentForMonth(monthlyRent, safeClosureDate, rentMonth);
      grossAmount  = c.rent;
      rentDetails  = c;
    } else {
      // Fallback: use pre-stored financial_rent (no sqft data available)
      grossAmount  = toFloat(customer.financial_rent);
      rentDetails  = { rent: grossAmount, rentType: 'financial_record', monthlyRent: grossAmount };
    }

  } else if (customer.agreement_type === '9-Year') {
    if (customer.actual_occupancy_date) {
      const rmDate  = new Date(`${rentMonth}-01`);
      const occDate = new Date(customer.actual_occupancy_date);
      yearsElapsed  = Math.max(0, Math.floor((rmDate - occDate) / (1000 * 60 * 60 * 24 * 365.25)));
    }

    if (monthlyRent > 0) {
      const c    = calcRentForMonth(monthlyRent, safeClosureDate, rentMonth);
      grossAmount  = c.rent;
      rentDetails  = c;
    } else {
      grossAmount  = toFloat(customer.financial_rent);
      rentDetails  = { rent: grossAmount, rentType: 'financial_record', monthlyRent: grossAmount };
    }

    // Floor 7 escalation tiers
    if (String(customer.floor_no) === '7') {
      escalationRate = yearsElapsed < 3 ? 0 : yearsElapsed < 6 ? 15 : 32.25;
      grossAmount    = round2(grossAmount * (1 + escalationRate / 100));
    }
  }

  return { grossAmount, escalationRate, yearsElapsed, rentDetails, monthlyRent };
};

const isTdsExempt = (cust) => cust.tds_applicable === 'N';

const computeGstForPayment = (netPayout, cust) => {
  const gstNo    = cust.gst_no || null;
  const hasGst   = !!gstNo;
  const cgstRate = hasGst ? (toFloat(cust.cgst) || 9) : 0;
  const sgstRate = hasGst ? (toFloat(cust.sgst) || 9) : 0;
  if (!hasGst)
    return {
      has_gst: false, gst_no: null,
      cgst_rate: 0, sgst_rate: 0,
      cgst_amount: 0, sgst_amount: 0, total_gst_amount: 0,
      net_transfer: round2(netPayout),
    };
  const { cgst: cgstAmount, sgst: sgstAmount, total: totalGstAmount } =
    calculateGSTSplit(netPayout, cgstRate, sgstRate);
  return {
    has_gst: true, gst_no: gstNo,
    cgst_rate: cgstRate, sgst_rate: sgstRate,
    cgst_amount: cgstAmount, sgst_amount: sgstAmount, total_gst_amount: totalGstAmount,
    net_transfer: round2(netPayout + totalGstAmount),
  };
};

const splitPayoutForPayment = (netPayout, splits) => {
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (splits.length === 1) return [{ ...splits[0], amount: round2(netPayout), percentage: splits[0].percentage }];
  let remaining = round2(netPayout);
  return splits.map((sp, i) => {
    const isLast = i === splits.length - 1;
    const amount = isLast ? round2(remaining) : round2(netPayout * sp.percentage / 100);
    remaining = round2(remaining - amount);
    return { ...sp, amount };
  });
};

const parsePayoutSplits = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return null;
};

// ─── enrichPayment ────────────────────────────────────────────────────────────
const enrichPayment = (p, cust) => {
  const netPayout       = toFloat(p.net_payout);
  const gst             = computeGstForPayment(netPayout, cust);
  const splits          = parsePayoutSplits(cust.payout_splits);
  const payoutBreakdown = splits && splits.length > 0
    ? splitPayoutForPayment(netPayout, splits)
    : null;
  return {
    ...p,
    customer_name:    cust.customer_name,
    customer_code:    cust.customer_id,
    unit_no:          cust.cu_unit_no  || cust.unit_no  || null,
    floor_no:         cust.cu_floor_no || cust.floor_no || null,
    property_name:    cust.property_name,
    payout_splits:    splits,
    payout_breakdown: payoutBreakdown,
    ...gst,
  };
};

// ─── Shared SQL fragments ─────────────────────────────────────────────────────
/**
 * UNIT_JOIN
 * cu_direct: the unit explicitly stored on the payment row
 * cu_fb:     latest unit for this customer (fallback when payment has no unit id)
 */
const UNIT_JOIN = `
  LEFT JOIN customer_units cu_direct
         ON cu_direct.id = p.customer_unit_id
        AND cu_direct.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT id, unit_no, floor_no, property_name,
           bank_account_number, ifsc_code, bank_name, payout_splits
    FROM customer_units
    WHERE customer_id = c.id AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  ) cu_fb ON (p.customer_unit_id IS NULL OR cu_direct.id IS NULL)
`;

const UNIT_COLS = `
  COALESCE(cu_direct.unit_no,             cu_fb.unit_no)             AS unit_no,
  COALESCE(cu_direct.floor_no,            cu_fb.floor_no)            AS floor_no,
  COALESCE(cu_direct.property_name,       cu_fb.property_name)       AS property_name,
  COALESCE(cu_direct.bank_account_number, cu_fb.bank_account_number) AS bank_account_number,
  COALESCE(cu_direct.ifsc_code,           cu_fb.ifsc_code)           AS ifsc_code,
  COALESCE(cu_direct.bank_name,           cu_fb.bank_name)           AS bank_name,
  COALESCE(cu_direct.payout_splits,       cu_fb.payout_splits)       AS payout_splits
`;

/**
 * FR_JOIN_FOR_PAYMENT
 * Strictly joins to the financial record that belongs to the unit on the payment.
 * No cross-unit fallback — prevents wrong rent leaking from another unit.
 */
const FR_JOIN_FOR_PAYMENT = `
  LEFT JOIN LATERAL (
    SELECT rent, tds_applicable, rental_value_per_sft,
           total_sale_consideration, payment_closure_date, payment_mode
    FROM financial_records
    WHERE deleted_at IS NULL
      AND customer_unit_id = COALESCE(p.customer_unit_id, cu_direct.id)
    ORDER BY created_at DESC
    LIMIT 1
  ) fr ON TRUE
`;

/**
 * frJoinForUnit
 * Used in generateMonthlyPayments / createPaymentSchedule.
 * Strictly matches by customer_unit_id = cu.id.
 * If a unit has no financial record it is correctly skipped ("No financial record").
 */
const frJoinForUnit = `
  LEFT JOIN LATERAL (
    SELECT rent, tds_applicable, rental_value_per_sft,
           total_sale_consideration, payment_closure_date,
           payment_mode, partial_payments
    FROM financial_records
    WHERE deleted_at IS NULL
      AND customer_unit_id = cu.id
    ORDER BY created_at DESC
    LIMIT 1
  ) fr ON TRUE
`;

// ─── INSERT helper ────────────────────────────────────────────────────────────
const insertPayment = async (client, params) => {
  const {
    customerId, paymentDate, rentMonth, grossAmount, tdsAmount, netPayout,
    period, baseRent, escalationRate, yearsElapsed, scheduledDate,
    userId, installmentNo, totalInstallments, installmentPct,
    payoutSplitsJson, customerUnitId,
  } = params;
  // ── Race-condition guard ──────────────────────────────────────────────────
  // Duplicate key = (customer_unit_id, payment_month, installment_no).
  // • Full-payment / single-row  → installment_no IS NULL; guard on NULL match.
  // • Partial financial tranches → installment_no = 1,2,3…; each is independent.
  // • Percentage installments    → same as above.
  //
  // Using INSERT … SELECT … WHERE NOT EXISTS is atomic within the transaction,
  // so concurrent calls cannot race past the check.
  // ── Explicit typed parameters avoid "inconsistent types for $N" (PG 42P08) ──
  // $3 appears in both the INSERT column list (payment_month VARCHAR(7)) and the
  // WHERE NOT EXISTS subquery.  Casting every reused param prevents type-inference
  // conflicts between text / character-varying.
  const installNoParam = (installmentNo != null) ? installmentNo : null;

  const { rows: [p] } = await client.query(
    `INSERT INTO payments (
       customer_id, payment_date, payment_month, gross_amount, tds_amount,
       net_payout, payment_period, base_rent, escalation_rate, years_elapsed,
       scheduled_date, status, created_by,
       installment_no, total_installments, installment_percentage,
       payout_splits, customer_unit_id
     )
     SELECT
       $1::uuid,
       $2::date,
       $3::varchar,
       $4::numeric,
       $5::numeric,
       $6::numeric,
       $7::varchar,
       $8::numeric,
       $9::numeric,
       $10::numeric,
       $11::date,
       'Pending'::varchar,
       $12::uuid,
       $13::int,
       $14::int,
       $15::numeric,
       $16::jsonb,
       $17::uuid
     WHERE NOT EXISTS (
       SELECT 1 FROM payments
       WHERE  customer_unit_id = $17::uuid
         AND  payment_month    = $3::varchar
         AND  deleted_at      IS NULL
         AND  status          <> 'Cancelled'
         AND  (
                ($13::int IS NULL     AND installment_no IS NULL)
             OR ($13::int IS NOT NULL AND installment_no = $13::int)
              )
     )
     RETURNING *`,
    [
      customerId,               // $1  uuid
      paymentDate,              // $2  date
      rentMonth,                // $3  varchar(7)
      grossAmount,              // $4  numeric
      tdsAmount,                // $5  numeric
      netPayout,                // $6  numeric
      period,                   // $7  varchar
      baseRent,                 // $8  numeric
      escalationRate,           // $9  numeric
      yearsElapsed,             // $10 numeric
      scheduledDate,            // $11 date
      userId,                   // $12 uuid
      installNoParam,           // $13 int  (null for full-payment rows)
      totalInstallments || null,// $14 int
      installmentPct    || null,// $15 numeric
      payoutSplitsJson  || null,// $16 jsonb
      customerUnitId    || null,// $17 uuid
    ]
  );
  // p is undefined when WHERE NOT EXISTS blocked the insert (true duplicate)
  return p || null;
};

// ─── SQL for fetching ALL units of a customer with their own financial records ─
const ALL_UNITS_FOR_CUSTOMER_SQL = `
  SELECT
    c.id AS id, c.customer_id, c.customer_name, c.email, c.phone,
    c.gst_no, c.cgst, c.sgst,
    cu.id                    AS customer_unit_id,
    cu.sqft,
    cu.floor_no,
    cu.unit_no,
    cu.agreement_type,
    cu.actual_occupancy_date,
    cu.status                AS unit_status,
    COALESCE(cu.payout_splits, c.payout_splits)         AS payout_splits,
    COALESCE(fr.tds_applicable, cu.tds_applicable, 'N') AS tds_applicable,
    fr.rent                                             AS financial_rent,
    fr.rental_value_per_sft,
    fr.total_sale_consideration,
    fr.payment_closure_date,
    fr.payment_mode,
    fr.partial_payments
  FROM customer_units cu
  JOIN customers c ON cu.customer_id = c.id
  LEFT JOIN LATERAL (
    SELECT rent, tds_applicable, rental_value_per_sft,
           total_sale_consideration, payment_closure_date,
           payment_mode, partial_payments
    FROM financial_records
    WHERE deleted_at IS NULL
      AND customer_unit_id = cu.id          -- strict: unit-specific only
    ORDER BY created_at DESC
    LIMIT 1
  ) fr ON TRUE
  WHERE c.id = $1
    AND c.deleted_at IS NULL
    AND cu.deleted_at IS NULL
    AND c.status = 'Active'
    AND cu.status = 'Active'
  ORDER BY cu.id ASC
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  calculatePayment
// ═══════════════════════════════════════════════════════════════════════════════
const calculatePayment = async (req, res) => {
  try {
    const { customerId, customerUnitId, paymentDate } = req.body;

    if (!paymentDate)
      return res.status(400).json({ success: false, error: 'paymentDate is required' });
    if (!customerId && !customerUnitId)
      return res.status(400).json({ success: false, error: 'customerId or customerUnitId is required' });

    const initDate  = new Date(paymentDate);
    const rentMonth = getRentMonth(initDate);

    // ── Single unit path ──────────────────────────────────────────────────────
    if (customerUnitId) {
      const { rows } = await query(
        `SELECT
           c.id AS id, c.customer_id, c.customer_name, c.email, c.phone,
           c.gst_no, c.cgst, c.sgst,
           cu.sqft, cu.floor_no, cu.unit_no,
           cu.agreement_type, cu.actual_occupancy_date,
           cu.status,
           COALESCE(cu.payout_splits, c.payout_splits)         AS payout_splits,
           COALESCE(fr.tds_applicable, cu.tds_applicable, 'N') AS tds_applicable,
           fr.rent                                             AS financial_rent,
           fr.rental_value_per_sft,
           fr.total_sale_consideration,
           fr.payment_closure_date,
           fr.payment_mode,
           fr.partial_payments
         FROM customer_units cu
         JOIN customers c ON cu.customer_id = c.id
         LEFT JOIN LATERAL (
           SELECT rent, tds_applicable, rental_value_per_sft,
                  total_sale_consideration, payment_closure_date,
                  payment_mode, partial_payments
           FROM financial_records
           WHERE deleted_at IS NULL
             AND customer_unit_id = cu.id    -- strict: this unit only
           ORDER BY created_at DESC
           LIMIT 1
         ) fr ON TRUE
         WHERE cu.id = $1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [customerUnitId]
      );

      if (!rows.length)
        return res.status(404).json({ success: false, error: 'Customer unit not found' });

      const cust = rows[0];
      if (cust.status !== 'Active')
        return res.status(400).json({
          success: false,
          error: `Unit is ${cust.status} — cannot calculate payment`,
        });

      const unitCalc = await _calcSingleUnit(cust, paymentDate, rentMonth);
      if (unitCalc.error)
        return res.status(400).json({
          success: false,
          error: unitCalc.error,
          code: unitCalc.code,
          ...unitCalc.meta,
        });

      return res.json({ success: true, data: unitCalc.data });
    }

    // ── Multi-unit path ───────────────────────────────────────────────────────
    const { rows: allUnits } = await query(ALL_UNITS_FOR_CUSTOMER_SQL, [customerId]);

    if (!allUnits.length)
      return res.status(404).json({
        success: false,
        error: 'Customer not found, inactive, or has no active units',
      });

    const results = [], errors = [];
    for (const cust of allUnits) {
      const unitCalc = await _calcSingleUnit(cust, paymentDate, rentMonth);
      if (unitCalc.error) {
        errors.push({
          customerUnitId: cust.customer_unit_id,
          unitNo:         cust.unit_no,
          error:          unitCalc.error,
          code:           unitCalc.code,
        });
      } else {
        results.push(unitCalc.data);
      }
    }

    if (results.length === 0 && errors.length > 0)
      return res.status(400).json({
        success: false,
        error:      errors[0].error,
        code:       errors[0].code,
        unitErrors: errors,
      });

    return res.json({
      success:    true,
      multiUnit:  true,
      data:       results,
      unitErrors: errors.length > 0 ? errors : undefined,
    });

  } catch (err) {
    console.error('calculatePayment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to calculate payment' });
  }
};

// ─── Internal helper: calculate one unit ─────────────────────────────────────
const _calcSingleUnit = async (cust, paymentDate, rentMonth) => {
  if (!cust.rental_value_per_sft && !cust.financial_rent)
    return { error: 'No financial record found for this unit. Please save a financial record first.' };
  if (!['Construction', '9-Year'].includes(cust.agreement_type))
    return { error: `Invalid agreement type: ${cust.agreement_type}` };
  if (cust.agreement_type === '9-Year' && !cust.actual_occupancy_date)
    return { error: 'Actual occupancy date required for 9-Year agreement.' };

  const totalSale  = toFloat(cust.total_sale_consideration);
  const sqft       = toFloat(cust.sqft);
  const rentPerSft = toFloat(cust.rental_value_per_sft);
  const tdsExempt  = isTdsExempt(cust);
  const splits     = parsePayoutSplits(cust.payout_splits);

  const gstNo    = cust.gst_no || null;
  const hasGst   = !!gstNo;
  const cgstRate = hasGst ? (toFloat(cust.cgst) || 9) : 0;
  const sgstRate = hasGst ? (toFloat(cust.sgst) || 9) : 0;

  // ── Duplicate check per unit ──────────────────────────────────────────────
  // Include 'Pending' so calculatePayment preview also respects existing rows
  const { rows: existingPayments } = await query(
    `SELECT id, status FROM payments
     WHERE customer_unit_id = $1
       AND payment_month = $2
       AND status NOT IN ('Cancelled')
       AND deleted_at IS NULL`,
    [cust.customer_unit_id, rentMonth]
  );
  if (existingPayments.length)
    return {
      error: `Payment for ${cust.customer_name} (Unit ${cust.unit_no}) for ${toMonthLabel(rentMonth)} already exists (status: ${existingPayments[0].status}).`,
      code:  'PAYMENT_ALREADY_EXISTS',
      meta:  { rentMonth, customerName: cust.customer_name, unitNo: cust.unit_no, existingStatus: existingPayments[0].status },
    };

  // ── Effective start date check ────────────────────────────────────────────
  const effectiveStartDate = getEffectiveStartDate(cust);
  const startMonthKey      = toMonthKey(effectiveStartDate);
  if (startMonthKey && rentMonth < startMonthKey)
    return {
      error: `Payment for ${cust.customer_name} (Unit ${cust.unit_no}) has not started yet. Rent begins from ${toMonthLabel(startMonthKey)}.`,
      code:  'PAYMENT_NOT_STARTED',
      meta:  {
        startMonth:      startMonthKey,
        startMonthLabel: toMonthLabel(startMonthKey),
        customerName:    cust.customer_name,
        rentMonth,
      },
    };

  // ── Already-paid balance ──────────────────────────────────────────────────
  const { rows: [pr] } = await query(
    `SELECT COALESCE(SUM(gross_amount), 0) AS total_paid
     FROM payments
     WHERE customer_unit_id = $1
       AND deleted_at IS NULL
       AND status <> 'Cancelled'`,
    [cust.customer_unit_id]
  );
  const totalAlreadyPaid = toFloat(pr.total_paid);
  const remainingBalance = Math.max(0, totalSale - totalAlreadyPaid);

  const buildGstDetails = (netAmount) => {
    if (!hasGst)
      return {
        cgstAmount: 0, sgstAmount: 0, totalGstAmount: 0,
        totalInvoice: round2(netAmount),
        hasGst, gstNo, cgstRate, sgstRate,
      };
    const { cgst: cgstAmount, sgst: sgstAmount, total: totalGstAmount } =
      calculateGSTSplit(netAmount, cgstRate, sgstRate);
    return {
      cgstAmount, sgstAmount, totalGstAmount,
      totalInvoice: round2(netAmount + totalGstAmount),
      hasGst, gstNo, cgstRate, sgstRate,
    };
  };

  const closureDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
  const { grossAmount, escalationRate, yearsElapsed, rentDetails, monthlyRent } =
    computeGrossForCustomer(cust, closureDate, rentMonth);

  const tdsAmount = tdsExempt ? 0 : calculateTDS(grossAmount);
  const netPayout = round2(grossAmount - tdsAmount);
  const gd        = buildGstDetails(netPayout);
  const payoutBreakdown = splits && splits.length > 0
    ? splitPayoutForPayment(netPayout, splits)
    : null;

  return {
    data: {
      dbCustomerId:   cust.id,
      customerId:     cust.customer_id,
      customerName:   cust.customer_name,
      customerUnitId: cust.customer_unit_id,
      unitNo:         cust.unit_no,
      floorNo:        cust.floor_no,
      agreementType:  cust.agreement_type,
      tdsApplicable:  cust.tds_applicable,
      tdsExempt,
      actualOccupancyDate: cust.actual_occupancy_date,
      paymentClosureDate:  cust.payment_closure_date || null,
      paymentDate, rentMonth, paymentMonth: rentMonth,
      payoutSplits: splits, payoutBreakdown,
      paymentMode:  'full',
      grossAmount:  round2(grossAmount),
      tdsAmount,    tdsApplied: tdsAmount > 0, tdsThreshold: 50000,
      netPayout,    baseRent: round2(grossAmount), tdsRate: tdsAmount > 0 ? 10 : 0,
      escalationRate, yearsElapsed: round2(yearsElapsed),
      rentCalculationDetails: {
        totalSaleConsideration: totalSale,
        totalAlreadyPaid,
        remainingBalance,
        sqft,
        rentalValuePerSft: rentPerSft,
        monthlyRent,
        ...rentDetails,
        note: rentDetails.rentType === 'prorated_closure_month'
          ? `Prorated rent ${rentDetails.daysFromClosure}/${rentDetails.daysInClosureMonth} days`
          : `Full rent for ${rentMonth}`,
      },
      ...gd,
      netBankTransfer: round2(netPayout + gd.totalGstAmount),
    },
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
//  generateMonthlyPayments
// ═══════════════════════════════════════════════════════════════════════════════
const generateMonthlyPayments = async (req, res) => {
  try {
    const { month, agreementType } = req.body;
    const userId = req.user.id;

    if (!month)
      return res.status(400).json({ success: false, error: 'month required (YYYY-MM)' });
    if (!/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });

    const [yr, mo] = month.split('-').map(Number);
    const rmDate    = new Date(yr, mo - 2, 1);
    const rentMonth = `${rmDate.getFullYear()}-${String(rmDate.getMonth() + 1).padStart(2, '0')}`;
    const scheduled0 = `${month}-01`;

    const payments = [], skipped = [], duplicates = [];

    await transaction(async (client) => {
      // One row per unit — each unit gets its OWN financial record via strict LATERAL
      let cq = `
        SELECT
          c.id, c.customer_id, c.customer_name, c.email, c.phone,
          c.gst_no, c.cgst, c.sgst, c.status AS customer_status,
          cu.id                    AS customer_unit_id,
          cu.unit_no               AS cu_unit_no,
          cu.floor_no              AS cu_floor_no,
          cu.sqft                  AS cu_sqft,
          cu.agreement_type        AS cu_agreement_type,
          cu.actual_occupancy_date AS cu_actual_occupancy_date,
          COALESCE(cu.payout_splits, c.payout_splits) AS payout_splits,
          fr.rent                  AS financial_rent,
          COALESCE(fr.tds_applicable, cu.tds_applicable, 'N') AS tds_applicable,
          fr.rental_value_per_sft,
          fr.total_sale_consideration,
          fr.payment_closure_date,
          fr.payment_mode,
          fr.partial_payments
        FROM customers c
        JOIN customer_units cu
          ON cu.customer_id = c.id
         AND cu.deleted_at IS NULL
         AND cu.status = 'Active'
        ${frJoinForUnit}
        WHERE c.deleted_at IS NULL AND c.status = 'Active'
      `;
      const cp = [];
      if (agreementType) { cq += ` AND cu.agreement_type = $1`; cp.push(agreementType); }
      cq += ` ORDER BY c.customer_name ASC, cu.id ASC`;

      const { rows: customers } = await client.query(cq, cp);
      if (!customers.length) throw new Error('No active customers found');

      for (const cust of customers) {
        // Normalise field names
        cust.sqft                  = toFloat(cust.cu_sqft);
        cust.unit_no               = cust.cu_unit_no               || null;
        cust.floor_no              = cust.cu_floor_no              || null;
        cust.agreement_type        = cust.cu_agreement_type        || null;
        cust.actual_occupancy_date = cust.cu_actual_occupancy_date || null;

        const skip = (r) => skipped.push({
          customerId:   cust.id,
          customerName: cust.customer_name,
          unitId:       cust.customer_unit_id,
          unitNo:       cust.unit_no,
          reason:       r,
        });

        const tdsExemptC = isTdsExempt(cust);
        const splitsJson = cust.payout_splits
          ? (typeof cust.payout_splits === 'string'
              ? cust.payout_splits
              : JSON.stringify(cust.payout_splits))
          : null;

        if (!cust.rental_value_per_sft && !cust.financial_rent) {
          skip('No financial record'); continue;
        }
        if (!['Construction', '9-Year'].includes(cust.agreement_type)) {
          skip(`Invalid agreement type: ${cust.agreement_type}`); continue;
        }
        if (cust.agreement_type === '9-Year' && !cust.actual_occupancy_date) {
          skip('Missing occupancy date'); continue;
        }

        const startMonthKey = toMonthKey(getEffectiveStartDate(cust));
        if (startMonthKey && rentMonth < startMonthKey) {
          skip(`${cust.customer_name} (Unit ${cust.unit_no}): payment starts ${toMonthLabel(startMonthKey)} — skipping ${toMonthLabel(rentMonth)}`);
          continue;
        }

        const cuId = cust.customer_unit_id;

        // ── Duplicate pre-check ───────────────────────────────────────────────
        // For full-payment mode: skip immediately if any non-cancelled row exists.
        // For partial/installment mode: do NOT skip here — the per-row WHERE NOT
        // EXISTS in insertPayment handles individual installment deduplication,
        // so a second run only inserts the installments that are truly missing.
        const period  = cust.agreement_type;
        const payMode = cust.payment_mode || 'full';

        if (payMode !== 'partial') {
          // Full-payment: one row per unit per month — skip if already exists
          const { rows: dup } = await client.query(
            `SELECT id FROM payments
             WHERE customer_unit_id = $1
               AND payment_month    = $2
               AND installment_no  IS NULL
               AND status          <> 'Cancelled'
               AND deleted_at      IS NULL`,
            [cuId, rentMonth]
          );
          if (dup.length) {
            duplicates.push({
              customerId:   cust.id,
              customerName: cust.customer_name,
              unitId:       cuId,
              unitNo:       cust.unit_no,
              reason:       `Payment already exists for ${toMonthLabel(rentMonth)}`,
            });
            continue;
          }
        }

        /* ── PARTIAL: financial tranches ── */
        if (payMode === 'partial') {
          const parsed = parseFinancialPartials(cust.partial_payments);

          if (parsed?.type === 'financial') {
            const allEntries = parsed.entries;
            const totalSaleC = toFloat(cust.total_sale_consideration);
            const sqftC      = toFloat(cust.sqft);
            const rpsftC     = toFloat(cust.rental_value_per_sft);
            const entries    = filterActiveEntries(allEntries, rentMonth);

            if (!entries.length) { skip('No active partial tranches for this rent month'); continue; }

            // Use earliest entry closure as the reference closure date
            let cdfg = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
            if (!cdfg) {
              for (const e of allEntries) {
                const src = getEntryClosureDate(e);
                if (src) { cdfg = new Date(src); break; }
              }
            }

            const { escalationRate, yearsElapsed } = computeGrossForCustomer(cust, cdfg, rentMonth);

            const entryData = entries.map((e) => {
              const bank      = toFloat(e.bankAmount ?? e.bank_amount);
              const tdsRcvd  = toFloat(e.tdsAmount  ?? e.tds_amount);
              const amtRcvd  = bank + tdsRcvd;
              const closureS = getEntryClosureDate(e) ?? '';

              // Rent for this tranche, prorated if in closure month
              const baseRent   = calcPartialBaseRent(amtRcvd, closureS, totalSaleC, sqftC, rpsftC, rentMonth);
              const entryGross = round2(
                baseRent + (escalationRate > 0 ? round2(baseRent * escalationRate / 100) : 0)
              );
              return { closureS, dateStr: e.date ?? scheduled0, baseRent, entryGross };
            });

            // TDS is computed on combined gross, applied only to first row
            const combinedGross = round2(entryData.reduce((s, d) => s + d.entryGross, 0));
            const combinedTds   = tdsExemptC ? 0 : calculateTDS(combinedGross);

            for (let idx = 0; idx < entryData.length; idx++) {
              const { closureS, dateStr, entryGross, baseRent } = entryData[idx];
              const rowTds = idx === 0 ? combinedTds : 0;
              const rowNet = round2(entryGross - rowTds);
              const p = await insertPayment(client, {
                customerId: cust.id, paymentDate: dateStr, rentMonth,
                grossAmount: entryGross, tdsAmount: rowTds, netPayout: rowNet,
                period, baseRent, escalationRate, yearsElapsed,
                scheduledDate: closureS || dateStr,
                userId,
                installmentNo: idx + 1, totalInstallments: entries.length, installmentPct: null,
                payoutSplitsJson: splitsJson, customerUnitId: cuId,
              });
              if (p) payments.push(enrichPayment(p, cust));
            }
            continue;
          }

          if (parsed?.type === 'installment') {
            const refDate = cust.payment_closure_date
              ? new Date(cust.payment_closure_date)
              : new Date(scheduled0);
            const { grossAmount, escalationRate, yearsElapsed } =
              computeGrossForCustomer(cust, refDate, rentMonth);

            let defs;
            try { defs = calcPartialInstallments(cust.partial_payments); }
            catch (e) { skip(e.message); continue; }

            if (defs) {
              const bd = buildInstallmentBreakdown(defs, grossAmount, tdsExemptC);
              for (const inst of bd) {
                const instDate = buildScheduledDate(month, inst.due_day);
                const p = await insertPayment(client, {
                  customerId: cust.id, paymentDate: instDate, rentMonth,
                  grossAmount: inst.gross_amount, tdsAmount: inst.tds_amount, netPayout: inst.net_payout,
                  period, baseRent: grossAmount, escalationRate, yearsElapsed,
                  scheduledDate: instDate,
                  userId,
                  installmentNo: inst.installment_no, totalInstallments: bd.length,
                  installmentPct: inst.percentage,
                  payoutSplitsJson: splitsJson, customerUnitId: cuId,
                });
                if (p) payments.push(enrichPayment(p, cust));
              }
              continue;
            }
          }
        }

        /* ── FULL payment mode ── */
        const refDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
        const { grossAmount, escalationRate, yearsElapsed } =
          computeGrossForCustomer(cust, refDate, rentMonth);
        const tds = tdsExemptC ? 0 : calculateTDS(grossAmount);
        const net = round2(grossAmount - tds);
        const p   = await insertPayment(client, {
          customerId: cust.id, paymentDate: scheduled0, rentMonth,
          grossAmount, tdsAmount: tds, netPayout: net,
          period, baseRent: grossAmount, escalationRate, yearsElapsed,
          scheduledDate: scheduled0,
          userId,
          installmentNo: null, totalInstallments: null, installmentPct: null,
          payoutSplitsJson: splitsJson, customerUnitId: cuId,
        });
        if (p) payments.push(enrichPayment(p, cust));
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'MONTHLY_PAYMENTS_GENERATED','PAYMENT',NULL,$2,$3,$4,'SUCCESS')`,
        [
          userId,
          JSON.stringify({
            initiationMonth: month, rentMonth,
            generated: payments.length, skipped: skipped.length,
            duplicates: duplicates.length,
            agreementType: agreementType || 'All',
          }),
          req.ip || '0.0.0.0',
          req.headers['user-agent'] || 'system',
        ]
      );
    });

    res.status(201).json({
      success: true,
      message: `Generated ${payments.length} payment(s) for rent month: ${toMonthLabel(rentMonth)}`,
      data: {
        initiationMonth:        month,
        rentMonth,
        rentMonthDisplay:       toMonthLabel(rentMonth),
        initiationMonthDisplay: toMonthLabel(month),
        paymentsGenerated:      payments.length,
        skippedCount:           skipped.length,
        duplicateCount:         duplicates.length,
        payments, skipped, duplicates,
      },
    });
  } catch (err) {
    console.error('generateMonthlyPayments error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate monthly payments' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  createPaymentSchedule
// ═══════════════════════════════════════════════════════════════════════════════
const createPaymentSchedule = async (req, res) => {
  try {
    const { customerIds, scheduledDate } = req.body;
    const userId = req.user.id;

    if (!customerIds?.length)
      return res.status(400).json({ success: false, error: 'No customers selected' });
    if (!scheduledDate)
      return res.status(400).json({ success: false, error: 'scheduledDate required' });

    const initDate  = new Date(scheduledDate);
    const rentMonth = getRentMonth(initDate);
    const pmStr     = `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, '0')}`;
    const payments  = [], skipped = [];

    await transaction(async (client) => {
      for (const customerId of customerIds) {
        const { rows } = await client.query(
          `SELECT
             c.id, c.customer_id, c.customer_name, c.email, c.phone,
             c.gst_no, c.cgst, c.sgst,
             cu.id                    AS customer_unit_id,
             cu.unit_no               AS cu_unit_no,
             cu.floor_no              AS cu_floor_no,
             cu.sqft                  AS cu_sqft,
             cu.agreement_type        AS cu_agreement_type,
             cu.actual_occupancy_date AS cu_actual_occupancy_date,
             COALESCE(cu.payout_splits, c.payout_splits) AS payout_splits,
             fr.rent                  AS financial_rent,
             COALESCE(fr.tds_applicable, cu.tds_applicable, 'N') AS tds_applicable,
             fr.rental_value_per_sft,
             fr.total_sale_consideration,
             fr.payment_closure_date,
             fr.payment_mode,
             fr.partial_payments
           FROM customers c
           JOIN customer_units cu
             ON cu.customer_id = c.id
            AND cu.deleted_at IS NULL
            AND cu.status = 'Active'
           ${frJoinForUnit}
           WHERE c.id = $1 AND c.deleted_at IS NULL AND c.status = 'Active'
           ORDER BY cu.id ASC`,
          [customerId]
        );

        if (!rows.length) {
          skipped.push({ customerId, customerName: null, reason: 'Not found, inactive, or no active units' });
          continue;
        }

        for (const cust of rows) {
          cust.sqft                  = toFloat(cust.cu_sqft);
          cust.unit_no               = cust.cu_unit_no               || null;
          cust.floor_no              = cust.cu_floor_no              || null;
          cust.agreement_type        = cust.cu_agreement_type        || null;
          cust.actual_occupancy_date = cust.cu_actual_occupancy_date || null;

          const skip = (r) => skipped.push({
            customerId,
            customerName: cust.customer_name,
            unitId:       cust.customer_unit_id,
            unitNo:       cust.unit_no,
            reason:       r,
          });

          const tdsExemptC = isTdsExempt(cust);
          const splitsJson = cust.payout_splits
            ? (typeof cust.payout_splits === 'string'
                ? cust.payout_splits
                : JSON.stringify(cust.payout_splits))
            : null;
          const cuId = cust.customer_unit_id;

          if (!cust.rental_value_per_sft && !cust.financial_rent) {
            skip('No financial record'); continue;
          }
          if (!['Construction', '9-Year'].includes(cust.agreement_type)) {
            skip('Invalid agreement type'); continue;
          }
          if (cust.agreement_type === '9-Year' && !cust.actual_occupancy_date) {
            skip('Missing occupancy date'); continue;
          }

          const startMonthKey = toMonthKey(getEffectiveStartDate(cust));
          if (startMonthKey && rentMonth < startMonthKey) {
            skip(`Payment starts ${toMonthLabel(startMonthKey)}`); continue;
          }

          const period  = cust.agreement_type;
          const payMode = cust.payment_mode || 'full';

          // Full-payment only: skip if a non-cancelled full-payment row exists.
          // Partial/installment: per-row guard in insertPayment handles deduplication.
          if (payMode !== 'partial') {
            const { rows: dup } = await client.query(
              `SELECT id FROM payments
               WHERE customer_unit_id = $1
                 AND payment_month    = $2
                 AND installment_no  IS NULL
                 AND status          <> 'Cancelled'
                 AND deleted_at      IS NULL`,
              [cuId, rentMonth]
            );
            if (dup.length) { skip(`Payment already exists for ${toMonthLabel(rentMonth)}`); continue; }
          }

          /* ── PARTIAL: financial tranches ── */
          if (payMode === 'partial') {
            const parsed = parseFinancialPartials(cust.partial_payments);

            if (parsed?.type === 'financial') {
              const allEntries = parsed.entries;
              const totalSaleC = toFloat(cust.total_sale_consideration);
              const sqftC      = toFloat(cust.sqft);
              const rpsftC     = toFloat(cust.rental_value_per_sft);
              const entries    = filterActiveEntries(allEntries, rentMonth);

              if (!entries.length) { skip('No active tranches'); continue; }

              let cdfg = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
              if (!cdfg) {
                for (const e of allEntries) {
                  const src = getEntryClosureDate(e);
                  if (src) { cdfg = new Date(src); break; }
                }
              }

              const { escalationRate, yearsElapsed } = computeGrossForCustomer(cust, cdfg, rentMonth);

              const entryData = entries.map((e) => {
                const bank    = toFloat(e.bankAmount ?? e.bank_amount);
                const tdsRcvd = toFloat(e.tdsAmount  ?? e.tds_amount);
                const amtRcvd = bank + tdsRcvd;
                const closureS = getEntryClosureDate(e) ?? '';
                const baseRent   = calcPartialBaseRent(amtRcvd, closureS, totalSaleC, sqftC, rpsftC, rentMonth);
                const entryGross = round2(
                  baseRent + (escalationRate > 0 ? round2(baseRent * escalationRate / 100) : 0)
                );
                return { closureS, dateStr: e.date ?? scheduledDate, baseRent, entryGross };
              });

              const combinedTds = tdsExemptC
                ? 0
                : calculateTDS(round2(entryData.reduce((s, d) => s + d.entryGross, 0)));

              for (let idx = 0; idx < entryData.length; idx++) {
                const { closureS, dateStr, entryGross, baseRent } = entryData[idx];
                const rowTds = idx === 0 ? combinedTds : 0;
                const rowNet = round2(entryGross - rowTds);
                const p = await insertPayment(client, {
                  customerId: cust.id, paymentDate: dateStr, rentMonth,
                  grossAmount: entryGross, tdsAmount: rowTds, netPayout: rowNet,
                  period, baseRent, escalationRate, yearsElapsed,
                  scheduledDate: closureS || dateStr,
                  userId,
                  installmentNo: idx + 1, totalInstallments: entries.length, installmentPct: null,
                  payoutSplitsJson: splitsJson, customerUnitId: cuId,
                });
                if (p) payments.push(enrichPayment(p, cust));
              }
              continue;
            }

            if (parsed?.type === 'installment') {
              const refDate = cust.payment_closure_date
                ? new Date(cust.payment_closure_date)
                : initDate;
              const { grossAmount, escalationRate, yearsElapsed } =
                computeGrossForCustomer(cust, refDate, rentMonth);

              let defs;
              try { defs = calcPartialInstallments(cust.partial_payments); }
              catch (e) { skip(e.message); continue; }

              if (defs) {
                const bd = buildInstallmentBreakdown(defs, grossAmount, tdsExemptC);
                for (const inst of bd) {
                  const instDate = buildScheduledDate(pmStr, inst.due_day);
                  const p = await insertPayment(client, {
                    customerId: cust.id, paymentDate: instDate, rentMonth,
                    grossAmount: inst.gross_amount, tdsAmount: inst.tds_amount, netPayout: inst.net_payout,
                    period, baseRent: grossAmount, escalationRate, yearsElapsed,
                    scheduledDate: instDate,
                    userId,
                    installmentNo: inst.installment_no, totalInstallments: bd.length,
                    installmentPct: inst.percentage,
                    payoutSplitsJson: splitsJson, customerUnitId: cuId,
                  });
                  if (p) payments.push(enrichPayment(p, cust));
                }
                continue;
              }
            }
          }

          /* ── FULL payment mode ── */
          const refDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
          const { grossAmount, escalationRate, yearsElapsed } =
            computeGrossForCustomer(cust, refDate, rentMonth);
          const tds = tdsExemptC ? 0 : calculateTDS(grossAmount);
          const net = round2(grossAmount - tds);
          const p   = await insertPayment(client, {
            customerId: cust.id, paymentDate: scheduledDate, rentMonth,
            grossAmount, tdsAmount: tds, netPayout: net,
            period, baseRent: grossAmount, escalationRate, yearsElapsed,
            scheduledDate,
            userId,
            installmentNo: null, totalInstallments: null, installmentPct: null,
            payoutSplitsJson: splitsJson, customerUnitId: cuId,
          });
          if (p) payments.push(enrichPayment(p, cust));
        }
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'PAYMENT_SCHEDULE_CREATED','PAYMENT',NULL,$2,$3,$4,'SUCCESS')`,
        [
          userId,
          JSON.stringify({
            scheduled: payments.length, skipped: skipped.length, rentMonth, scheduledDate,
          }),
          req.ip || '0.0.0.0',
          req.headers['user-agent'] || 'system',
        ]
      );
    });

    res.status(201).json({
      success: true,
      message: `${payments.length} payment(s) scheduled${skipped.length ? `, ${skipped.length} skipped` : ''}`,
      data: { payments, skipped, rentMonth },
    });
  } catch (err) {
    console.error('createPaymentSchedule error:', err);
    res.status(500).json({ success: false, error: 'Failed to create payment schedule' });
  }
};

// ─── getPaymentSchedule ───────────────────────────────────────────────────────
const getPaymentSchedule = async (req, res) => {
  try {
    // month   = full 'YYYY-MM' string  (exact month filter)
    // year    = 'YYYY' string           (filter entire year)
    // monthNo = '1'–'12'               (filter specific month-number across years)
    const { month, year, monthNo, status, agreementType } = req.query;
    const params = []; let pi = 1;

    let sql = `
      SELECT
        p.*,
        c.customer_name,
        c.customer_id AS customer_code,
        c.email, c.phone, c.pan_number,
        c.agreement_type AS customer_agreement_type,
        c.gst_no, c.cgst, c.sgst,
        COALESCE(cu_direct.agreement_type, c.agreement_type) AS agreement_type,
        ${UNIT_COLS},
        fr.rent                    AS financial_rent,
        fr.tds_applicable,
        fr.rental_value_per_sft,
        fr.total_sale_consideration,
        fr.payment_closure_date,
        fr.payment_mode
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ${UNIT_JOIN}
      ${FR_JOIN_FOR_PAYMENT}
      WHERE p.deleted_at IS NULL
    `;

    // Exact YYYY-MM match (most common — frontend passes selected month)
    if (month)         { sql += ` AND p.payment_month = $${pi}`;                                     params.push(month);         pi++; }
    // Year-only filter: payment_month LIKE '2026-%'
    if (!month && year){ sql += ` AND p.payment_month LIKE $${pi}`;                                  params.push(`${year}-%`);    pi++; }
    // Month-number filter (1–12 as text, padded): extract month from payment_month
    if (monthNo)       { sql += ` AND SUBSTRING(p.payment_month, 6, 2) = $${pi}`;                   params.push(String(monthNo).padStart(2, '0')); pi++; }
    if (status)        { sql += ` AND p.status = $${pi}`;                                            params.push(status);        pi++; }
    if (agreementType) {
      sql += ` AND COALESCE(cu_direct.agreement_type, c.agreement_type) = $${pi}`;
      params.push(agreementType); pi++;
    }
    sql += ` ORDER BY c.customer_name ASC, p.payment_month DESC, p.installment_no ASC NULLS LAST, p.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getPaymentSchedule error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payment schedule' });
  }
};

// ─── getPaymentById ───────────────────────────────────────────────────────────
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT
         p.*,
         c.customer_name, c.customer_id AS customer_code,
         c.email, c.phone, c.pan_number,
         c.agreement_type AS customer_agreement_type,
         c.gst_no, c.cgst, c.sgst,
         COALESCE(cu_direct.agreement_type, c.agreement_type) AS agreement_type,
         ${UNIT_COLS},
         fr.rent                    AS financial_rent,
         fr.tds_applicable,
         fr.rental_value_per_sft,
         fr.total_sale_consideration,
         fr.payment_closure_date,
         fr.payment_mode
       FROM payments p
       JOIN customers c ON p.customer_id = c.id
       ${UNIT_JOIN}
       ${FR_JOIN_FOR_PAYMENT}
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Payment not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getPaymentById error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payment' });
  }
};

// ─── resetOrderCreated ────────────────────────────────────────────────────────
const resetOrderCreated = async (req, res) => {
  try {
    const { paymentIds } = req.body;
    if (!paymentIds?.length)
      return res.status(400).json({ success: false, error: 'paymentIds required' });
    await query(
      `UPDATE payments SET status = 'Pending', razorpay_order_id = NULL, order_created_at = NULL
       WHERE id = ANY($1) AND status = 'Order_Created' AND deleted_at IS NULL`,
      [paymentIds]
    );
    res.json({ success: true, message: 'Payments reset to Pending' });
  } catch (err) {
    console.error('resetOrderCreated error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset payments' });
  }
};

// ─── completePayment ──────────────────────────────────────────────────────────
const completePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionReference, bankReference } = req.body;
    const userId = req.user.id;

    if (!transactionReference?.trim())
      return res.status(400).json({ success: false, error: 'transactionReference is required' });

    const { rows } = await query(
      `UPDATE payments
       SET status='Completed', transaction_reference=$1, bank_reference=$2,
           completed_date=NOW(), completed_by=$3
       WHERE id=$4 AND status='Processing' AND deleted_at IS NULL
       RETURNING *`,
      [transactionReference, bankReference || null, userId, id]
    );
    if (!rows.length)
      return res.status(404).json({
        success: false,
        error: 'Payment not found or not in Processing status',
      });

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'PAYMENT_COMPLETED','PAYMENT',$2,$3,$4,$5,'SUCCESS')`,
      [
        userId, id,
        JSON.stringify({
          transaction_reference: transactionReference,
          bank_reference: bankReference,
          amount: rows[0].net_payout,
        }),
        req.ip || '0.0.0.0',
        req.headers['user-agent'] || 'system',
      ]
    );
    res.json({ success: true, message: 'Payment completed successfully', data: rows[0] });
  } catch (err) {
    console.error('completePayment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to complete payment' });
  }
};

// ─── initiatePaymentBatch ─────────────────────────────────────────────────────
const initiatePaymentBatch = async (req, res) => {
  try {
    const { paymentIds } = req.body;
    const userId = req.user.id;
    if (!paymentIds?.length)
      return res.status(400).json({ success: false, error: 'No payments selected' });

    let batch;
    await transaction(async (client) => {
      const { rows: pmts } = await client.query(
        `SELECT * FROM payments
         WHERE id = ANY($1) AND status = 'Pending' AND deleted_at IS NULL`,
        [paymentIds]
      );
      if (!pmts.length) throw new Error('No valid pending payments found');

      const tGross = round2(pmts.reduce((s, p) => s + toFloat(p.gross_amount), 0));
      const tTds   = round2(pmts.reduce((s, p) => s + toFloat(p.tds_amount),   0));
      const tNet   = round2(pmts.reduce((s, p) => s + toFloat(p.net_payout),   0));

      const { rows: [b] } = await client.query(
        `INSERT INTO payment_batches (
           batch_date, total_payments, total_gross_amount, total_tds_amount,
           total_net_payout, status, created_by, submitted_by, submitted_date
         )
         VALUES ($1,$2,$3,$4,$5,'Submitted',$6,$7,NOW())
         RETURNING *`,
        [new Date(), pmts.length, tGross, tTds, tNet, userId, userId]
      );
      batch = b;

      for (let i = 0; i < pmts.length; i++) {
        await client.query(
          `INSERT INTO payment_batch_items (batch_id, payment_id, sequence_number)
           VALUES ($1,$2,$3)`,
          [batch.id, pmts[i].id, i + 1]
        );
        await client.query(
          `UPDATE payments SET status='Processing', processed_by=$1, processed_date=NOW()
           WHERE id=$2`,
          [userId, pmts[i].id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'PAYMENT_BATCH_INITIATED','PAYMENT_BATCH',$2,$3,$4,$5,'SUCCESS')`,
        [
          userId, batch.id,
          JSON.stringify({ total_payments: pmts.length }),
          req.ip || '0.0.0.0',
          req.headers['user-agent'] || 'system',
        ]
      );
    });

    res.status(201).json({ success: true, message: 'Payment batch initiated', data: batch });
  } catch (err) {
    console.error('initiatePaymentBatch error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to initiate batch' });
  }
};

// ─── getPaymentHistory ────────────────────────────────────────────────────────
const getPaymentHistory = async (req, res) => {
  try {
    const {
      page = 1, limit = 10,
      customerId, status, startDate, endDate, month, agreementType,
    } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let queryText = `
      SELECT
        p.*,
        p.payout_splits                  AS payment_payout_splits,
        c.customer_id                    AS customer_code,
        c.customer_name, c.pan_number, c.email, c.phone,
        c.agreement_type                 AS customer_agreement_type,
        c.tds_applicable                 AS customer_tds_applicable,
        c.nri_status,
        c.gst_no, c.cgst, c.sgst,
        COALESCE(cu_direct.agreement_type, c.agreement_type) AS agreement_type,
        ${UNIT_COLS},
        fr.rent                          AS financial_rent,
        fr.tds_applicable                AS fr_tds_applicable,
        fr.rental_value_per_sft,
        fr.total_sale_consideration,
        fr.payment_closure_date,
        fr.payment_mode
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ${UNIT_JOIN}
      ${FR_JOIN_FOR_PAYMENT}
      WHERE p.deleted_at IS NULL
    `;
    const queryParams = []; let pi = 1;

    if (customerId)    { queryText += ` AND p.customer_id = $${pi}`;   queryParams.push(customerId);  pi++; }
    if (status)        { queryText += ` AND p.status = $${pi}`;        queryParams.push(status);      pi++; }
    if (startDate)     { queryText += ` AND p.payment_date >= $${pi}`; queryParams.push(startDate);   pi++; }
    if (endDate)       { queryText += ` AND p.payment_date <= $${pi}`; queryParams.push(endDate);     pi++; }
    if (month)         { queryText += ` AND p.payment_month = $${pi}`; queryParams.push(month);       pi++; }
    if (agreementType) {
      queryText += ` AND COALESCE(cu_direct.agreement_type, c.agreement_type) = $${pi}`;
      queryParams.push(agreementType); pi++;
    }

    queryText += ` ORDER BY p.payment_date DESC, p.created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`;
    queryParams.push(parseInt(limit), offset);

    const result = await query(queryText, queryParams);

    // Count query (mirrors above without ORDER BY / LIMIT)
    let countQuery = `
      SELECT COUNT(*) FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ${UNIT_JOIN}
      WHERE p.deleted_at IS NULL
    `;
    const countParams = []; let cp = 1;
    if (customerId)    { countQuery += ` AND p.customer_id=$${cp}`;   countParams.push(customerId);  cp++; }
    if (status)        { countQuery += ` AND p.status=$${cp}`;        countParams.push(status);      cp++; }
    if (startDate)     { countQuery += ` AND p.payment_date>=$${cp}`; countParams.push(startDate);   cp++; }
    if (endDate)       { countQuery += ` AND p.payment_date<=$${cp}`; countParams.push(endDate);     cp++; }
    if (month)         { countQuery += ` AND p.payment_month=$${cp}`; countParams.push(month);       cp++; }
    if (agreementType) {
      countQuery += ` AND COALESCE(cu_direct.agreement_type, c.agreement_type)=$${cp}`;
      countParams.push(agreementType); cp++;
    }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        payments: result.rows,
        pagination: {
          page:       parseInt(page),
          limit:      parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('getPaymentHistory error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
};

// ─── getPaymentStats ──────────────────────────────────────────────────────────
const getPaymentStats = async (req, res) => {
  try {
    const { month, agreementType } = req.query;
    const params = []; let pi = 1;

    let sql = `
      SELECT
        COUNT(*)                                                                           AS total_payments,
        COUNT(*) FILTER (WHERE p.status='Pending')                                        AS pending_payments,
        COUNT(*) FILTER (WHERE p.status='Completed')                                      AS completed_payments,
        COUNT(*) FILTER (WHERE p.status='Processing')                                     AS processing_payments,
        COUNT(*) FILTER (WHERE p.status='Failed')                                         AS failed_payments,
        COUNT(*) FILTER (WHERE COALESCE(cu_direct.agreement_type, c.agreement_type)='Construction') AS construction_payments,
        COUNT(*) FILTER (WHERE COALESCE(cu_direct.agreement_type, c.agreement_type)='9-Year')       AS nine_year_payments,
        COALESCE(SUM(p.gross_amount), 0)                                                   AS total_gross,
        COALESCE(SUM(p.tds_amount), 0)                                                     AS total_tds,
        COALESCE(SUM(p.net_payout), 0)                                                     AS total_net,
        COALESCE(SUM(p.net_payout) FILTER (WHERE p.status='Completed'), 0)                 AS total_paid,
        COALESCE(AVG(p.escalation_rate) FILTER (
          WHERE COALESCE(cu_direct.agreement_type, c.agreement_type)='9-Year'
        ), 0)                                                                              AS avg_escalation_rate
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ${UNIT_JOIN}
      WHERE p.deleted_at IS NULL
    `;

    if (month)         { sql += ` AND p.payment_month=$${pi}`;  params.push(month);         pi++; }
    if (agreementType) {
      sql += ` AND COALESCE(cu_direct.agreement_type, c.agreement_type)=$${pi}`;
      params.push(agreementType); pi++;
    }

    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getPaymentStats error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
};

// ─── savePaymentWithAdjustment ────────────────────────────────────────────────
const savePaymentWithAdjustment = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      customerId, customerUnitId, paymentDate, rentMonth,
      grossAmount, tdsAmount,
      originalNetPayout, adjustmentAmount = 0, adjustedNetPayout,
      adjustmentNote = null,
      payoutSplits = null, payoutBreakdown = null,
    } = req.body;

    if (!customerId || !paymentDate || !rentMonth)
      return res.status(400).json({
        success: false,
        error: 'customerId, paymentDate, and rentMonth are required',
      });
    if (adjustedNetPayout == null || adjustedNetPayout <= 0)
      return res.status(400).json({
        success: false,
        error: 'adjustedNetPayout must be a positive number',
      });

    // Duplicate check — always use customer_unit_id when provided
    const dupCheck = customerUnitId
      ? await query(
          `SELECT id, status FROM payments
           WHERE customer_unit_id = $1
             AND payment_month = $2
             AND status <> 'Cancelled'
             AND deleted_at IS NULL`,
          [customerUnitId, rentMonth]
        )
      : await query(
          `SELECT id, status FROM payments
           WHERE customer_id = $1
             AND customer_unit_id IS NULL
             AND payment_month = $2
             AND status <> 'Cancelled'
             AND deleted_at IS NULL`,
          [customerId, rentMonth]
        );

    if (dupCheck.rows.length)
      return res.status(409).json({
        success: false,
        error: `A payment for ${rentMonth} already exists with status "${dupCheck.rows[0].status}". Cancel it first.`,
        code: 'PAYMENT_ALREADY_EXISTS',
        existingId: dupCheck.rows[0].id,
      });

    const { rows: custRows } = await query(
      `SELECT customer_name, agreement_type FROM customers WHERE id=$1 AND deleted_at IS NULL`,
      [customerId]
    );
    if (!custRows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    const period     = custRows[0].agreement_type;
    const splitsJson = payoutSplits ? JSON.stringify(payoutSplits) : null;
    const adj        = round2(adjustmentAmount);
    const adjNet     = round2(adjustedNetPayout);
    const origNet    = round2(originalNetPayout ?? (round2(grossAmount) - round2(tdsAmount)));
    const noteWithAdj = [
      adjustmentNote,
      `Adjustment: ${adj >= 0 ? '+' : ''}₹${adj} (original net ₹${origNet} → adjusted ₹${adjNet})`,
    ].filter(Boolean).join(' | ');

    const { rows: [payment] } = await query(
      `INSERT INTO payments (
         customer_id, customer_unit_id, payment_date, payment_month,
         gross_amount, tds_amount, net_payout, payment_period, base_rent,
         escalation_rate, years_elapsed, scheduled_date, status, created_by,
         adjustment_amount, adjusted_net_payout, adjustment_note, payout_splits
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,'Pending',$11,$12,$13,$14,$15::jsonb)
       RETURNING *`,
      [
        customerId, customerUnitId || null, paymentDate, rentMonth,
        round2(grossAmount), round2(tdsAmount), adjNet,
        period, round2(grossAmount), paymentDate,
        userId, adj, adjNet, noteWithAdj, splitsJson,
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'PAYMENT_SAVED_WITH_ADJUSTMENT','PAYMENT',$2,$3,$4,$5,'SUCCESS')`,
      [
        userId, payment.id,
        JSON.stringify({
          customerId, customerUnitId, rentMonth, paymentDate,
          grossAmount: round2(grossAmount), tdsAmount: round2(tdsAmount),
          originalNet: origNet, adjustmentAmount: adj, adjustedNet: adjNet,
          adjustmentNote, hasSplits: !!payoutSplits,
        }),
        req.ip || '0.0.0.0',
        req.headers['user-agent'] || 'system',
      ]
    );

    res.status(201).json({
      success: true,
      message: `Payment saved with adjustment of ${adj >= 0 ? '+' : ''}₹${adj}. Adjusted net = ₹${adjNet}.`,
      data: {
        ...payment,
        original_net_payout: origNet,
        adjustment_amount:   adj,
        adjusted_net_payout: adjNet,
        payout_breakdown:    payoutBreakdown,
      },
    });
  } catch (error) {
    console.error('savePaymentWithAdjustment error:', error);
    res.status(500).json({ success: false, error: 'Failed to save payment with adjustment' });
  }
};

// ─── getPaymentByMonth ────────────────────────────────────────────────────────
const getPaymentByMonth = async (req, res) => {
  try {
    const { customerId, customerUnitId, rentMonth } = req.query;
    if ((!customerId && !customerUnitId) || !rentMonth)
      return res.status(400).json({
        success: false,
        error: 'customerId (or customerUnitId) and rentMonth are required',
      });

    const { rows } = customerUnitId
      ? await query(
          `SELECT p.*, c.customer_name, c.agreement_type
           FROM payments p JOIN customers c ON c.id = p.customer_id
           WHERE p.customer_unit_id = $1 AND p.payment_month = $2
             AND p.deleted_at IS NULL
           ORDER BY p.created_at DESC LIMIT 1`,
          [customerUnitId, rentMonth]
        )
      : await query(
          `SELECT p.*, c.customer_name, c.agreement_type
           FROM payments p JOIN customers c ON c.id = p.customer_id
           WHERE p.customer_id = $1 AND p.payment_month = $2
             AND p.deleted_at IS NULL
           ORDER BY p.created_at DESC LIMIT 1`,
          [customerId, rentMonth]
        );

    if (!rows.length)
      return res.status(404).json({ success: false, error: 'No payment found for this month' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('getPaymentByMonth error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment' });
  }
};

// ─── getSavedAdjustments ──────────────────────────────────────────────────────
const getSavedAdjustments = async (req, res) => {
  try {
    const { customerId, customerUnitId, month, limit = 50, offset = 0 } = req.query;
    const conditions = [
      `p.deleted_at IS NULL`,
      `p.adjustment_amount IS NOT NULL`,
      `p.adjustment_amount <> 0`,
    ];
    const values = []; let idx = 1;

    if (customerUnitId) { conditions.push(`p.customer_unit_id = $${idx++}`); values.push(customerUnitId); }
    else if (customerId) { conditions.push(`p.customer_id = $${idx++}`); values.push(customerId); }
    if (month) { conditions.push(`p.payment_month = $${idx++}`); values.push(month); }

    values.push(limit, offset);
    const { rows } = await query(
      `SELECT
         p.id, p.customer_id, p.customer_unit_id, p.payment_month, p.payment_date,
         p.gross_amount, p.tds_amount, p.net_payout, p.adjustment_amount,
         p.adjusted_net_payout, p.adjustment_note, p.status, p.created_at,
         c.customer_name
       FROM payments p JOIN customers c ON c.id = p.customer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('getSavedAdjustments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch adjustments' });
  }
};

module.exports = {
  calculatePayment,
  getPaymentSchedule,
  getPaymentById,
  createPaymentSchedule,
  generateMonthlyPayments,
  initiatePaymentBatch,
  completePayment,
  getPaymentHistory,
  getPaymentStats,
  resetOrderCreated,
  splitPayoutForPayment,
  parsePayoutSplits,
  savePaymentWithAdjustment,
  getPaymentByMonth,
  getSavedAdjustments,
};