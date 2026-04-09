const { query } = require('../config/database');
const PDFDocument = require('pdfkit');

// ═══════════════════════════════════════════════════════════════════════════════
//  Math helpers
// ═══════════════════════════════════════════════════════════════════════════════
const toFloat = (v, fb = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };

// KEY FIX: Math.round(x * 100) / 100
// Avoids floating-point drift from parseFloat(toFixed(2)) string round-trip.
// Preserves paise precision in all accumulations.
const round2 = (v) => Math.round(toFloat(v) * 100) / 100;

// ═══════════════════════════════════════════════════════════════════════════════
//  Rent / proration helpers
// ═══════════════════════════════════════════════════════════════════════════════
const calcRentForMonth = (monthlyRent, closureDate, rentMonth) => {
  if (!monthlyRent) return { rent: 0, rentType: 'unknown' };
  if (!closureDate) {
    return {
      rent: round2(monthlyRent), rentType: 'full_month',
      closureMonthKey: null, daysInClosureMonth: null,
      daysFromClosure: null, closureDay: null,
      monthlyRent: round2(monthlyRent), proratedRent: round2(monthlyRent),
    };
  }
  const yr    = closureDate.getFullYear();
  const moIdx = closureDate.getMonth();
  const day   = closureDate.getDate();
  const days  = new Date(yr, moIdx + 1, 0).getDate();
  const key   = `${yr}-${String(moIdx + 1).padStart(2, '0')}`;
  const remainingDays = days - day + 1;
  const pror  = round2(monthlyRent * (remainingDays / days));
  if (rentMonth === key) {
    return {
      rent: pror, rentType: 'prorated_closure_month',
      closureMonthKey: key, daysInClosureMonth: days,
      daysFromClosure: remainingDays, closureDay: day,
      monthlyRent: round2(monthlyRent), proratedRent: pror,
    };
  }
  return {
    rent: round2(monthlyRent), rentType: 'full_month',
    closureMonthKey: key, daysInClosureMonth: days,
    daysFromClosure: remainingDays, closureDay: day,
    monthlyRent: round2(monthlyRent), proratedRent: pror,
  };
};

// KEY FIX: isClosureMonth requires explicit non-empty string match.
// Old: `!rentMonth` is truthy for "" → always prorated.
// New: null/undefined/"" → full rent (no proration).
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

  const isClosureMonth = (rentMonth != null && rentMonth !== '') && (rentMonth === closureMonthKey);
  const daysCharged    = isClosureMonth ? (totalDays - closureDate.getDate() + 1) : totalDays;

  return round2((a / s) * (q * r) * (daysCharged / totalDays));
};

// ═══════════════════════════════════════════════════════════════════════════════
//  GST helpers
// ═══════════════════════════════════════════════════════════════════════════════
const calcRowGst = (netPayout, cgstRate, sgstRate, hasGst) => {
  if (!hasGst) return { cgst: 0, sgst: 0, total: 0, totalPayable: round2(netPayout) };
  const cgst  = round2(netPayout * cgstRate / 100);
  const sgst  = round2(netPayout * sgstRate / 100);
  const total = round2(cgst + sgst);
  return { cgst, sgst, total, totalPayable: round2(netPayout + total) };
};

const aggregateGst = (rows, cgstRate, sgstRate, hasGst) => {
  const totalNet = round2(rows.reduce((s, r) => s + toFloat(r.net_payout), 0));
  if (!hasGst) return { totalCGST: 0, totalSGST: 0, totalGST: 0, totalPayable: totalNet };
  const totalCGST = round2(rows.reduce((s, r) => s + round2(toFloat(r.net_payout) * cgstRate / 100), 0));
  const totalSGST = round2(rows.reduce((s, r) => s + round2(toFloat(r.net_payout) * sgstRate / 100), 0));
  const totalGST  = round2(totalCGST + totalSGST);
  return { totalCGST, totalSGST, totalGST, totalPayable: round2(totalNet + totalGST) };
};

// ─── SQL fragments ─────────────────────────────────────────────────────────────
const LATEST_FR = `
  (SELECT DISTINCT ON (customer_id)
     customer_id, rent, tds_applicable, rental_value_per_sft
   FROM financial_records
   WHERE deleted_at IS NULL
   ORDER BY customer_id, created_at DESC)
`;

const GST_COLS = `
  CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
       THEN ROUND((p.net_payout * COALESCE(c.cgst, 0) / 100)::numeric, 2)
       ELSE 0 END                                                  AS cgst_amount,
  CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
       THEN ROUND((p.net_payout * COALESCE(c.sgst, 0) / 100)::numeric, 2)
       ELSE 0 END                                                  AS sgst_amount,
  CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
       THEN ROUND((p.net_payout * (COALESCE(c.cgst, 0) + COALESCE(c.sgst, 0)) / 100)::numeric, 2)
       ELSE 0 END                                                  AS gst_amount,
  CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
       THEN ROUND((p.net_payout + p.net_payout * (COALESCE(c.cgst, 0) + COALESCE(c.sgst, 0)) / 100)::numeric, 2)
       ELSE ROUND(p.net_payout::numeric, 2) END                   AS total_payable
`;

