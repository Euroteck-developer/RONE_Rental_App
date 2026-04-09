'use strict';

const { query } = require('../config/database');

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const round2  = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
const round0  = (v) => Math.round(parseFloat(v) || 0);
const toFloat = (v) => parseFloat(v) || 0;

const parseJsonb = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
};

/**
 * Full payment rent = sqft × rentPerSFT (full month, no proration).
 */
const calcFullRent = (sqft, rentPerSFT) => {
  const q = toFloat(sqft);
  const r = toFloat(rentPerSFT);
  return q && r ? round2(q * r) : 0;
};

/**
 * Partial / prorated rent.
 * Formula: (amountReceived / totalSale) × (sqft × rentPerSFT) × (remainingDays / totalDaysInMonth)
 * remainingDays = totalDaysInMonth − closureDay + 1
 * e.g. closure Feb 20 → (28 − 20 + 1) = 9 → factor = 9/28
 */
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

/**
 * Auto TDS on rent: 10% (rounded to nearest rupee) when rent ≥ ₹50,000.
 */
const calcTdsOnRent = (rent) => rent >= 50000 ? round0(rent * 0.1) : 0;

/**
 * Resolve TDS applicable flag.
 *   override = 'Y' | 'N' → honour it
 *   override = anything else (auto / undefined) → derive from rent threshold
 */
const resolveTdsApplicable = (override, rent) => {
  if (override === 'Y') return 'Y';
  if (override === 'N') return 'N';
  return rent >= 50000 ? 'Y' : 'N';
};

/* ─── Validation ──────────────────────────────────────────────────────────── */

const validateUpsertBody = (body) => {
  const {
    customerId, totalSaleConsideration, rentalValuePerSFT,
    paymentMode, bankCollection, dateOfPayment, partialPayments,
  } = body;

  if (!customerId)
    return 'Customer ID is required';
  if (!totalSaleConsideration || toFloat(totalSaleConsideration) <= 0)
    return 'Total sale consideration must be a positive number';
  if (!rentalValuePerSFT || toFloat(rentalValuePerSFT) <= 0)
    return 'Rental value per SFT must be a positive number';
  if (!paymentMode || !['full', 'partial'].includes(paymentMode))
    return 'Payment mode must be "full" or "partial"';

  if (paymentMode === 'full') {
    if (bankCollection === undefined || bankCollection === null || bankCollection === '')
      return 'Bank collection is required for full payment';
    if (!dateOfPayment)
      return 'Date of payment is required for full payment';
  }

  if (paymentMode === 'partial') {
    if (!Array.isArray(partialPayments) || partialPayments.length === 0)
      return 'At least one partial payment entry is required';

    for (let i = 0; i < partialPayments.length; i++) {
      const p = partialPayments[i];
      if (p.bankAmount === undefined || p.bankAmount === null || p.bankAmount === '')
        return `Bank amount is required for entry #${i + 1}`;
      if (!p.date)
        return `Payment date is required for entry #${i + 1}`;
      if (!p.paymentClosureDate)
        return `Closure date is required for entry #${i + 1}`;
    }
  }

  return null; // valid
};

/* ─── UPSERT ──────────────────────────────────────────────────────────────── */

