const { query, transaction } = require('../config/database');
const crypto = require('crypto');
const axios  = require('axios');

// ─── Environment ───────────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production';

const EASEBUZZ_KEY  = process.env.EASEBUZZ_KEY  || 'TESTKEY';
const EASEBUZZ_SALT = process.env.EASEBUZZ_SALT || 'TESTSALT';
const EASEBUZZ_ENV  = process.env.EASEBUZZ_ENV  || 'test';

const DEV_RESULT = process.env.EASEBUZZ_DEV_RESULT || 'success';

const EASEBUZZ_INITIATE_URL =
  EASEBUZZ_ENV === 'prod'
    ? 'https://pay.easebuzz.in/payment/initiateLink'
    : 'https://testpay.easebuzz.in/payment/initiateLink';

// ─── Easebuzz hash helpers ─────────────────────────────────────────────────────
const generateInitiateHash = ({ txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) => {
  const str = `${EASEBUZZ_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${EASEBUZZ_SALT}`;
  return crypto.createHash('sha512').update(str).digest('hex');
};
const generateResponseHash = ({ status, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) => {
  const str = `${EASEBUZZ_SALT}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${EASEBUZZ_KEY}`;
  return crypto.createHash('sha512').update(str).digest('hex');
};
const generateTxnId = () =>
  `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

const mockInitiateLink = ({ txnid, amount, productinfo, firstname, email, udf1 }) => {
  if (DEV_RESULT === 'pending')
    return { data: { status: 0, error_desc: '[DEV] Simulated Easebuzz initiation error' } };
  const mockAccessKey = `DEV_ACCESS_${txnid}`;
  console.info(`[EASEBUZZ DEV] Mock initiateLink OK  txnid:${txnid}  amount:₹${amount}`);
  return { data: { status: 1, data: mockAccessKey } };
};

const buildMockEasebuzzResponse = ({ txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) => {
  const status    = DEV_RESULT === 'failure' ? 'failure' : 'success';
  const easepayid = `DEV_PAY_${Date.now()}`;
  const hash = generateResponseHash({ status, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5 });
  return { txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, status, easepayid, hash, payment_mode: 'upi', phone: '9999999999' };
};

// ─── Math helpers ─────────────────────────────────────────────────────────────
const toFloat  = (v, fb = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
const round2   = (v)         => parseFloat(toFloat(v).toFixed(2));
const calculateTDS = (amount) => amount >= 50000 ? Math.round(amount * 0.10) : 0;

const calculateGSTSplit = (netAmount, cgstRate = 9, sgstRate = 9) => {
  const cgst = round2(netAmount * cgstRate / 100);
  const sgst = round2(netAmount * sgstRate / 100);
  return { cgst, sgst, total: round2(cgst + sgst) };
};

// ─── Month helpers ─────────────────────────────────────────────────────────────
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
  try { return new Date(`${monthKey}-01`).toLocaleString('default', { month: 'long', year: 'numeric' }); }
  catch { return monthKey; }
};

// ─── Effective start date ──────────────────────────────────────────────────────
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

// ─── Rent calculation helpers ──────────────────────────────────────────────────
const calcRentForMonth = (monthlyRent, closureDate, rentMonth) => {
  if (!monthlyRent) return { rent: 0, rentType: 'unknown' };
  if (!closureDate) return { rent: round2(monthlyRent), rentType: 'full_month', closureMonthKey: null, daysInClosureMonth: null, daysFromClosure: null, closureDay: null, monthlyRent: round2(monthlyRent), proratedRent: round2(monthlyRent) };
  const yr = closureDate.getFullYear(), moIdx = closureDate.getMonth(), day = closureDate.getDate();
  const days = new Date(yr, moIdx + 1, 0).getDate();
  const key  = `${yr}-${String(moIdx + 1).padStart(2, '0')}`;
  const remainingDays = days - day + 1;
  const pror = round2(monthlyRent * (remainingDays / days));
  if (rentMonth === key)
    return { rent: pror, rentType: 'prorated_closure_month', closureMonthKey: key, daysInClosureMonth: days, daysFromClosure: remainingDays, closureDay: day, monthlyRent: round2(monthlyRent), proratedRent: pror };
  return { rent: round2(monthlyRent), rentType: 'full_month', closureMonthKey: key, daysInClosureMonth: days, daysFromClosure: remainingDays, closureDay: day, monthlyRent: round2(monthlyRent), proratedRent: pror };
};

const calcPartialBaseRent = (amountReceived, entryClosure, totalSale, sqft, rentPerSFT, rentMonth) => {
  const q = toFloat(sqft), r = toFloat(rentPerSFT);
  if (!q || !r) return 0;
  const a = toFloat(amountReceived), s = toFloat(totalSale);
  if (!a || !s) return 0;
  if (!entryClosure) return round2((a / s) * (q * r));
  const closureDate = new Date(entryClosure);
  if (isNaN(closureDate.getTime())) return round2((a / s) * (q * r));
  const totalDays       = new Date(closureDate.getFullYear(), closureDate.getMonth() + 1, 0).getDate();
  const closureMonthKey = `${closureDate.getFullYear()}-${String(closureDate.getMonth() + 1).padStart(2, '0')}`;
  const isClosureMonth  = rentMonth != null && rentMonth !== '' && rentMonth === closureMonthKey;
  const daysCharged     = isClosureMonth ? (totalDays - closureDate.getDate() + 1) : totalDays;
  return round2((a / s) * (q * r) * (daysCharged / totalDays));
};

const calcPartialInstallments = (raw) => {
  const parsed = parseFinancialPartials(raw);
  if (!parsed || parsed.type !== 'installment') return null;
  const list = parsed.entries;
  const tot  = list.reduce((s, i) => s + Number(i.percentage || 0), 0);
  if (Math.abs(tot - 100) > 0.01) throw new Error(`Instalment percentages must sum to 100 (got ${tot})`);
  return list.map((i, idx) => ({
    installment_no: i.installment_no || idx + 1,
    percentage: Number(i.percentage),
    due_day: Number(i.due_day || 1),
    description: i.description || `Instalment ${i.installment_no || idx + 1}`,
  }));
};

const buildInstallmentBreakdown = (installments, grossAmount, tdsExempt) => {
  let rem = round2(grossAmount);
  return installments.map((inst, idx) => {
    const isLast = idx === installments.length - 1;
    const gross  = isLast ? round2(rem) : round2(grossAmount * inst.percentage / 100);
    rem = round2(rem - gross);
    const tds = tdsExempt ? 0 : calculateTDS(gross);
    return { installment_no: inst.installment_no, percentage: inst.percentage, due_day: inst.due_day, description: inst.description, gross_amount: gross, tds_amount: tds, net_payout: round2(gross - tds) };
  });
};

const buildScheduledDate = (monthStr, dueDay) => {
  const [yr, mo] = monthStr.split('-').map(Number);
  const max = new Date(yr, mo, 0).getDate();
  return `${monthStr}-${String(Math.min(Number(dueDay) || 1, max)).padStart(2, '0')}`;
};

// ─── Partial payments parsing ──────────────────────────────────────────────────
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

const filterActiveEntries = (allEntries, rentMonth) =>
  allEntries.filter((e) => {
    const cd = getEntryClosureDate(e);
    if (!cd) return true;
    const mk = toMonthKey(cd);
    return mk !== null && mk <= rentMonth;
  });

// ─── Core gross computation ────────────────────────────────────────────────────
const computeGrossForCustomer = (customer, closureDate, rentMonth) => {
  const rentPerSft  = toFloat(customer.rental_value_per_sft);
  const sqft        = toFloat(customer.sqft);
  const monthlyRent = sqft && rentPerSft ? round2(sqft * rentPerSft) : 0;
  let grossAmount = 0, escalationRate = 0, yearsElapsed = 0, rentDetails = {};

  const safeClosureDate = closureDate && !isNaN(new Date(closureDate).getTime())
    ? (closureDate instanceof Date ? closureDate : new Date(closureDate))
    : null;

  if (customer.agreement_type === 'Construction') {
    if (monthlyRent > 0) {
      const c = calcRentForMonth(monthlyRent, safeClosureDate, rentMonth);
      grossAmount = c.rent; rentDetails = c;
    } else {
      grossAmount = toFloat(customer.financial_rent);
      rentDetails = { rent: grossAmount, rentType: 'financial_record', monthlyRent: grossAmount };
    }
  } else if (customer.agreement_type === '9-Year') {
    if (customer.actual_occupancy_date) {
      const rmDate  = new Date(`${rentMonth}-01`);
      const occDate = new Date(customer.actual_occupancy_date);
      yearsElapsed  = Math.max(0, Math.floor((rmDate - occDate) / (1000 * 60 * 60 * 24 * 365.25)));
    }
    if (monthlyRent > 0) {
      const c = calcRentForMonth(monthlyRent, safeClosureDate, rentMonth);
      grossAmount = c.rent; rentDetails = c;
    } else {
      grossAmount = toFloat(customer.financial_rent);
      rentDetails = { rent: grossAmount, rentType: 'financial_record', monthlyRent: grossAmount };
    }
    if (String(customer.floor_no) === '7') {
      escalationRate = yearsElapsed < 3 ? 0 : yearsElapsed < 6 ? 15 : 32.25;
      grossAmount    = round2(grossAmount * (1 + escalationRate / 100));
    }
  }
  return { grossAmount, escalationRate, yearsElapsed, rentDetails, monthlyRent };
};

const getGstConfig = (cust) => {
  const gstNo    = cust.gst_no || null;
  const hasGst   = !!gstNo;
  const cgstRate = hasGst ? (toFloat(cust.cgst) || 9) : 0;
  const sgstRate = hasGst ? (toFloat(cust.sgst) || 9) : 0;
  return { hasGst, gstNo, cgstRate, sgstRate, totalGstRate: cgstRate + sgstRate };
};

const isTdsExempt = (cust) => cust.tds_applicable === 'N';

const computeGstForPayment = (netPayout, cust) => {
  const gstNo    = cust.gst_no || null;
  const hasGst   = !!gstNo;
  const cgstRate = hasGst ? (toFloat(cust.cgst) || 9) : 0;
  const sgstRate = hasGst ? (toFloat(cust.sgst) || 9) : 0;
  if (!hasGst)
    return { has_gst: false, gst_no: null, cgst_rate: 0, sgst_rate: 0, cgst_amount: 0, sgst_amount: 0, total_gst_amount: 0, net_transfer: round2(netPayout) };
  const { cgst: cgstAmount, sgst: sgstAmount, total: totalGstAmount } = calculateGSTSplit(netPayout, cgstRate, sgstRate);
  return { has_gst: true, gst_no: gstNo, cgst_rate: cgstRate, sgst_rate: sgstRate, cgst_amount: cgstAmount, sgst_amount: sgstAmount, total_gst_amount: totalGstAmount, net_transfer: round2(netPayout + totalGstAmount) };
};

// ─── NEW: Payout split computation ────────────────────────────────────────────
/**
 * Given the net payout for a payment and the customer's payout_splits array,
 * returns an array of per-account disbursement objects with exact rupee amounts.
 *
 * The last entry absorbs rounding so the total always equals netPayout.
 *
 * @param {number}   netPayout   - the amount to distribute (after TDS, before GST)
 * @param {object[]} splits      - array of { bankAccountNumber, ifscCode, bankName,
 *                                            accountHolderName, percentage }
 * @returns {object[]}
 */
const splitPayoutForPayment = (netPayout, splits) => {
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (splits.length === 1) {
    return [{
      ...splits[0],
      amount:     round2(netPayout),
      percentage: splits[0].percentage,
    }];
  }

  let remaining = round2(netPayout);
  return splits.map((sp, i) => {
    const isLast = i === splits.length - 1;
    const amount = isLast
      ? round2(remaining)
      : round2(netPayout * sp.percentage / 100);
    remaining = round2(remaining - amount);
    return { ...sp, amount };
  });
};

/**
 * Parse payout_splits stored as JSONB (may be string or already an object).
 */
const parsePayoutSplits = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
};

// ─── enrichPayment — attaches customer fields + GST + split breakdown ─────────
const enrichPayment = (p, cust) => {
  const netPayout   = toFloat(p.net_payout);
  const gst         = computeGstForPayment(netPayout, cust);
  const splits      = parsePayoutSplits(cust.payout_splits);
  const payoutBreakdown = splits && splits.length > 0
    ? splitPayoutForPayment(netPayout, splits)
    : null;

  return {
    ...p,
    customer_name:    cust.customer_name,
    customer_code:    cust.customer_id,
    unit_no:          cust.unit_no,
    floor_no:         cust.floor_no,
    property_name:    cust.property_name,
    payout_splits:    splits,
    payout_breakdown: payoutBreakdown,   // per-account amounts for this payment
    ...gst,
  };
};

// ─── FR JOIN helper ────────────────────────────────────────────────────────────
const FR_JOIN = `
  FROM customers c
  LEFT JOIN (
    SELECT DISTINCT ON (customer_id)
      customer_id, rent, tds_applicable, rental_value_per_sft,
      total_sale_consideration, payment_closure_date, payment_mode, partial_payments
    FROM financial_records
    WHERE deleted_at IS NULL
    ORDER BY customer_id, created_at DESC
  ) fr ON c.id = fr.customer_id
`;

// ─── INSERT helper (used by both generateMonthlyPayments and createPaymentSchedule) ──
const insertPayment = async (client, params) => {
  const {
    customerId, paymentDate, rentMonth, grossAmount, tdsAmount, netPayout,
    period, baseRent, escalationRate, yearsElapsed, scheduledDate,
    userId, installmentNo, totalInstallments, installmentPct,
    payoutSplitsJson,
  } = params;

  const { rows: [p] } = await client.query(
    `INSERT INTO payments (
       customer_id, payment_date, payment_month, gross_amount, tds_amount,
       net_payout, payment_period, base_rent, escalation_rate, years_elapsed,
       scheduled_date, status, created_by,
       installment_no, total_installments, installment_percentage,
       payout_splits
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pending',$12,$13,$14,$15,$16::jsonb)
     RETURNING *`,
    [
      customerId, paymentDate, rentMonth, grossAmount, tdsAmount,
      netPayout, period, baseRent, escalationRate, yearsElapsed,
      scheduledDate, userId,
      installmentNo        || null,
      totalInstallments    || null,
      installmentPct       || null,
      payoutSplitsJson     || null,
    ]
  );
  return p;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  calculatePayment  (unchanged in logic; payout split added to response)
// ═══════════════════════════════════════════════════════════════════════════════
const calculatePayment = async (req, res) => {
  try {
    const { customerId, paymentDate } = req.body;
    if (!customerId || !paymentDate)
      return res.status(400).json({ success: false, error: 'customerId and paymentDate are required' });

    const { rows } = await query(
      `SELECT c.*, fr.rent AS financial_rent, fr.tds_applicable, fr.rental_value_per_sft,
         fr.total_sale_consideration, fr.payment_closure_date, fr.payment_mode, fr.partial_payments
       ${FR_JOIN}
       WHERE c.id = $1 AND c.deleted_at IS NULL AND c.status = 'Active'`,
      [customerId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Customer not found or inactive' });
    const cust = rows[0];

    if (!cust.rental_value_per_sft && !cust.financial_rent)
      return res.status(400).json({ success: false, error: 'No financial record found.' });
    if (!['Construction', '9-Year'].includes(cust.agreement_type))
      return res.status(400).json({ success: false, error: 'Invalid agreement type.' });
    if (cust.agreement_type === '9-Year' && !cust.actual_occupancy_date)
      return res.status(400).json({ success: false, error: 'Actual occupancy date required for 9-Year agreement.' });

    const initDate    = new Date(paymentDate);
    const rentMonth   = getRentMonth(initDate);
    const pmStr       = `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, '0')}`;
    const totalSale   = toFloat(cust.total_sale_consideration);
    const sqft        = toFloat(cust.sqft);
    const rentPerSft  = toFloat(cust.rental_value_per_sft);
    const paymentMode = cust.payment_mode || 'full';
    const tdsExempt   = isTdsExempt(cust);
    const gst         = getGstConfig(cust);
    const splits      = parsePayoutSplits(cust.payout_splits);

    const { rows: existingPayments } = await query(
      `SELECT id, status FROM payments
       WHERE customer_id = $1 AND payment_month = $2
         AND status IN ('Completed','Processing','Order_Created')
         AND deleted_at IS NULL`,
      [customerId, rentMonth]
    );
    if (existingPayments.length)
      return res.status(400).json({
        success: false,
        error: `Payment for ${cust.customer_name} for ${toMonthLabel(rentMonth)} has already been initiated or completed.`,
        code: 'PAYMENT_ALREADY_EXISTS', rentMonth, customerName: cust.customer_name,
      });

    const effectiveStartDate = getEffectiveStartDate(cust);
    const startMonthKey      = toMonthKey(effectiveStartDate);
    if (startMonthKey && rentMonth < startMonthKey)
      return res.status(400).json({
        success: false,
        error: `Payment for ${cust.customer_name} has not started yet. Rent payments begin from ${toMonthLabel(startMonthKey)}.`,
        code: 'PAYMENT_NOT_STARTED', startMonth: startMonthKey,
        startMonthLabel: toMonthLabel(startMonthKey),
        customerName: cust.customer_name, rentMonth,
      });

    const { rows: [pr] } = await query(
      `SELECT COALESCE(SUM(gross_amount), 0) AS total_paid FROM payments
       WHERE customer_id = $1 AND deleted_at IS NULL AND status <> 'Cancelled'`,
      [customerId]
    );
    const totalAlreadyPaid = toFloat(pr.total_paid);
    const remainingBalance = Math.max(0, totalSale - totalAlreadyPaid);

    const buildGstDetails = (netAmount) => {
      if (!gst.hasGst) return { cgstAmount: 0, sgstAmount: 0, totalGstAmount: 0, totalInvoice: round2(netAmount), ...gst };
      const { cgst: cgstAmount, sgst: sgstAmount, total: totalGstAmount } = calculateGSTSplit(netAmount, gst.cgstRate, gst.sgstRate);
      return { cgstAmount, sgstAmount, totalGstAmount, totalInvoice: round2(netAmount + totalGstAmount), ...gst };
    };
    const buildNetTransfer = (netPayout, gd) => round2(netPayout + gd.totalGstAmount);

    const ok = (extra) => {
      const netPayout = extra.netPayout || 0;
      const gd = buildGstDetails(netPayout);
      const payoutBreakdown = splits && splits.length > 0
        ? splitPayoutForPayment(netPayout, splits)
        : null;
      return res.json({
        success: true,
        data: {
          customerId: cust.id, customerName: cust.customer_name,
          unitNo: cust.unit_no, floorNo: cust.floor_no,
          agreementType: cust.agreement_type, tdsApplicable: cust.tds_applicable,
          tdsExempt, tdsAutoMode: !tdsExempt,
          actualOccupancyDate: cust.actual_occupancy_date,
          paymentClosureDate: cust.payment_closure_date || null,
          paymentDate, rentMonth, paymentMonth: rentMonth,
          installmentBreakdown: null,
          payoutSplits: splits,
          payoutBreakdown,          // ← per-account breakdown
          ...extra, ...gd, netBankTransfer: buildNetTransfer(netPayout, gd),
        },
      });
    };

    // ── Full payment path ──────────────────────────────────────────────────
    const closureDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
    const { grossAmount, escalationRate, yearsElapsed, rentDetails, monthlyRent } = computeGrossForCustomer(cust, closureDate, rentMonth);
    const tdsAmount = tdsExempt ? 0 : calculateTDS(grossAmount);
    const netPayout = round2(grossAmount - tdsAmount);
    const gd = buildGstDetails(netPayout);
    return ok({
      paymentMode: 'full', grossAmount: round2(grossAmount), tdsAmount,
      tdsApplied: tdsAmount > 0, tdsThreshold: 50000, netPayout, baseRent: round2(grossAmount),
      tdsRate: tdsAmount > 0 ? 10 : 0, escalationRate, yearsElapsed: round2(yearsElapsed),
      rentCalculationDetails: {
        totalSaleConsideration: totalSale, totalAlreadyPaid, remainingBalance,
        sqft, rentalValuePerSft: rentPerSft, monthlyRent, ...rentDetails,
        note: rentDetails.rentType === 'prorated_closure_month'
          ? `Prorated rent ${rentDetails.daysFromClosure}/${rentDetails.daysInClosureMonth} days`
          : `Full rent for ${rentMonth}`,
      },
      ...gd, netBankTransfer: buildNetTransfer(netPayout, gd),
    });

  } catch (err) {
    console.error('calculatePayment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to calculate payment' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  generateMonthlyPayments  — now stores payout_splits on each payment
// ═══════════════════════════════════════════════════════════════════════════════
const generateMonthlyPayments = async (req, res) => {
  try {
    const { month, agreementType } = req.body;
    const userId = req.user.id;

    if (!month) return res.status(400).json({ success: false, error: 'month required (YYYY-MM)' });
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });

    const [yr, mo] = month.split('-').map(Number);
    const rmDate    = new Date(yr, mo - 2, 1);
    const rentMonth = `${rmDate.getFullYear()}-${String(rmDate.getMonth() + 1).padStart(2, '0')}`;
    const scheduled0 = `${month}-01`;
    const payments = [], skipped = [], duplicates = [];

    await transaction(async (client) => {
      let cq = `SELECT c.*, fr.rent AS financial_rent, fr.tds_applicable, fr.rental_value_per_sft, fr.total_sale_consideration, fr.payment_closure_date, fr.payment_mode, fr.partial_payments ${FR_JOIN} WHERE c.deleted_at IS NULL AND c.status = 'Active'`;
      const cp = [];
      if (agreementType) { cq += ` AND c.agreement_type = $1`; cp.push(agreementType); }
      cq += ` ORDER BY c.customer_name ASC`;
      const { rows: customers } = await client.query(cq, cp);
      if (!customers.length) throw new Error('No active customers found');

      for (const cust of customers) {
        const skip = (r) => skipped.push({ customerId: cust.id, customerName: cust.customer_name, reason: r });
        const tdsExemptC = isTdsExempt(cust);
        const splitsJson = cust.payout_splits
          ? (typeof cust.payout_splits === 'string' ? cust.payout_splits : JSON.stringify(cust.payout_splits))
          : null;

        if (!cust.rental_value_per_sft && !cust.financial_rent) { skip('No financial record'); continue; }
        if (!['Construction', '9-Year'].includes(cust.agreement_type)) { skip(`Invalid agreement type: ${cust.agreement_type}`); continue; }
        if (cust.agreement_type === '9-Year' && !cust.actual_occupancy_date) { skip('Missing occupancy date'); continue; }

        const startMonthKey = toMonthKey(getEffectiveStartDate(cust));
        if (startMonthKey && rentMonth < startMonthKey) {
          skip(`${cust.customer_name}: payment starts ${toMonthLabel(startMonthKey)} — skipping ${toMonthLabel(rentMonth)}`);
          continue;
        }

        const { rows: dup } = await client.query(
          `SELECT id FROM payments WHERE customer_id = $1 AND payment_month = $2 AND status <> 'Cancelled' AND deleted_at IS NULL`,
          [cust.id, rentMonth]
        );
        if (dup.length) {
          duplicates.push({ customerId: cust.id, customerName: cust.customer_name, reason: `Payment already exists for ${toMonthLabel(rentMonth)}` });
          continue;
        }

        const period  = cust.agreement_type;
        const payMode = cust.payment_mode || 'full';

        if (payMode === 'partial') {
          const parsed = parseFinancialPartials(cust.partial_payments);

          if (parsed?.type === 'financial') {
            const allEntries = parsed.entries;
            const totalSaleC = toFloat(cust.total_sale_consideration);
            const sqftC      = toFloat(cust.sqft);
            const rpsftC     = toFloat(cust.rental_value_per_sft);
            const entries    = filterActiveEntries(allEntries, rentMonth);
            if (!entries.length) { skip('No active partial tranches for this rent month'); continue; }

            let cdfg = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
            if (!cdfg) {
              for (const e of allEntries) {
                const src = getEntryClosureDate(e);
                if (src) { cdfg = new Date(src); break; }
              }
            }
            const { escalationRate, yearsElapsed } = computeGrossForCustomer(cust, cdfg, rentMonth);
            const entryData = entries.map((e) => {
              const bank     = toFloat(e.bankAmount ?? e.bank_amount);
              const tdsRcvd  = toFloat(e.tdsAmount  ?? e.tds_amount);
              const amtRcvd  = bank + tdsRcvd;
              const closureS = getEntryClosureDate(e) ?? '';
              const dateStr  = e.date ?? scheduled0;
              const baseRent = calcPartialBaseRent(amtRcvd, closureS, totalSaleC, sqftC, rpsftC, rentMonth);
              const entryGross = round2(baseRent + (escalationRate > 0 ? round2(baseRent * escalationRate / 100) : 0));
              return { closureS, dateStr, baseRent, entryGross };
            });
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
                scheduledDate: closureS || dateStr, userId,
                installmentNo: idx + 1, totalInstallments: entries.length,
                installmentPct: null, payoutSplitsJson: splitsJson,
              });
              payments.push(enrichPayment(p, cust));
            }
            continue;
          }

          if (parsed?.type === 'installment') {
            const refDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : new Date(scheduled0);
            const { grossAmount, escalationRate, yearsElapsed } = computeGrossForCustomer(cust, refDate, rentMonth);
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
                  scheduledDate: instDate, userId,
                  installmentNo: inst.installment_no, totalInstallments: bd.length,
                  installmentPct: inst.percentage, payoutSplitsJson: splitsJson,
                });
                payments.push(enrichPayment(p, cust));
              }
              continue;
            }
          }
        }

        // ── Full payment ───────────────────────────────────────────────────
        const refDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
        const { grossAmount, escalationRate, yearsElapsed } = computeGrossForCustomer(cust, refDate, rentMonth);
        const tds = tdsExemptC ? 0 : calculateTDS(grossAmount);
        const net = round2(grossAmount - tds);
        const p = await insertPayment(client, {
          customerId: cust.id, paymentDate: scheduled0, rentMonth,
          grossAmount, tdsAmount: tds, netPayout: net,
          period, baseRent: grossAmount, escalationRate, yearsElapsed,
          scheduledDate: scheduled0, userId,
          installmentNo: null, totalInstallments: null,
          installmentPct: null, payoutSplitsJson: splitsJson,
        });
        payments.push(enrichPayment(p, cust));
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'MONTHLY_PAYMENTS_GENERATED','PAYMENT',NULL,$2,$3,$4,'SUCCESS')`,
        [userId, JSON.stringify({ initiationMonth: month, rentMonth, generated: payments.length, skipped: skipped.length, duplicates: duplicates.length, agreementType: agreementType || 'All' }), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
      );
    });

    res.status(201).json({
      success: true,
      message: `Generated ${payments.length} payment(s) for rent month: ${toMonthLabel(rentMonth)}`,
      data: {
        initiationMonth: month, rentMonth, rentMonthDisplay: toMonthLabel(rentMonth),
        initiationMonthDisplay: toMonthLabel(month),
        paymentsGenerated: payments.length, skippedCount: skipped.length,
        duplicateCount: duplicates.length, payments, skipped, duplicates,
      },
    });
  } catch (err) {
    console.error('generateMonthlyPayments error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate monthly payments' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  createPaymentSchedule  — now stores payout_splits on each payment
// ═══════════════════════════════════════════════════════════════════════════════
const createPaymentSchedule = async (req, res) => {
  try {
    const { customerIds, scheduledDate } = req.body;
    const userId = req.user.id;
    if (!customerIds?.length) return res.status(400).json({ success: false, error: 'No customers selected' });
    if (!scheduledDate) return res.status(400).json({ success: false, error: 'scheduledDate required' });

    const initDate  = new Date(scheduledDate);
    const rentMonth = getRentMonth(initDate);
    const pmStr     = `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, '0')}`;
    const payments  = [], skipped = [];

    await transaction(async (client) => {
      for (const customerId of customerIds) {
        const { rows } = await client.query(
          `SELECT c.*, fr.rent AS financial_rent, fr.tds_applicable, fr.rental_value_per_sft,
                  fr.total_sale_consideration, fr.payment_closure_date, fr.payment_mode, fr.partial_payments
           ${FR_JOIN} WHERE c.id = $1 AND c.deleted_at IS NULL AND c.status = 'Active'`,
          [customerId]
        );
        const skip = (r) => skipped.push({ customerId, customerName: rows[0]?.customer_name, reason: r });
        if (!rows.length) { skip('Not found or inactive'); continue; }
        const cust = rows[0];
        const tdsExemptC = isTdsExempt(cust);
        const splitsJson = cust.payout_splits
          ? (typeof cust.payout_splits === 'string' ? cust.payout_splits : JSON.stringify(cust.payout_splits))
          : null;

        if (!cust.rental_value_per_sft && !cust.financial_rent) { skip('No financial record'); continue; }
        if (!['Construction', '9-Year'].includes(cust.agreement_type)) { skip('Invalid agreement type'); continue; }
        if (cust.agreement_type === '9-Year' && !cust.actual_occupancy_date) { skip('Missing occupancy date'); continue; }

        const startMonthKey = toMonthKey(getEffectiveStartDate(cust));
        if (startMonthKey && rentMonth < startMonthKey) { skip(`${cust.customer_name}: payment starts ${toMonthLabel(startMonthKey)}`); continue; }

        const { rows: dup } = await client.query(
          `SELECT id FROM payments WHERE customer_id = $1 AND payment_month = $2 AND status <> 'Cancelled' AND deleted_at IS NULL`,
          [customerId, rentMonth]
        );
        if (dup.length) { skip(`Payment already exists for ${toMonthLabel(rentMonth)}`); continue; }

        const period = cust.agreement_type, payMode = cust.payment_mode || 'full';

        if (payMode === 'partial') {
          const parsed = parseFinancialPartials(cust.partial_payments);
          if (parsed?.type === 'financial') {
            const allEntries = parsed.entries;
            const totalSaleC = toFloat(cust.total_sale_consideration);
            const sqftC = toFloat(cust.sqft), rpsftC = toFloat(cust.rental_value_per_sft);
            const entries = filterActiveEntries(allEntries, rentMonth);
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
              const bank = toFloat(e.bankAmount ?? e.bank_amount), tdsRcvd = toFloat(e.tdsAmount ?? e.tds_amount), amtRcvd = bank + tdsRcvd;
              const closureS   = getEntryClosureDate(e) ?? '';
              const baseRent   = calcPartialBaseRent(amtRcvd, closureS, totalSaleC, sqftC, rpsftC, rentMonth);
              const entryGross = round2(baseRent + (escalationRate > 0 ? round2(baseRent * escalationRate / 100) : 0));
              return { closureS, dateStr: e.date ?? scheduledDate, baseRent, entryGross };
            });
            const combinedTds = tdsExemptC ? 0 : calculateTDS(round2(entryData.reduce((s, d) => s + d.entryGross, 0)));
            for (let idx = 0; idx < entryData.length; idx++) {
              const { closureS, dateStr, entryGross, baseRent } = entryData[idx];
              const rowTds = idx === 0 ? combinedTds : 0, rowNet = round2(entryGross - rowTds);
              const p = await insertPayment(client, {
                customerId, paymentDate: dateStr, rentMonth,
                grossAmount: entryGross, tdsAmount: rowTds, netPayout: rowNet,
                period, baseRent, escalationRate, yearsElapsed,
                scheduledDate: closureS || dateStr, userId,
                installmentNo: idx + 1, totalInstallments: entries.length,
                installmentPct: null, payoutSplitsJson: splitsJson,
              });
              payments.push(enrichPayment(p, cust));
            }
            continue;
          }
          if (parsed?.type === 'installment') {
            const refDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : initDate;
            const { grossAmount, escalationRate, yearsElapsed } = computeGrossForCustomer(cust, refDate, rentMonth);
            let defs;
            try { defs = calcPartialInstallments(cust.partial_payments); }
            catch (e) { skip(e.message); continue; }
            if (defs) {
              const bd = buildInstallmentBreakdown(defs, grossAmount, tdsExemptC);
              for (const inst of bd) {
                const instDate = buildScheduledDate(pmStr, inst.due_day);
                const p = await insertPayment(client, {
                  customerId, paymentDate: instDate, rentMonth,
                  grossAmount: inst.gross_amount, tdsAmount: inst.tds_amount, netPayout: inst.net_payout,
                  period, baseRent: grossAmount, escalationRate, yearsElapsed,
                  scheduledDate: instDate, userId,
                  installmentNo: inst.installment_no, totalInstallments: bd.length,
                  installmentPct: inst.percentage, payoutSplitsJson: splitsJson,
                });
                payments.push(enrichPayment(p, cust));
              }
              continue;
            }
          }
        }

        const refDate = cust.payment_closure_date ? new Date(cust.payment_closure_date) : null;
        const { grossAmount, escalationRate, yearsElapsed } = computeGrossForCustomer(cust, refDate, rentMonth);
        const tds = tdsExemptC ? 0 : calculateTDS(grossAmount), net = round2(grossAmount - tds);
        const p = await insertPayment(client, {
          customerId, paymentDate: scheduledDate, rentMonth,
          grossAmount, tdsAmount: tds, netPayout: net,
          period, baseRent: grossAmount, escalationRate, yearsElapsed,
          scheduledDate, userId,
          installmentNo: null, totalInstallments: null,
          installmentPct: null, payoutSplitsJson: splitsJson,
        });
        payments.push(enrichPayment(p, cust));
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'PAYMENT_SCHEDULE_CREATED','PAYMENT',NULL,$2,$3,$4,'SUCCESS')`,
        [userId, JSON.stringify({ scheduled: payments.length, skipped: skipped.length, rentMonth, scheduledDate }),
         req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
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

// ─── Remaining controllers (unchanged logic) ───────────────────────────────────

const getPaymentSchedule = async (req, res) => {
  try {
    const { month, status, agreementType } = req.query;
    const params = []; let pi = 1;
    let sql = `
      SELECT p.*, c.customer_name, c.customer_id AS customer_code,
             c.unit_no, c.floor_no, c.property_name, c.email, c.phone,
             c.pan_number, c.agreement_type, c.gst_no, c.cgst, c.sgst,
             c.bank_account_number, c.bank_name, c.ifsc_code,
             c.payout_splits AS customer_payout_splits,
             fr.rent AS financial_rent, fr.tds_applicable, fr.rental_value_per_sft,
             fr.total_sale_consideration, fr.payment_closure_date, fr.payment_mode
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN (
        SELECT DISTINCT ON (customer_id) customer_id, rent, tds_applicable,
               rental_value_per_sft, total_sale_consideration, payment_closure_date, payment_mode
        FROM financial_records WHERE deleted_at IS NULL ORDER BY customer_id, created_at DESC
      ) fr ON c.id = fr.customer_id
      WHERE p.deleted_at IS NULL
    `;
    if (month)         { sql += ` AND p.payment_month = $${pi}`;  params.push(month);         pi++; }
    if (status)        { sql += ` AND p.status = $${pi}`;         params.push(status);        pi++; }
    if (agreementType) { sql += ` AND c.agreement_type = $${pi}`; params.push(agreementType); pi++; }
    sql += ` ORDER BY c.customer_name ASC, p.installment_no ASC NULLS LAST, p.created_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getPaymentSchedule error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payment schedule' });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT p.*, c.customer_name, c.customer_id AS customer_code, c.unit_no, c.floor_no,
              c.property_name, c.email, c.phone, c.pan_number, c.agreement_type,
              c.bank_account_number, c.bank_name, c.ifsc_code, c.gst_no, c.cgst, c.sgst,
              c.payout_splits AS customer_payout_splits,
              fr.rent AS financial_rent, fr.tds_applicable, fr.rental_value_per_sft,
              fr.total_sale_consideration, fr.payment_closure_date, fr.payment_mode
       FROM payments p
       JOIN customers c ON p.customer_id = c.id
       LEFT JOIN (
         SELECT DISTINCT ON (customer_id) customer_id, rent, tds_applicable,
                rental_value_per_sft, total_sale_consideration, payment_closure_date, payment_mode
         FROM financial_records WHERE deleted_at IS NULL ORDER BY customer_id, created_at DESC
       ) fr ON c.id = fr.customer_id
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

const resetOrderCreated = async (req, res) => {
  try {
    const { paymentIds } = req.body;
    if (!paymentIds?.length) return res.status(400).json({ success: false, error: 'paymentIds required' });
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

const createEasebuzzOrder = async (req, res) => {
  try {
    const { paymentIds } = req.body;
    if (!paymentIds?.length)
      return res.status(400).json({ success: false, error: 'No payment IDs provided' });

    const { rows: pmts } = await query(
      `SELECT p.*, c.customer_name, c.customer_id AS customer_code,
              c.unit_no, c.floor_no, c.email, c.phone,
              c.gst_no, c.cgst, c.sgst, c.payout_splits AS customer_payout_splits
       FROM payments p JOIN customers c ON p.customer_id = c.id
       WHERE p.id = ANY($1) AND p.status = 'Pending' AND p.deleted_at IS NULL
       ORDER BY c.customer_name ASC, p.installment_no ASC NULLS LAST`,
      [paymentIds]
    );
    if (!pmts.length)
      return res.status(400).json({ success: false, error: 'No valid pending payments found' });

    const paymentBreakdown = pmts.map((p) => {
      const netPayout = toFloat(p.net_payout);
      const hasGst    = !!p.gst_no;
      const cgstRate  = hasGst ? (toFloat(p.cgst) || 9) : 0;
      const sgstRate  = hasGst ? (toFloat(p.sgst) || 9) : 0;
      const cgstAmt   = hasGst ? round2(netPayout * cgstRate / 100) : 0;
      const sgstAmt   = hasGst ? round2(netPayout * sgstRate / 100) : 0;
      const totalGst  = round2(cgstAmt + sgstAmt);
      const chargeAmt = round2(netPayout + totalGst);
      const splits    = parsePayoutSplits(p.payout_splits || p.customer_payout_splits);
      return { ...p, netPayout, hasGst, cgstRate, sgstRate, cgstAmt, sgstAmt, totalGst, chargeAmt, splits };
    });

    const totalNet    = round2(paymentBreakdown.reduce((s, p) => s + p.netPayout, 0));
    const totalGstAll = round2(paymentBreakdown.reduce((s, p) => s + p.totalGst,  0));
    const totalCharge = round2(totalNet + totalGstAll);
    const chargeRounded = Math.round(totalCharge);
    if (chargeRounded < 1)
      return res.status(400).json({ success: false, error: 'Amount too low (minimum ₹1)' });

    const customerMap = new Map();
    for (const p of paymentBreakdown) {
      const cid = p.customer_id;
      if (!customerMap.has(cid)) {
        customerMap.set(cid, {
          customer_id: cid, customer_name: p.customer_name,
          customer_code: p.customer_code, unit_no: p.unit_no, floor_no: p.floor_no,
          email: p.email, phone: p.phone, gst_no: p.gst_no || null,
          payout_splits: p.splits || null,
          payments: [], net_payout: 0, total_gst: 0, charge_amount: 0,
        });
      }
      const c = customerMap.get(cid);
      c.payments.push({
        payment_id: p.id, installment_no: p.installment_no, total_installments: p.total_installments,
        payment_month: p.payment_month, gross_amount: toFloat(p.gross_amount),
        tds_amount: toFloat(p.tds_amount), net_payout: p.netPayout,
        has_gst: p.hasGst, cgst_rate: p.cgstRate, sgst_rate: p.sgstRate,
        cgst_amount: p.cgstAmt, sgst_amount: p.sgstAmt, total_gst: p.totalGst,
        charge_amount: p.chargeAmt,
        // Per-account disbursement for this payment
        payout_breakdown: p.splits ? splitPayoutForPayment(p.netPayout, p.splits) : null,
      });
      c.net_payout    = round2(c.net_payout    + p.netPayout);
      c.total_gst     = round2(c.total_gst     + p.totalGst);
      c.charge_amount = round2(c.charge_amount + p.chargeAmt);
    }
    const customers      = Array.from(customerMap.values());
    const customerCount  = customers.length;
    const isMultiCustomer = customerCount > 1;

    const txnid       = generateTxnId();
    const amount      = chargeRounded.toFixed(2);
    const rentMonths  = [...new Set(pmts.map((p) => p.payment_month))].sort();
    const monthLabel  = rentMonths.length === 1
      ? rentMonths[0]
      : `${rentMonths[0]}_to_${rentMonths[rentMonths.length - 1]}`;
    const productinfo = isMultiCustomer
      ? `RentBatch_${customerCount}Cust_${monthLabel}`
      : `Rent_${customers[0].customer_code}_${monthLabel}`;
    const firstname = isMultiCustomer
      ? (process.env.EASEBUZZ_ADMIN_NAME  || 'RentAdmin')
      : (customers[0].customer_name?.split(' ')[0] || 'Customer');
    const email = isMultiCustomer
      ? (process.env.EASEBUZZ_ADMIN_EMAIL || `rentadmin+${txnid}@yourdomain.com`)
      : (customers[0].email || `noreply+${txnid}@yourdomain.com`);
    const phone = isMultiCustomer
      ? (process.env.EASEBUZZ_ADMIN_PHONE || '9999999999')
      : (customers[0].phone || '9999999999');
    const udf1 = paymentIds.join(','), udf2 = String(customerCount);

    const ebPayload = new URLSearchParams({
      key: EASEBUZZ_KEY, txnid, amount, productinfo, firstname, email, phone, udf1, udf2,
      hash: generateInitiateHash({ txnid, amount, productinfo, firstname, email, udf1, udf2 }),
      surl: process.env.EASEBUZZ_SUCCESS_URL || `${process.env.APP_URL}/payments/easebuzz/success`,
      furl: process.env.EASEBUZZ_FAILURE_URL || `${process.env.APP_URL}/payments/easebuzz/failure`,
    });

    let ebRes;
    if (IS_DEV) {
      ebRes = mockInitiateLink({ txnid, amount, productinfo, firstname, email, udf1 });
    } else {
      try {
        ebRes = await axios.post(EASEBUZZ_INITIATE_URL, ebPayload.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000,
        });
      } catch (axiosErr) {
        console.error('Easebuzz initiateLink error:', axiosErr.message);
        return res.status(502).json({ success: false, error: 'Could not connect to Easebuzz. Try again.' });
      }
    }

    if (ebRes.data?.status !== 1)
      return res.status(400).json({ success: false, error: ebRes.data?.error_desc || 'Easebuzz initiation failed' });

    const accessKey = ebRes.data.data;
    await query(
      `UPDATE payments SET status = 'Order_Created', razorpay_order_id = $1, order_created_at = NOW()
       WHERE id = ANY($2) AND deleted_at IS NULL`,
      [txnid, paymentIds]
    );

    const responseData = {
      accessKey, txnid,
      amount: chargeRounded, amountDisplay: chargeRounded,
      totalNetPayout: totalNet, totalGstAmount: totalGstAll, totalCharge: chargeRounded,
      hasGst: totalGstAll > 0, env: EASEBUZZ_ENV, key: EASEBUZZ_KEY,
      paymentCount: pmts.length, customerCount, isMultiCustomer, rentMonths,
      customers,
    };

    if (IS_DEV) {
      responseData._dev = {
        note: 'DEV MODE',
        result: DEV_RESULT,
        devResponse: buildMockEasebuzzResponse({ txnid, amount, productinfo, firstname, email, udf1, udf2 }),
      };
    }

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('createEasebuzzOrder error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create Easebuzz order' });
  }
};

const verifyEasebuzzPayment = async (req, res) => {
  try {
    const { paymentIds, easebuzzResponse } = req.body;
    const userId = req.user.id;
    if (!paymentIds?.length || !easebuzzResponse)
      return res.status(400).json({ success: false, error: 'paymentIds and easebuzzResponse are required' });

    const {
      txnid, amount, productinfo, firstname, email,
      udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '',
      status: ebStatus, easepayid, hash: receivedHash, payment_mode, phone,
    } = easebuzzResponse;

    const expectedHash = generateResponseHash({ status: ebStatus, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5 });
    if (expectedHash !== receivedHash)
      return res.status(400).json({ success: false, error: 'Invalid payment signature — hash mismatch' });
    if (ebStatus !== 'success')
      return res.status(400).json({ success: false, error: `Payment not successful — status: ${ebStatus}` });

    let batch;
    await transaction(async (client) => {
      const { rows: pmts } = await client.query(
        `SELECT p.*, c.customer_name, c.customer_id AS customer_code, c.gst_no, c.cgst, c.sgst
         FROM payments p JOIN customers c ON p.customer_id = c.id
         WHERE p.id = ANY($1) AND p.status IN ('Pending','Order_Created') AND p.deleted_at IS NULL`,
        [paymentIds]
      );
      if (!pmts.length) throw new Error('No valid payments found (may already be processed)');

      const tGross = round2(pmts.reduce((s, p) => s + toFloat(p.gross_amount), 0));
      const tTds   = round2(pmts.reduce((s, p) => s + toFloat(p.tds_amount),   0));
      const tNet   = round2(pmts.reduce((s, p) => s + toFloat(p.net_payout),   0));
      const tGstAll = round2(pmts.reduce((p_acc, p) => {
        if (!p.gst_no) return p_acc;
        const net = toFloat(p.net_payout), cr = toFloat(p.cgst) || 9, sr = toFloat(p.sgst) || 9;
        return round2(p_acc + round2(net * cr / 100) + round2(net * sr / 100));
      }, 0));
      const tCharge      = round2(tNet + tGstAll);
      const tChargePaise = Math.round(tCharge * 100);
      const uniqueCustomers = [...new Map(pmts.map((p) => [p.customer_id, { id: p.customer_id, name: p.customer_name, code: p.customer_code }])).values()];

      const { rows: [b] } = await client.query(
        `INSERT INTO payment_batches
           (batch_date, total_payments, total_gross_amount, total_tds_amount, total_net_payout,
            status, created_by, submitted_by, submitted_date,
            razorpay_order_id, razorpay_payment_id, razorpay_amount, completed_by, completed_at)
         VALUES ($1,$2,$3,$4,$5,'Completed',$6,$7,NOW(),$8,$9,$10,$11,NOW()) RETURNING *`,
        [new Date(), pmts.length, tGross, tTds, tNet, userId, userId, txnid, easepayid, tChargePaise, userId]
      );
      batch = b;

      for (let i = 0; i < pmts.length; i++) {
        const p = pmts[i];
        const pNet = toFloat(p.net_payout), pHasGst = !!p.gst_no;
        const pCgstRate = pHasGst ? (toFloat(p.cgst) || 9) : 0;
        const pSgstRate = pHasGst ? (toFloat(p.sgst) || 9) : 0;
        const pGst = pHasGst ? round2(round2(pNet * pCgstRate / 100) + round2(pNet * pSgstRate / 100)) : 0;
        const pChargePaise = Math.round((pNet + pGst) * 100);

        await client.query(`INSERT INTO payment_batch_items (batch_id, payment_id, sequence_number) VALUES ($1,$2,$3)`, [b.id, p.id, i + 1]);
        await client.query(
          `UPDATE payments SET
             status = 'Completed', razorpay_order_id = $1, razorpay_payment_id = $2,
             razorpay_signature = $3, razorpay_method = $4, payment_method = $4,
             razorpay_email = $5, razorpay_contact = $6, razorpay_currency = 'INR',
             razorpay_amount_paid = $7, transaction_reference = $2, bank_reference = $1,
             processed_by = $8, processed_date = NOW(), completed_by = $8, completed_date = NOW()
           WHERE id = $9`,
          [txnid, easepayid, receivedHash, payment_mode || null, email || null, phone || null, pChargePaise, userId, p.id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'EASEBUZZ_PAYMENT_VERIFIED','PAYMENT_BATCH',$2,$3,$4,$5,'SUCCESS')`,
        [userId, b.id, JSON.stringify({ total_payments: pmts.length, customer_count: uniqueCustomers.length, customers: uniqueCustomers, easepayid, txnid, payment_mode, total_gross: tGross, total_tds: tTds, total_net: tNet, total_gst: tGstAll, total_charged: tCharge, dev: IS_DEV }), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
      );
    });

    res.json({
      success: true,
      message: `${batch.total_payments} payment(s) for ${udf2 || '?'} customer(s) completed via Easebuzz${IS_DEV ? ' [DEV]' : ''}`,
      data: batch,
    });
  } catch (err) {
    console.error('verifyEasebuzzPayment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Payment verification failed' });
  }
};

const handleEasebuzzFailure = async (req, res) => {
  try {
    const { paymentIds, txnid, easebuzzResponse } = req.body;
    if (!paymentIds?.length) return res.status(400).json({ success: false, error: 'paymentIds required' });
    const errorMsg  = easebuzzResponse?.error   || easebuzzResponse?.status || 'unknown';
    const errorCode = easebuzzResponse?.error_Message || null;
    await query(
      `UPDATE payments SET status = 'Pending', razorpay_order_id = NULL, failure_reason = $1, failure_code = $2
       WHERE id = ANY($3) AND status IN ('Pending','Order_Created') AND deleted_at IS NULL`,
      [errorMsg, errorCode, paymentIds]
    );
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'EASEBUZZ_PAYMENT_FAILED','PAYMENT',NULL,$2,$3,$4,'FAILURE')`,
      [req.user.id, JSON.stringify({ paymentIds, txnid, easebuzzResponse }), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
    );
    res.json({ success: true, message: 'Payment failure recorded — payments reset to Pending for retry' });
  } catch (err) {
    console.error('handleEasebuzzFailure error:', err);
    res.status(500).json({ success: false, error: 'Failed to record payment failure' });
  }
};

const completePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionReference, bankReference } = req.body;
    const userId = req.user.id;
    if (!transactionReference?.trim())
      return res.status(400).json({ success: false, error: 'transactionReference is required' });
    const { rows } = await query(
      `UPDATE payments SET status='Completed', transaction_reference=$1, bank_reference=$2, completed_date=NOW(), completed_by=$3
       WHERE id=$4 AND status='Processing' AND deleted_at IS NULL RETURNING *`,
      [transactionReference, bankReference || null, userId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Payment not found or not in Processing status' });
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'PAYMENT_COMPLETED','PAYMENT',$2,$3,$4,$5,'SUCCESS')`,
      [userId, id, JSON.stringify({ transaction_reference: transactionReference, bank_reference: bankReference, amount: rows[0].net_payout }), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
    );
    res.json({ success: true, message: 'Payment completed successfully', data: rows[0] });
  } catch (err) {
    console.error('completePayment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to complete payment' });
  }
};

const initiatePaymentBatch = async (req, res) => {
  try {
    const { paymentIds } = req.body;
    const userId = req.user.id;
    if (!paymentIds?.length) return res.status(400).json({ success: false, error: 'No payments selected' });
    let batch;
    await transaction(async (client) => {
      const { rows: pmts } = await client.query(`SELECT * FROM payments WHERE id=ANY($1) AND status='Pending' AND deleted_at IS NULL`, [paymentIds]);
      if (!pmts.length) throw new Error('No valid pending payments found');
      const tGross = round2(pmts.reduce((s, p) => s + toFloat(p.gross_amount), 0));
      const tTds   = round2(pmts.reduce((s, p) => s + toFloat(p.tds_amount), 0));
      const tNet   = round2(pmts.reduce((s, p) => s + toFloat(p.net_payout), 0));
      const { rows: [b] } = await client.query(
        `INSERT INTO payment_batches (batch_date, total_payments, total_gross_amount, total_tds_amount, total_net_payout, status, created_by, submitted_by, submitted_date)
         VALUES ($1,$2,$3,$4,$5,'Submitted',$6,$7,NOW()) RETURNING *`,
        [new Date(), pmts.length, tGross, tTds, tNet, userId, userId]
      );
      batch = b;
      for (let i = 0; i < pmts.length; i++) {
        await client.query(`INSERT INTO payment_batch_items (batch_id, payment_id, sequence_number) VALUES ($1,$2,$3)`, [batch.id, pmts[i].id, i + 1]);
        await client.query(`UPDATE payments SET status='Processing', processed_by=$1, processed_date=NOW() WHERE id=$2`, [userId, pmts[i].id]);
      }
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'PAYMENT_BATCH_INITIATED','PAYMENT_BATCH',$2,$3,$4,$5,'SUCCESS')`,
        [userId, batch.id, JSON.stringify({ total_payments: pmts.length }), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
      );
    });
    res.status(201).json({ success: true, message: 'Payment batch initiated', data: batch });
  } catch (err) {
    console.error('initiatePaymentBatch error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to initiate batch' });
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, customerId, status, startDate, endDate, month, agreementType } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    let queryText = `
      SELECT p.*, p.payout_splits AS payment_payout_splits,
             c.customer_id AS customer_code, c.customer_name, c.pan_number, c.email,
             c.phone, c.floor_no, c.unit_no, c.bank_account_number, c.ifsc_code, c.bank_name,
             c.agreement_type, c.tds_applicable, c.nri_status, c.gst_no, c.cgst, c.sgst,
             c.payout_splits AS customer_payout_splits
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.deleted_at IS NULL
    `;
    const queryParams = []; let pi = 1;
    if (customerId)    { queryText += ` AND p.customer_id = $${pi}`;    queryParams.push(customerId);    pi++; }
    if (status)        { queryText += ` AND p.status = $${pi}`;         queryParams.push(status);        pi++; }
    if (startDate)     { queryText += ` AND p.payment_date >= $${pi}`;  queryParams.push(startDate);     pi++; }
    if (endDate)       { queryText += ` AND p.payment_date <= $${pi}`;  queryParams.push(endDate);       pi++; }
    if (month)         { queryText += ` AND p.payment_month = $${pi}`;  queryParams.push(month);         pi++; }
    if (agreementType) { queryText += ` AND c.agreement_type = $${pi}`; queryParams.push(agreementType); pi++; }
    queryText += ` ORDER BY p.payment_date DESC, p.created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`;
    queryParams.push(parseInt(limit), offset);
    const result = await query(queryText, queryParams);

    let countQuery = `SELECT COUNT(*) FROM payments p JOIN customers c ON p.customer_id=c.id WHERE p.deleted_at IS NULL`;
    const countParams = []; let cp = 1;
    if (customerId)    { countQuery += ` AND p.customer_id=$${cp}`;    countParams.push(customerId);    cp++; }
    if (status)        { countQuery += ` AND p.status=$${cp}`;         countParams.push(status);        cp++; }
    if (startDate)     { countQuery += ` AND p.payment_date>=$${cp}`;  countParams.push(startDate);     cp++; }
    if (endDate)       { countQuery += ` AND p.payment_date<=$${cp}`;  countParams.push(endDate);       cp++; }
    if (month)         { countQuery += ` AND p.payment_month=$${cp}`;  countParams.push(month);         cp++; }
    if (agreementType) { countQuery += ` AND c.agreement_type=$${cp}`; countParams.push(agreementType); cp++; }
    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({ success: true, data: { payments: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) } } });
  } catch (error) {
    console.error('getPaymentHistory error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
};

const getPaymentStats = async (req, res) => {
  try {
    const { month, agreementType } = req.query;
    const params = []; let pi = 1;
    let sql = `SELECT COUNT(*) AS total_payments, COUNT(*) FILTER (WHERE p.status='Pending') AS pending_payments, COUNT(*) FILTER (WHERE p.status='Completed') AS completed_payments, COUNT(*) FILTER (WHERE p.status='Processing') AS processing_payments, COUNT(*) FILTER (WHERE p.status='Failed') AS failed_payments, COUNT(*) FILTER (WHERE c.agreement_type='Construction') AS construction_payments, COUNT(*) FILTER (WHERE c.agreement_type='9-Year') AS nine_year_payments, COALESCE(SUM(p.gross_amount),0) AS total_gross, COALESCE(SUM(p.tds_amount),0) AS total_tds, COALESCE(SUM(p.net_payout),0) AS total_net, COALESCE(SUM(p.net_payout) FILTER (WHERE p.status='Completed'),0) AS total_paid, COALESCE(AVG(p.escalation_rate) FILTER (WHERE c.agreement_type='9-Year'),0) AS avg_escalation_rate FROM payments p JOIN customers c ON p.customer_id=c.id WHERE p.deleted_at IS NULL`;
    if (month)         { sql += ` AND p.payment_month=$${pi}`;  params.push(month);         pi++; }
    if (agreementType) { sql += ` AND c.agreement_type=$${pi}`; params.push(agreementType); pi++; }
    const { rows } = await query(sql, params);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('getPaymentStats error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
};

const savePaymentWithAdjustment = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      customerId,
      paymentDate,
      rentMonth,
      grossAmount,
      tdsAmount,
      originalNetPayout,
      adjustmentAmount  = 0,
      adjustedNetPayout,
      adjustmentNote    = null,
      payoutSplits      = null,
      payoutBreakdown   = null,
    } = req.body;
 
    // ── Validate required fields ──────────────────────────────────────────
    if (!customerId || !paymentDate || !rentMonth)
      return res.status(400).json({ success: false, error: 'customerId, paymentDate, and rentMonth are required' });
    if (adjustedNetPayout == null || adjustedNetPayout <= 0)
      return res.status(400).json({ success: false, error: 'adjustedNetPayout must be a positive number' });
 
    // ── Check for existing non-cancelled payment ──────────────────────────
    const existingCheck = await query(
      `SELECT id, status FROM payments
       WHERE customer_id = $1 AND payment_month = $2
         AND status <> 'Cancelled' AND deleted_at IS NULL`,
      [customerId, rentMonth]
    );
    if (existingCheck.rows.length) {
      return res.status(409).json({
        success: false,
        error:   `A payment for ${rentMonth} already exists with status "${existingCheck.rows[0].status}". Cancel it first to save a new one.`,
        code:    'PAYMENT_ALREADY_EXISTS',
        existingId: existingCheck.rows[0].id,
      });
    }
 
    // ── Fetch customer for agreement_type / period ────────────────────────
    const { rows: custRows } = await query(
      `SELECT customer_name, agreement_type FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [customerId]
    );
    if (!custRows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });
 
    const period         = custRows[0].agreement_type;
    const splitsJson     = payoutSplits ? JSON.stringify(payoutSplits) : null;
    const adj            = round2(adjustmentAmount);
    const adjNet         = round2(adjustedNetPayout);
    const origNet        = round2(originalNetPayout ?? (round2(grossAmount) - round2(tdsAmount)));
    const noteWithAdj    = [
      adjustmentNote,
      `Adjustment: ${adj >= 0 ? '+' : ''}₹${adj} (original net ₹${origNet} → adjusted ₹${adjNet})`,
    ].filter(Boolean).join(' | ');
 
    // ── INSERT ────────────────────────────────────────────────────────────
    const { rows: [payment] } = await query(
      `INSERT INTO payments (
         customer_id, payment_date, payment_month,
         gross_amount, tds_amount, net_payout,
         payment_period, base_rent, escalation_rate, years_elapsed,
         scheduled_date, status, created_by,
         adjustment_amount, adjusted_net_payout, adjustment_note,
         payout_splits
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,'Pending',$10,$11,$12,$13,$14::jsonb)
       RETURNING *`,
      [
        customerId,
        paymentDate,
        rentMonth,
        round2(grossAmount),
        round2(tdsAmount),
        adjNet,                 // net_payout stores the ADJUSTED net
        period,
        round2(grossAmount),    // base_rent = gross for simplicity
        paymentDate,            // scheduled_date
        userId,
        adj,                    // adjustment_amount
        adjNet,                 // adjusted_net_payout (explicit column)
        noteWithAdj,
        splitsJson,
      ]
    );
 
    // ── Audit log ─────────────────────────────────────────────────────────
    await query(
      `INSERT INTO audit_logs
         (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'PAYMENT_SAVED_WITH_ADJUSTMENT','PAYMENT',$2,$3,$4,$5,'SUCCESS')`,
      [
        userId,
        payment.id,
        JSON.stringify({
          customerId, rentMonth, paymentDate,
          grossAmount: round2(grossAmount),
          tdsAmount:   round2(tdsAmount),
          originalNet: origNet,
          adjustmentAmount: adj,
          adjustedNet: adjNet,
          adjustmentNote,
          hasSplits: !!payoutSplits,
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
        payout_breakdown:    payoutBreakdown,   // returned for UI, not stored separately
      },
    });
  } catch (error) {
    console.error('savePaymentWithAdjustment error:', error);
    res.status(500).json({ success: false, error: 'Failed to save payment with adjustment' });
  }
};

// GET /payments/by-month?customerId=X&rentMonth=YYYY-MM
const getPaymentByMonth = async (req, res) => {
  try {
    const { customerId, rentMonth } = req.query;
    if (!customerId || !rentMonth)
      return res.status(400).json({ success: false, error: 'customerId and rentMonth are required' });

    const { rows } = await query(
      `SELECT 
         p.*,
         c.customer_name,
         c.agreement_type
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.customer_id = $1
         AND p.payment_month = $2
         AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT 1`,
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

// GET /payments/saved-adjustments — list all payments that have an adjustment
const getSavedAdjustments = async (req, res) => {
  try {
    const { customerId, month, limit = 50, offset = 0 } = req.query;

    const conditions = [`p.deleted_at IS NULL`, `p.adjustment_amount IS NOT NULL`, `p.adjustment_amount <> 0`];
    const values = [];
    let idx = 1;

    if (customerId) { conditions.push(`p.customer_id = $${idx++}`); values.push(customerId); }
    if (month)      { conditions.push(`p.payment_month = $${idx++}`); values.push(month); }

    values.push(limit, offset);

    const { rows } = await query(
      `SELECT 
         p.id, p.customer_id, p.payment_month, p.payment_date,
         p.gross_amount, p.tds_amount, p.net_payout,
         p.adjustment_amount, p.adjusted_net_payout, p.adjustment_note,
         p.status, p.created_at,
         c.customer_name
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
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
  createEasebuzzOrder,
  verifyEasebuzzPayment,
  handleEasebuzzFailure,
  resetOrderCreated,
  // Exported for use in disbursement/reporting modules
  splitPayoutForPayment,
  parsePayoutSplits,
  savePaymentWithAdjustment,
  getPaymentByMonth,
  getSavedAdjustments
};