// ─── KEY FIX: ALL_INST_WHERE ───────────────────────────────────────────────────
// Include a payment row when it has TDS > 0 OR any sibling installment for
// the same customer+month has TDS > 0.
// This ensures Inst 2/2 (tds_amount = 0, because combined TDS sits on Inst 1)
// is always fetched — so Gross Rent = Inst 1 gross + Inst 2 gross combined.
//
// Use ALL_INST_WHERE_P  when the payments table is aliased as "p".
// Use ALL_INST_WHERE_BARE when querying "payments" directly (no alias).
const ALL_INST_WHERE_P = `
  (
    p.tds_amount > 0
    OR EXISTS (
      SELECT 1 FROM payments p2
      WHERE p2.customer_id   = p.customer_id
        AND p2.payment_month = p.payment_month
        AND p2.tds_amount    > 0
        AND p2.deleted_at    IS NULL
    )
  )
`;

const ALL_INST_WHERE_BARE = `
  (
    tds_amount > 0
    OR EXISTS (
      SELECT 1 FROM payments p2
      WHERE p2.customer_id   = payments.customer_id
        AND p2.payment_month = payments.payment_month
        AND p2.tds_amount    > 0
        AND p2.deleted_at    IS NULL
    )
  )
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  getAllTDS
// ═══════════════════════════════════════════════════════════════════════════════
const getAllTDS = async (req, res) => {
  try {
    const { month, year, customerId, status, startDate, endDate } = req.query;

    let queryText = `
      SELECT DISTINCT ON (p.id)
        p.id,
        p.payment_id,
        p.payment_date,
        p.payment_month,
        ROUND(p.gross_amount::numeric,  2)  AS gross_amount,
        ROUND(p.tds_amount::numeric,    2)  AS tds_amount,
        ROUND(p.net_payout::numeric,    2)  AS net_payout,
        ROUND(p.base_rent::numeric,     2)  AS base_rent,
        p.escalation_rate,
        p.years_elapsed,
        p.status,
        p.payment_period,
        p.completed_date,
        p.scheduled_date,
        p.installment_no,
        p.total_installments,
        c.id                AS customer_db_id,
        c.customer_name,
        c.customer_id       AS customer_code,
        c.pan_number,
        c.email,
        c.phone,
        c.agreement_type,
        c.floor_no,
        c.unit_no,
        c.nri_status,
        c.gst_no,
        c.cgst,
        c.sgst,
        fr.tds_applicable,
        ${GST_COLS}
      FROM payments p
      JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
      LEFT JOIN ${LATEST_FR} fr ON c.id = fr.customer_id
      WHERE p.deleted_at IS NULL
        AND ${ALL_INST_WHERE_P}
    `;

    const queryParams = [];
    let pi = 1;

    if (month && month.length === 7) { queryText += ` AND p.payment_month = $${pi}`;      queryParams.push(month);       pi++; }
    else if (year)                   { queryText += ` AND p.payment_month LIKE $${pi}`;   queryParams.push(`${year}-%`); pi++; }
    if (customerId) { queryText += ` AND p.customer_id = $${pi}`;    queryParams.push(customerId); pi++; }
    if (status)     { queryText += ` AND p.status = $${pi}`;         queryParams.push(status);     pi++; }
    if (startDate)  { queryText += ` AND p.payment_date >= $${pi}`;  queryParams.push(startDate);  pi++; }
    if (endDate)    { queryText += ` AND p.payment_date <= $${pi}`;  queryParams.push(endDate);    pi++; }

    queryText += ` ORDER BY p.id, p.payment_date DESC, p.created_at DESC`;

    const result = await query(queryText, queryParams);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getAllTDS error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch TDS records' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  getTDSSummary
// ═══════════════════════════════════════════════════════════════════════════════
const getTDSSummary = async (req, res) => {
  try {
    const { month, year, startDate, endDate } = req.query;

    let queryText = `
      SELECT
        COUNT(DISTINCT p.customer_id)                                              AS total_customers,
        COUNT(DISTINCT p.id)                                                       AS total_deductions,
        ROUND(COALESCE(SUM(p.gross_amount), 0)::numeric, 2)                        AS total_gross_amount,
        ROUND(COALESCE(SUM(p.tds_amount),   0)::numeric, 2)                        AS total_tds_deducted,
        ROUND(COALESCE(SUM(p.net_payout),   0)::numeric, 2)                        AS total_net_amount,
        ROUND(COALESCE(SUM(
          CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
               THEN ROUND((p.net_payout * COALESCE(c.cgst, 0) / 100)::numeric, 2) ELSE 0 END
        ), 0)::numeric, 2)                                                         AS total_cgst_amount,
        ROUND(COALESCE(SUM(
          CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
               THEN ROUND((p.net_payout * COALESCE(c.sgst, 0) / 100)::numeric, 2) ELSE 0 END
        ), 0)::numeric, 2)                                                         AS total_sgst_amount,
        ROUND(COALESCE(SUM(
          CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
               THEN ROUND((p.net_payout * (COALESCE(c.cgst, 0) + COALESCE(c.sgst, 0)) / 100)::numeric, 2) ELSE 0 END
        ), 0)::numeric, 2)                                                         AS total_gst_amount,
        ROUND(COALESCE(SUM(
          CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
               THEN ROUND((p.net_payout + p.net_payout * (COALESCE(c.cgst, 0) + COALESCE(c.sgst, 0)) / 100)::numeric, 2)
               ELSE ROUND(p.net_payout::numeric, 2) END
        ), 0)::numeric, 2)                                                         AS total_payable
      FROM payments p
      JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
        AND ${ALL_INST_WHERE_P}
    `;

    const queryParams = [];
    let pi = 1;
    if (month && month.length === 7) { queryText += ` AND p.payment_month = $${pi}`;     queryParams.push(month);       pi++; }
    else if (year)                   { queryText += ` AND p.payment_month LIKE $${pi}`;  queryParams.push(`${year}-%`); pi++; }
    if (startDate) { queryText += ` AND p.payment_date >= $${pi}`; queryParams.push(startDate); pi++; }
    if (endDate)   { queryText += ` AND p.payment_date <= $${pi}`; queryParams.push(endDate);   pi++; }

    const result = await query(queryText, queryParams);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('getTDSSummary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch TDS summary' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  getMonthlyTDS
// ═══════════════════════════════════════════════════════════════════════════════
const getMonthlyTDS = async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year)
      return res.status(400).json({ success: false, error: 'Month and year are required' });

    const paymentMonth = `${year}-${String(month).padStart(2, '0')}`;
    const result = await query(
      `SELECT DISTINCT ON (p.id)
        p.id, p.payment_id, p.payment_date, p.payment_month,
        ROUND(p.gross_amount::numeric, 2) AS gross_amount,
        ROUND(p.tds_amount::numeric,   2) AS tds_amount,
        ROUND(p.net_payout::numeric,   2) AS net_payout,
        ROUND(p.base_rent::numeric,    2) AS base_rent,
        p.escalation_rate, p.years_elapsed, p.status,
        p.installment_no, p.total_installments,
        c.id AS customer_db_id,
        c.customer_name, c.customer_id AS customer_code,
        c.pan_number, c.agreement_type, c.gst_no, c.cgst, c.sgst, c.nri_status,
        fr.tds_applicable,
        ${GST_COLS}
       FROM payments p
       JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
       LEFT JOIN ${LATEST_FR} fr ON c.id = fr.customer_id
       WHERE p.deleted_at IS NULL
         AND p.payment_month = $1
         AND ${ALL_INST_WHERE_P}
       ORDER BY p.id, p.payment_date DESC`,
      [paymentMonth]
    );

    const rows = result.rows;
    const summary = {
      total_deductions: rows.length,
      total_gross:   round2(rows.reduce((s, r) => s + toFloat(r.gross_amount),  0)),
      total_tds:     round2(rows.reduce((s, r) => s + toFloat(r.tds_amount),    0)),
      total_net:     round2(rows.reduce((s, r) => s + toFloat(r.net_payout),    0)),
      total_cgst:    round2(rows.reduce((s, r) => s + toFloat(r.cgst_amount),   0)),
      total_sgst:    round2(rows.reduce((s, r) => s + toFloat(r.sgst_amount),   0)),
      total_gst:     round2(rows.reduce((s, r) => s + toFloat(r.gst_amount),    0)),
      total_payable: round2(rows.reduce((s, r) => s + toFloat(r.total_payable), 0)),
    };
    res.json({ success: true, data: { records: rows, summary } });
  } catch (error) {
    console.error('getMonthlyTDS error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monthly TDS' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  getQuarterlyTDS
//  KEY FIX: both inner queries now use ALL_INST_WHERE_P instead of
//  "p.tds_amount > 0" so Inst 2/2 gross is included in quarterly totals.
// ═══════════════════════════════════════════════════════════════════════════════
const getQuarterlyTDS = async (req, res) => {
  try {
    const { quarter, year } = req.query;
    if (!quarter || !year)
      return res.status(400).json({ success: false, error: 'Quarter and year are required' });

    const quarterMonths = { Q1:['01','02','03'], Q2:['04','05','06'], Q3:['07','08','09'], Q4:['10','11','12'] };
    const months = quarterMonths[quarter.toUpperCase()];
    if (!months) return res.status(400).json({ success: false, error: 'Invalid quarter. Use Q1, Q2, Q3, or Q4' });

    const paymentMonths = months.map(m => `${year}-${m}`);

    const gstSumCols = (prefix = 'p') => `
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((${prefix}.net_payout * COALESCE(c.cgst, 0) / 100)::numeric, 2) ELSE 0 END)::numeric, 2) AS total_cgst,
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((${prefix}.net_payout * COALESCE(c.sgst, 0) / 100)::numeric, 2) ELSE 0 END)::numeric, 2) AS total_sgst,
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((${prefix}.net_payout * (COALESCE(c.cgst, 0) + COALESCE(c.sgst, 0)) / 100)::numeric, 2) ELSE 0 END)::numeric, 2) AS total_gst,
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((${prefix}.net_payout + ${prefix}.net_payout * (COALESCE(c.cgst, 0) + COALESCE(c.sgst, 0)) / 100)::numeric, 2)
        ELSE ROUND(${prefix}.net_payout::numeric, 2) END)::numeric, 2) AS total_payable
    `;

    // Monthly breakdown — all installments per TDS customer
    const monthlyResult = await query(
      `SELECT p.payment_month,
        COUNT(DISTINCT p.id)                   AS deduction_count,
        COUNT(DISTINCT p.customer_id)          AS customer_count,
        ROUND(SUM(p.gross_amount)::numeric, 2) AS total_gross,
        ROUND(SUM(p.tds_amount)::numeric,   2) AS total_tds,
        ROUND(SUM(p.net_payout)::numeric,   2) AS total_net,
        ${gstSumCols('p')}
       FROM payments p
       JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND p.payment_month = ANY($1)
         AND ${ALL_INST_WHERE_P}
       GROUP BY p.payment_month ORDER BY p.payment_month ASC`,
      [paymentMonths]
    );

    // Customer breakdown — all installments per TDS customer
    const customerResult = await query(
      `SELECT c.id AS customer_id, c.customer_name, c.customer_id AS customer_code,
        c.pan_number, c.agreement_type, c.gst_no, c.cgst, c.sgst, c.nri_status,
        COUNT(DISTINCT p.id)                   AS payment_count,
        ROUND(SUM(p.gross_amount)::numeric, 2) AS total_gross,
        ROUND(SUM(p.tds_amount)::numeric,   2) AS total_tds,
        ROUND(SUM(p.net_payout)::numeric,   2) AS total_net,
        ${gstSumCols('p')}
       FROM customers c
       JOIN payments p ON c.id = p.customer_id AND p.deleted_at IS NULL
       WHERE c.deleted_at IS NULL
         AND p.payment_month = ANY($1)
         AND ${ALL_INST_WHERE_P}
       GROUP BY c.id, c.customer_name, c.customer_id, c.pan_number,
                c.agreement_type, c.gst_no, c.cgst, c.sgst, c.nri_status
       ORDER BY total_tds DESC`,
      [paymentMonths]
    );

    const mr = monthlyResult.rows;
    res.json({
      success: true,
      data: {
        quarter, year,
        months:           mr,
        total_deductions: mr.reduce((s, r) => s + parseInt(r.deduction_count), 0),
        total_gross:   round2(mr.reduce((s, r) => s + toFloat(r.total_gross),   0)),
        total_tds:     round2(mr.reduce((s, r) => s + toFloat(r.total_tds),     0)),
        total_net:     round2(mr.reduce((s, r) => s + toFloat(r.total_net),     0)),
        total_cgst:    round2(mr.reduce((s, r) => s + toFloat(r.total_cgst),    0)),
        total_sgst:    round2(mr.reduce((s, r) => s + toFloat(r.total_sgst),    0)),
        total_gst:     round2(mr.reduce((s, r) => s + toFloat(r.total_gst),     0)),
        total_payable: round2(mr.reduce((s, r) => s + toFloat(r.total_payable), 0)),
        by_customer:   customerResult.rows,
      },
    });
  } catch (error) {
    console.error('getQuarterlyTDS error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quarterly TDS' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  getTDSStats
//  (stats/analytics only — keeps tds_amount > 0 intentionally here because
//   AVG/MAX/MIN on tds_amount should not include Inst 2 zero rows)
// ═══════════════════════════════════════════════════════════════════════════════
const getTDSStats = async (req, res) => {
  try {
    const { year } = req.query;
    const selectedYear = year || new Date().getFullYear();

    const gstBlock = `
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((p.net_payout * COALESCE(c.cgst,0) / 100)::numeric, 2) ELSE 0 END)::numeric, 2) AS total_cgst,
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((p.net_payout * COALESCE(c.sgst,0) / 100)::numeric, 2) ELSE 0 END)::numeric, 2) AS total_sgst,
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((p.net_payout * (COALESCE(c.cgst,0) + COALESCE(c.sgst,0)) / 100)::numeric, 2) ELSE 0 END)::numeric, 2) AS total_gst,
      ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
        THEN ROUND((p.net_payout + p.net_payout * (COALESCE(c.cgst,0) + COALESCE(c.sgst,0)) / 100)::numeric, 2)
        ELSE ROUND(p.net_payout::numeric, 2) END)::numeric, 2) AS total_payable
    `;

    const overallStats = await query(
      `SELECT
        COUNT(DISTINCT p.id)                   AS total_deductions,
        COUNT(DISTINCT p.customer_id)          AS total_customers,
        ROUND(SUM(p.gross_amount)::numeric, 2) AS total_gross,
        ROUND(SUM(p.tds_amount)::numeric,   2) AS total_tds,
        ROUND(SUM(p.net_payout)::numeric,   2) AS total_net,
        ROUND(AVG(p.tds_amount)::numeric,   2) AS avg_tds,
        ROUND(MAX(p.tds_amount)::numeric,   2) AS max_tds,
        ROUND(MIN(p.tds_amount)::numeric,   2) AS min_tds,
        ${gstBlock}
       FROM payments p
       JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND p.tds_amount > 0
         AND p.payment_month LIKE $1`,
      [`${selectedYear}-%`]
    );

    const monthlyBreakdown = await query(
      `SELECT p.payment_month,
        COUNT(DISTINCT p.id)                   AS deduction_count,
        ROUND(SUM(p.tds_amount)::numeric, 2)   AS total_tds,
        ROUND(SUM(p.net_payout)::numeric, 2)   AS total_net,
        ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
          THEN ROUND((p.net_payout * (COALESCE(c.cgst,0) + COALESCE(c.sgst,0)) / 100)::numeric, 2)
          ELSE 0 END)::numeric, 2)             AS total_gst
       FROM payments p
       JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND p.tds_amount > 0
         AND p.payment_month LIKE $1
       GROUP BY p.payment_month ORDER BY p.payment_month ASC`,
      [`${selectedYear}-%`]
    );

    const topCustomers = await query(
      `SELECT c.customer_name, c.pan_number,
        COUNT(DISTINCT p.id)                   AS payment_count,
        ROUND(SUM(p.tds_amount)::numeric,   2) AS total_tds,
        ROUND(SUM(p.net_payout)::numeric,   2) AS total_net,
        ROUND(SUM(CASE WHEN c.gst_no IS NOT NULL AND c.gst_no <> ''
          THEN ROUND((p.net_payout * (COALESCE(c.cgst,0) + COALESCE(c.sgst,0)) / 100)::numeric, 2)
          ELSE 0 END)::numeric, 2)             AS total_gst
       FROM customers c
       JOIN payments p ON c.id = p.customer_id
       WHERE p.deleted_at IS NULL
         AND p.tds_amount > 0
         AND p.payment_month LIKE $1
       GROUP BY c.id, c.customer_name, c.pan_number
       ORDER BY total_tds DESC LIMIT 10`,
      [`${selectedYear}-%`]
    );

    const statusBreakdown = await query(
      `SELECT p.status,
        COUNT(DISTINCT p.id)                   AS count,
        ROUND(SUM(p.tds_amount)::numeric, 2)   AS total_tds
       FROM payments p
       WHERE p.deleted_at IS NULL
         AND p.tds_amount > 0
         AND p.payment_month LIKE $1
       GROUP BY p.status`,
      [`${selectedYear}-%`]
    );

    res.json({
      success: true,
      data: {
        year: selectedYear,
        overall:       overallStats.rows[0],
        monthly:       monthlyBreakdown.rows,
        top_customers: topCustomers.rows,
        by_status:     statusBreakdown.rows,
      },
    });
  } catch (error) {
    console.error('getTDSStats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch TDS statistics' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  generateCertificate
//
//  KEY FIX: fetch ALL installments for the customer+quarter months using
//  ALL_INST_WHERE_BARE.  Previously: WHERE tds_amount > 0 → Inst 2/2 gross
//  was silently dropped, so total_gross stored in the certificate was wrong.
// ═══════════════════════════════════════════════════════════════════════════════
const generateCertificate = async (req, res) => {
  try {
    const { customerId, quarter, year } = req.body;
    const userId = req.user.id;
    if (!customerId || !quarter || !year)
      return res.status(400).json({ success: false, error: 'Customer ID, quarter, and year are required' });

    const customerResult = await query(
      `SELECT c.*, fr.tds_applicable, fr.rental_value_per_sft, fr.payment_closure_date AS fr_closure_date
       FROM customers c
       LEFT JOIN ${LATEST_FR} fr ON c.id = fr.customer_id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [customerId]
    );
    if (!customerResult.rows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    const customer = customerResult.rows[0];
    const quarterMonths = { Q1:['01','02','03'], Q2:['04','05','06'], Q3:['07','08','09'], Q4:['10','11','12'] };
    const paymentMonths = quarterMonths[quarter.toUpperCase()].map(m => `${year}-${m}`);

    // All installments — not just rows where tds_amount > 0
    const paymentsResult = await query(
      `SELECT DISTINCT ON (id)
        id, payment_month, payment_date,
        ROUND(gross_amount::numeric, 2) AS gross_amount,
        ROUND(tds_amount::numeric,   2) AS tds_amount,
        ROUND(net_payout::numeric,   2) AS net_payout,
        ROUND(base_rent::numeric,    2) AS base_rent,
        escalation_rate, years_elapsed, installment_no, total_installments
       FROM payments
       WHERE customer_id = $1
         AND payment_month = ANY($2)
         AND deleted_at IS NULL
         AND ${ALL_INST_WHERE_BARE}
       ORDER BY id, payment_date ASC`,
      [customerId, paymentMonths]
    );
    if (!paymentsResult.rows.length)
      return res.status(404).json({ success: false, error: 'No TDS deductions found for this quarter' });

    const payments = paymentsResult.rows;

    // Totals now include Inst 2 gross correctly
    const totalGross = round2(payments.reduce((s, p) => s + toFloat(p.gross_amount), 0));
    const totalTDS   = round2(payments.reduce((s, p) => s + toFloat(p.tds_amount),   0));
    const totalNet   = round2(payments.reduce((s, p) => s + toFloat(p.net_payout),   0));

    const hasGST   = !!(customer.gst_no && (toFloat(customer.cgst) > 0 || toFloat(customer.sgst) > 0));
    const cgstRate = hasGST ? toFloat(customer.cgst) : 0;
    const sgstRate = hasGST ? toFloat(customer.sgst) : 0;
    const { totalCGST, totalSGST, totalGST, totalPayable } = aggregateGst(payments, cgstRate, sgstRate, hasGST);

    const closureDate = customer.fr_closure_date ? new Date(customer.fr_closure_date) : null;
    const sqft        = toFloat(customer.sqft);
    const rentPerSft  = toFloat(customer.rental_value_per_sft);
    const monthlyRent = sqft && rentPerSft ? round2(sqft * rentPerSft) : 0;

    // Group per month — combine all installments within each month for display
    const rentBreakdown = paymentMonths.map((rentMonth) => {
      const monthPayments = payments.filter(p => p.payment_month === rentMonth);
      if (!monthPayments.length) return { rentMonth, hasPayments: false };
      const { rentType, daysFromClosure, daysInClosureMonth, closureDay } =
        calcRentForMonth(monthlyRent, closureDate, rentMonth);
      return {
        rentMonth, hasPayments: true, rentType, monthlyRent,
        daysFromClosure:    daysFromClosure    ?? null,
        daysInClosureMonth: daysInClosureMonth ?? null,
        closureDay:         closureDay         ?? null,
        // Combined across all installments in this month
        grossForMonth: round2(monthPayments.reduce((s, p) => s + toFloat(p.gross_amount), 0)),
        netForMonth:   round2(monthPayments.reduce((s, p) => s + toFloat(p.net_payout),   0)),
        tdsForMonth:   round2(monthPayments.reduce((s, p) => s + toFloat(p.tds_amount),   0)),
      };
    });

    const certificateResult = await query(
      `INSERT INTO tds_certificates (
        certificate_number, customer_id, quarter, year,
        total_tds_amount, total_gross_amount, total_net_amount,
        total_cgst_amount, total_sgst_amount, total_gst_amount, total_payable_amount,
        payment_count, status, generated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Generated',$13)
      ON CONFLICT ON CONSTRAINT tds_certificates_unique_idx
      DO UPDATE SET
        total_tds_amount     = EXCLUDED.total_tds_amount,
        total_gross_amount   = EXCLUDED.total_gross_amount,
        total_net_amount     = EXCLUDED.total_net_amount,
        total_cgst_amount    = EXCLUDED.total_cgst_amount,
        total_sgst_amount    = EXCLUDED.total_sgst_amount,
        total_gst_amount     = EXCLUDED.total_gst_amount,
        total_payable_amount = EXCLUDED.total_payable_amount,
        payment_count        = EXCLUDED.payment_count,
        updated_at           = NOW()
      RETURNING *`,
      [
        `TDS-${year}-${quarter}-${customer.customer_id}`,
        customerId, quarter, year,
        totalTDS, totalGross, totalNet,
        totalCGST, totalSGST, totalGST, totalPayable,
        payments.length, userId,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'TDS certificate generated successfully',
      data: {
        ...certificateResult.rows[0],
        gst_breakdown:  { hasGST, cgstRate, sgstRate, totalCGST, totalSGST, totalGST, totalPayable },
        rent_breakdown: rentBreakdown,
      },
    });
  } catch (error) {
    console.error('generateCertificate error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate certificate' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  getCertificates
// ═══════════════════════════════════════════════════════════════════════════════
const getCertificates = async (req, res) => {
  try {
    const { customerId, quarter, year, status } = req.query;
    let queryText = `
      SELECT tc.*,
        ROUND(tc.total_gross_amount::numeric,   2) AS total_gross_amount,
        ROUND(tc.total_tds_amount::numeric,     2) AS total_tds_amount,
        ROUND(tc.total_net_amount::numeric,     2) AS total_net_amount,
        ROUND(COALESCE(tc.total_cgst_amount,    0)::numeric, 2) AS total_cgst_amount,
        ROUND(COALESCE(tc.total_sgst_amount,    0)::numeric, 2) AS total_sgst_amount,
        ROUND(COALESCE(tc.total_gst_amount,     0)::numeric, 2) AS total_gst_amount,
        ROUND(COALESCE(tc.total_payable_amount, tc.total_net_amount)::numeric, 2) AS total_payable_amount,
        c.customer_name, c.customer_id AS customer_code, c.pan_number, c.email,
        c.gst_no, c.cgst, c.sgst, c.nri_status,
        fr.tds_applicable
      FROM tds_certificates tc
      JOIN customers c ON tc.customer_id = c.id AND c.deleted_at IS NULL
      LEFT JOIN ${LATEST_FR} fr ON c.id = fr.customer_id
      WHERE tc.deleted_at IS NULL
    `;
    const queryParams = []; let pi = 1;
    if (customerId) { queryText += ` AND tc.customer_id = $${pi}`; queryParams.push(customerId); pi++; }
    if (quarter)    { queryText += ` AND tc.quarter = $${pi}`;     queryParams.push(quarter);    pi++; }
    if (year)       { queryText += ` AND tc.year = $${pi}`;        queryParams.push(year);       pi++; }
    if (status)     { queryText += ` AND tc.status = $${pi}`;      queryParams.push(status);     pi++; }
    queryText += ` ORDER BY tc.created_at DESC`;

    const result = await query(queryText, queryParams);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getCertificates error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch certificates' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  downloadCertificate
//
//  KEY FIX: same ALL_INST_WHERE_BARE — fetch all installments so Gross Rent
//  shown in the PDF = Inst 1 + Inst 2 combined per month.
// ═══════════════════════════════════════════════════════════════════════════════
const downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const certResult = await query(
      `SELECT tc.*,
        ROUND(tc.total_gross_amount::numeric,   2) AS total_gross_amount,
        ROUND(tc.total_tds_amount::numeric,     2) AS total_tds_amount,
        ROUND(tc.total_net_amount::numeric,     2) AS total_net_amount,
        ROUND(COALESCE(tc.total_cgst_amount,    0)::numeric, 2) AS total_cgst_amount,
        ROUND(COALESCE(tc.total_sgst_amount,    0)::numeric, 2) AS total_sgst_amount,
        ROUND(COALESCE(tc.total_gst_amount,     0)::numeric, 2) AS total_gst_amount,
        ROUND(COALESCE(tc.total_payable_amount, tc.total_net_amount)::numeric, 2) AS total_payable_amount,
        c.customer_name, c.customer_id AS customer_code,
        c.pan_number, c.email, c.address,
        c.bank_account_number, c.ifsc_code, c.bank_name,
        c.gst_no, c.cgst, c.sgst, c.nri_status, c.sqft,
        fr.rental_value_per_sft, fr.payment_closure_date AS fr_closure_date
       FROM tds_certificates tc
       JOIN customers c ON tc.customer_id = c.id
       LEFT JOIN ${LATEST_FR} fr ON c.id = fr.customer_id
       WHERE tc.id = $1 AND tc.deleted_at IS NULL`,
      [certificateId]
    );
    if (!certResult.rows.length)
      return res.status(404).json({ success: false, error: 'Certificate not found' });

    const certificate = certResult.rows[0];
    const isNRIFlag = (certificate.nri_status || '').toLowerCase() === 'yes';
    const hasGST    = !!(certificate.gst_no && (toFloat(certificate.cgst) > 0 || toFloat(certificate.sgst) > 0));
    const cgstRate  = hasGST ? toFloat(certificate.cgst) : 0;
    const sgstRate  = hasGST ? toFloat(certificate.sgst) : 0;

    const quarterMonths = { Q1:['01','02','03'], Q2:['04','05','06'], Q3:['07','08','09'], Q4:['10','11','12'] };
    const paymentMonths = quarterMonths[certificate.quarter.toUpperCase()].map(m => `${certificate.year}-${m}`);

    // All installments — Inst 1 + Inst 2 gross combined per month
    const pmtRows = await query(
      `SELECT DISTINCT ON (id)
        id, payment_month, payment_date,
        ROUND(gross_amount::numeric, 2) AS gross_amount,
        ROUND(tds_amount::numeric,   2) AS tds_amount,
        ROUND(net_payout::numeric,   2) AS net_payout,
        ROUND(base_rent::numeric,    2) AS base_rent,
        escalation_rate, installment_no, total_installments
       FROM payments
       WHERE customer_id = $1
         AND payment_month = ANY($2)
         AND deleted_at IS NULL
         AND ${ALL_INST_WHERE_BARE}
       ORDER BY id, payment_date ASC`,
      [certificate.customer_id, paymentMonths]
    );

    const closureDate = certificate.fr_closure_date ? new Date(certificate.fr_closure_date) : null;
    const sqft        = toFloat(certificate.sqft);
    const rentPerSft  = toFloat(certificate.rental_value_per_sft);
    const monthlyRent = sqft && rentPerSft ? round2(sqft * rentPerSft) : 0;

    // Combine all installments within each month
    const rentRows = paymentMonths.map(rentMonth => {
      const rows = pmtRows.rows.filter(p => p.payment_month === rentMonth);
      if (!rows.length) return null;
      const { rentType, daysFromClosure, daysInClosureMonth } =
        calcRentForMonth(monthlyRent, closureDate, rentMonth);
      return {
        rentMonth, rentType, daysFromClosure, daysInClosureMonth,
        installments: rows.length,
        gross: round2(rows.reduce((s, p) => s + toFloat(p.gross_amount), 0)),
        tds:   round2(rows.reduce((s, p) => s + toFloat(p.tds_amount),   0)),
        net:   round2(rows.reduce((s, p) => s + toFloat(p.net_payout),   0)),
      };
    }).filter(Boolean);

    // Format helper — round2 then localise with 2dp
    const fmt = v => round2(toFloat(v)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=TDS-Certificate-${certificate.certificate_number}.pdf`);
    doc.pipe(res);

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.fontSize(20).text('TDS CERTIFICATE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Certificate No: ${certificate.certificate_number}`, { align: 'center' });
    doc.fontSize(10).text(`Quarter: ${certificate.quarter} ${certificate.year}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── Customer Details ──────────────────────────────────────────────────────
    doc.fontSize(14).text('Customer Details:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Name:        ${certificate.customer_name}`);
    doc.text(`Customer ID: ${certificate.customer_code}`);
    doc.text(`PAN Number:  ${certificate.pan_number}`);
    doc.text(`Email:       ${certificate.email || '—'}`);
    if (isNRIFlag) doc.text('NRI Status:  Non-Resident Indian (NRI)');
    if (hasGST) {
      doc.moveDown(0.5);
      doc.text(`GST Number:  ${certificate.gst_no}`);
      doc.text(`CGST Rate:   ${cgstRate}%`);
      doc.text(`SGST Rate:   ${sgstRate}%`);
    }
    doc.moveDown(1.5);

    // ── Monthly Rent Breakdown ────────────────────────────────────────────────
    doc.fontSize(14).text('Monthly Rent Breakdown:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const row of rentRows) {
      const monthLabel = new Date(`${row.rentMonth}-01`).toLocaleString('default', { month: 'long', year: 'numeric' });
      const typeNote   = row.rentType === 'prorated_closure_month'
        ? ` [Prorated: ${row.daysFromClosure}/${row.daysInClosureMonth} days]`
        : ' [Full Month]';
      // Show "(2 installments combined)" when Inst 1 + Inst 2 exist
      const instNote   = row.installments > 1 ? ` (${row.installments} installments combined)` : '';
      doc.font('Helvetica-Bold').text(`${monthLabel}${typeNote}${instNote}`).font('Helvetica');
      doc.text(`  Gross: Rs. ${fmt(row.gross)}   TDS (10%): Rs. ${fmt(row.tds)}   Net: Rs. ${fmt(row.net)}`);
      doc.moveDown(0.4);
    }
    doc.moveDown(1);

    // ── TDS Summary ───────────────────────────────────────────────────────────
    doc.fontSize(14).text('TDS Deduction Summary:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Payments:      ${certificate.payment_count}`);
    doc.text(`Gross Amount:        Rs. ${fmt(certificate.total_gross_amount)}`);
    doc.text(`TDS Deducted (10%):  Rs. ${fmt(certificate.total_tds_amount)}`);
    doc.text(`Net Amount:          Rs. ${fmt(certificate.total_net_amount)}`);

    if (hasGST) {
      doc.moveDown(0.5);
      doc.fontSize(14).text('GST on Net Amount (after TDS):', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`CGST (${cgstRate}%):    Rs. ${fmt(certificate.total_cgst_amount)}`);
      doc.text(`SGST (${sgstRate}%):    Rs. ${fmt(certificate.total_sgst_amount)}`);
      doc.text(`Total GST:           Rs. ${fmt(certificate.total_gst_amount)}`);
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica-Bold')
        .text(`Total Payable (Net + GST): Rs. ${fmt(certificate.total_payable_amount)}`);
      doc.font('Helvetica');
    } else {
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica-Bold')
        .text(`Net Amount Paid: Rs. ${fmt(certificate.total_net_amount)}`);
      doc.font('Helvetica');
    }

    doc.moveDown(2);
    doc.fontSize(8).text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
    doc.text('This is a system generated document. No physical signature is required.', { align: 'center' });
    doc.end();

  } catch (error) {
    console.error('downloadCertificate error:', error);
    res.status(500).json({ success: false, error: 'Failed to download certificate' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  updateCertificateStatus
// ═══════════════════════════════════════════════════════════════════════════════
const updateCertificateStatus = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    if (!['Generated', 'Issued', 'Cancelled'].includes(status))
      return res.status(400).json({ success: false, error: 'Invalid status' });

    const result = await query(
      `UPDATE tds_certificates SET status = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [status, certificateId]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Certificate not found' });

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'TDS_CERTIFICATE_STATUS_UPDATED','TDS_CERTIFICATE',$2,$3,$4,$5,'SUCCESS')`,
      [userId, certificateId, JSON.stringify({ status }), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
    );
    res.json({ success: true, message: 'Certificate status updated', data: result.rows[0] });
  } catch (error) {
    console.error('updateCertificateStatus error:', error);
    res.status(500).json({ success: false, error: 'Failed to update certificate status' });
  }
};

module.exports = {
  getAllTDS, getTDSSummary, getMonthlyTDS, getQuarterlyTDS, getTDSStats,
  generateCertificate, getCertificates, downloadCertificate, updateCertificateStatus,
};