const upsertFinancialRecord = async (req, res) => {
  try {
    const {
      customerId,
      totalSaleConsideration,
      rentalValuePerSFT,
      paymentMode,
      paymentClosureDate,
      bankCollection,
      tdsCollection,
      dateOfPayment,
      tdsApplicableOverride,
      partialPayments,
    } = req.body;

    const userId = req.user?.id;

    /* Validate */
    const validationError = validateUpsertBody(req.body);
    if (validationError)
      return res.status(400).json({ success: false, error: validationError });

    /* Customer lookup */
    const customerCheck = await query(
      `SELECT id, sqft FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [customerId]
    );
    if (customerCheck.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    const customerSqft = toFloat(customerCheck.rows[0].sqft);
    const totalSaleNum = toFloat(totalSaleConsideration);

    /* ── Full payment ── */
    let computedBankCollection;
    let computedTdsCollection;
    let computedTotalReceived;
    let computedReceivedPct;
    let computedRent;
    let computedTdsApplicable;
    let computedDateOfPayment;
    let computedPartialPayments = null;

    if (paymentMode === 'full') {
      const bank = toFloat(bankCollection);
      const tds  = toFloat(tdsCollection);

      computedBankCollection = round2(bank);
      computedTdsCollection  = round2(tds);
      computedTotalReceived  = round2(bank + tds);
      computedReceivedPct    = totalSaleNum > 0
        ? round2((computedTotalReceived / totalSaleNum) * 100)
        : 0;
      computedRent           = calcFullRent(customerSqft, rentalValuePerSFT);
      computedTdsApplicable  = resolveTdsApplicable(tdsApplicableOverride, computedRent);
      computedDateOfPayment  = dateOfPayment || null;

    /* ── Partial payments ── */
    } else {
      const enriched = partialPayments.map((p, idx) => {
        const bank        = round2(toFloat(p.bankAmount));
        const tds         = round2(toFloat(p.tdsAmount));
        const amtReceived = round2(bank + tds);
        const closureDate = p.paymentClosureDate || null;
        const rent        = calcPartialRent(amtReceived, closureDate, totalSaleNum, customerSqft, rentalValuePerSFT);
        const rentTds     = calcTdsOnRent(rent);
        const netRent     = round2(rent - rentTds);

        return {
          id:                 p.id ?? idx + 1,
          installment_no:     idx + 1,
          bankAmount:         bank,
          tdsAmount:          tds,
          amountReceived:     amtReceived,
          date:               p.date         || null,
          paymentClosureDate: closureDate,
          rent,
          rentTds,
          netRent,
        };
      });

      const totalBank     = round2(enriched.reduce((s, p) => s + p.bankAmount,     0));
      const totalTds      = round2(enriched.reduce((s, p) => s + p.tdsAmount,      0));
      const totalReceived = round2(enriched.reduce((s, p) => s + p.amountReceived, 0));
      const totalRent     = round2(enriched.reduce((s, p) => s + p.rent,           0));

      computedBankCollection  = totalBank;
      computedTdsCollection   = totalTds;
      computedTotalReceived   = totalReceived;
      computedReceivedPct     = totalSaleNum > 0
        ? round2((totalReceived / totalSaleNum) * 100)
        : 0;
      computedRent            = totalRent;
      computedTdsApplicable   = resolveTdsApplicable(tdsApplicableOverride, computedRent);
      computedDateOfPayment   = enriched.length > 0
        ? (enriched[enriched.length - 1].date || null)
        : null;
      computedPartialPayments = JSON.stringify(enriched);
    }

    /* ── DB upsert ── */
    const existing = await query(
      `SELECT id FROM financial_records WHERE customer_id = $1 AND deleted_at IS NULL`,
      [customerId]
    );

    const params = [
      round2(totalSaleNum),            // $1  total_sale_consideration
      round2(toFloat(rentalValuePerSFT)), // $2  rental_value_per_sft
      paymentMode,                     // $3  payment_mode
      computedBankCollection,          // $4  bank_collection
      computedTdsCollection,           // $5  tds_collection
      computedDateOfPayment,           // $6  date_of_payment
      computedTotalReceived,           // $7  total_received
      computedReceivedPct,             // $8  received_percentage
      computedRent,                    // $9  rent
      computedTdsApplicable,           // $10 tds_applicable
      paymentClosureDate || null,      // $11 payment_closure_date
      computedPartialPayments,         // $12 partial_payments
    ];

    let result;

    if (existing.rows.length > 0) {
      result = await query(
        `UPDATE financial_records SET
           total_sale_consideration = $1,
           rental_value_per_sft     = $2,
           payment_mode             = $3,
           bank_collection          = $4,
           tds_collection           = $5,
           date_of_payment          = $6,
           total_received           = $7,
           received_percentage      = $8,
           rent                     = $9,
           tds_applicable           = $10,
           payment_closure_date     = $11,
           partial_payments         = $12::jsonb,
           updated_by               = $13,
           updated_at               = NOW()
         WHERE customer_id = $14 AND deleted_at IS NULL
         RETURNING *`,
        [...params, userId, customerId]
      );
    } else {
      result = await query(
        `INSERT INTO financial_records (
           total_sale_consideration, rental_value_per_sft, payment_mode,
           bank_collection, tds_collection, date_of_payment,
           total_received, received_percentage, rent, tds_applicable,
           payment_closure_date, partial_payments,
           customer_id, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$14)
         RETURNING *`,
        [...params, customerId, userId]
      );
    }

    const isUpdate = existing.rows.length > 0;
    const row      = result.rows[0];

    return res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: `Financial record ${isUpdate ? 'updated' : 'created'} successfully`,
      data: { ...row, partial_payments: parseJsonb(row.partial_payments) },
    });

  } catch (error) {
    console.error('[upsertFinancialRecord]', error);
    return res.status(500).json({ success: false, error: 'Failed to save financial record' });
  }
};

/* ─── GET ALL ─────────────────────────────────────────────────────────────── */

const getAllFinancialRecords = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, paymentMode } = req.query;
    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset   = (pageNum - 1) * limitNum;

    const params = [];
    let pi    = 1;
    let where = `WHERE fr.deleted_at IS NULL`;

    if (search) {
      where += ` AND (
        c.customer_name ILIKE $${pi} OR
        c.customer_id   ILIKE $${pi} OR
        c.property_name ILIKE $${pi}
      )`;
      params.push(`%${search}%`);
      pi++;
    }

    if (paymentMode && ['full', 'partial'].includes(paymentMode)) {
      where += ` AND fr.payment_mode = $${pi}`;
      params.push(paymentMode);
      pi++;
    }

    const dataParams  = [...params, limitNum, offset];
    const countParams = params.slice(0, pi - 1);

    const [rows, countRes] = await Promise.all([
      query(
        `SELECT fr.*, c.customer_id, c.customer_name, c.property_name, c.floor_no, c.unit_no, c.sqft
         FROM financial_records fr
         JOIN customers c ON fr.customer_id = c.id
         ${where}
         ORDER BY fr.created_at DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        dataParams
      ),
      query(
        `SELECT COUNT(*) FROM financial_records fr
         JOIN customers c ON fr.customer_id = c.id
         ${where}`,
        countParams
      ),
    ]);

    const total      = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(total / limitNum);

    return res.json({
      success: true,
      data: {
        records: rows.rows.map((r) => ({
          ...r,
          partial_payments: parseJsonb(r.partial_payments),
        })),
        pagination: { page: pageNum, limit: limitNum, total, totalPages },
      },
    });

  } catch (error) {
    console.error('[getAllFinancialRecords]', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch financial records' });
  }
};

/* ─── GET BY CUSTOMER ─────────────────────────────────────────────────────── */

const getFinancialRecordByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await query(
      `SELECT fr.*, c.customer_id, c.customer_name, c.property_name, c.floor_no, c.unit_no, c.sqft
       FROM financial_records fr
       JOIN customers c ON fr.customer_id = c.id
       WHERE fr.customer_id = $1 AND fr.deleted_at IS NULL
       LIMIT 1`,
      [customerId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Financial record not found' });

    const row = result.rows[0];
    return res.json({
      success: true,
      data: { ...row, partial_payments: parseJsonb(row.partial_payments) },
    });

  } catch (error) {
    console.error('[getFinancialRecordByCustomer]', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch financial record' });
  }
};

/* ─── GET BY ID ───────────────────────────────────────────────────────────── */

const getFinancialRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT fr.*, c.customer_id, c.customer_name, c.property_name, c.sqft
       FROM financial_records fr
       JOIN customers c ON fr.customer_id = c.id
       WHERE fr.id = $1 AND fr.deleted_at IS NULL
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Financial record not found' });

    const row = result.rows[0];
    return res.json({
      success: true,
      data: { ...row, partial_payments: parseJsonb(row.partial_payments) },
    });

  } catch (error) {
    console.error('[getFinancialRecordById]', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch financial record' });
  }
};

/* ─── DELETE ──────────────────────────────────────────────────────────────── */

const deleteFinancialRecord = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user?.id;

    const result = await query(
      `UPDATE financial_records
       SET deleted_at = NOW(), updated_by = $1
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [userId, id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Financial record not found' });

    return res.json({ success: true, message: 'Financial record deleted successfully' });

  } catch (error) {
    console.error('[deleteFinancialRecord]', error);
    return res.status(500).json({ success: false, error: 'Failed to delete financial record' });
  }
};

/* ─── SUMMARY ─────────────────────────────────────────────────────────────── */

const getFinancialSummary = async (req, res) => {
  try {
    const [overall, tdsBreakdown] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                                                        AS total_records,
          COUNT(*) FILTER (WHERE payment_mode = 'full')                                  AS full_payment_count,
          COUNT(*) FILTER (WHERE payment_mode = 'partial')                               AS partial_payment_count,
          COALESCE(ROUND(SUM(total_sale_consideration)::NUMERIC, 2), 0)                  AS total_sale_consideration,
          COALESCE(ROUND(SUM(bank_collection)::NUMERIC, 2), 0)                           AS total_bank_collection,
          COALESCE(ROUND(SUM(tds_collection)::NUMERIC, 2), 0)                            AS total_tds_collection,
          COALESCE(ROUND(SUM(total_received)::NUMERIC, 2), 0)                            AS total_received,
          COALESCE(ROUND(AVG(received_percentage)::NUMERIC, 2), 0)                       AS avg_received_percentage,
          COALESCE(ROUND(SUM(rent)::NUMERIC, 2), 0)                                      AS total_rent,
          COUNT(*) FILTER (WHERE tds_applicable = 'Y')                                   AS tds_applicable_count,
          COALESCE(
            ROUND(SUM(total_sale_consideration - total_received)
              FILTER (WHERE total_sale_consideration > total_received)::NUMERIC, 2)
          , 0)                                                                            AS total_outstanding
        FROM financial_records
        WHERE deleted_at IS NULL
      `),
      query(`
        SELECT
          tds_applicable,
          COUNT(*)                                        AS count,
          COALESCE(ROUND(SUM(rent)::NUMERIC, 2), 0)      AS total_rent
        FROM financial_records
        WHERE deleted_at IS NULL
        GROUP BY tds_applicable
      `),
    ]);

    return res.json({
      success: true,
      data: {
        summary:      overall.rows[0],
        tdsBreakdown: tdsBreakdown.rows,
      },
    });

  } catch (error) {
    console.error('[getFinancialSummary]', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch summary' });
  }
};

/* ─── Exports ─────────────────────────────────────────────────────────────── */

module.exports = {
  upsertFinancialRecord,
  getAllFinancialRecords,
  getFinancialRecordByCustomer,
  getFinancialRecordById,
  deleteFinancialRecord,
  getFinancialSummary,
};