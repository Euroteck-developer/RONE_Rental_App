'use strict';

const { query, transaction } = require('../config/database');

// ─── Validation helpers ────────────────────────────────────────────────────────
const validatePAN   = (pan)   => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test((pan  || '').trim());
const validateIFSC  = (ifsc)  => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test((ifsc || '').trim());
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
const validatePhone = (phone) => {
  const cleaned = (phone || '').replace(/[\s\-().+]/g, '');
  return /^\d{7,15}$/.test(cleaned);
};
const validateGST = (gst) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test((gst || '').trim());

const cleanPhone = (phone) => (phone || '').replace(/[\s\-().+]/g, '');

// ─── Payout-split helpers ──────────────────────────────────────────────────────

/**
 * Validate the payoutSplits array submitted by the frontend.
 * Returns an error string or null.
 */
const validatePayoutSplits = (splits) => {
  if (!Array.isArray(splits) || splits.length === 0)
    return 'At least one payout bank account is required';

  for (let i = 0; i < splits.length; i++) {
    const sp = splits[i];
    if (!sp.bankAccountNumber?.trim())
      return `Account #${i + 1}: bank account number is required`;
    if (!validateIFSC(sp.ifscCode || ''))
      return `Account #${i + 1}: invalid IFSC code (e.g. SBIN0001234)`;
    const pct = parseFloat(sp.percentage);
    if (isNaN(pct) || pct <= 0)
      return `Account #${i + 1}: percentage must be > 0`;
  }

  const total = splits.reduce((s, sp) => s + parseFloat(sp.percentage || 0), 0);
  if (Math.abs(total - 100) > 0.01)
    return `Payout percentages must sum to 100% (currently ${total.toFixed(2)}%)`;

  return null;
};

/**
 * Normalise each split entry (uppercase IFSC, trim, round percentage).
 */
const normaliseSplits = (splits) =>
  splits.map((sp) => ({
    accountHolderName: (sp.accountHolderName || '').trim(),
    bankAccountNumber: sp.bankAccountNumber.trim(),
    ifscCode:          sp.ifscCode.trim().toUpperCase(),
    bankName:          (sp.bankName || '').trim(),
    percentage:        parseFloat(parseFloat(sp.percentage).toFixed(4)),
  }));

// ─── CREATE Customer ───────────────────────────────────────────────────────────
const createCustomer = async (req, res) => {
  try {
    const {
      customerName, panNumber, gstNo, cgst, sgst, email, phone, address,
      dateOfBooking, floorNo, unitNo, sqft,
      bankAccountNumber, ifscCode, bankName,   // kept for backward-compat
      propertyName, agreementType, investmentDate,
      constructionMonthlyRent, estimatedOccupancyDate,
      baseRent9Year, actualOccupancyDate,
      tdsApplicable, status, nriStatus,
      payoutSplits,                            // ← NEW: array of split objects
    } = req.body;

    const userId = req.user.id;

    // Normalise scalars
    const panUp   = (panNumber || '').trim().toUpperCase();
    const ifscUp  = (ifscCode  || '').trim().toUpperCase().replace(/\s/g, '');
    const gstUp   = (gstNo     || '').trim().toUpperCase().replace(/\s/g, '');
    const emailLo = (email     || '').trim().toLowerCase();
    const phoneCl = cleanPhone(phone);

    // Scalar field validations
    if (!customerName?.trim())
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    if (!validatePAN(panUp))
      return res.status(400).json({ success: false, error: 'Invalid PAN format (e.g. ABCDE1234F)' });
    if (!validateEmail(emailLo))
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    if (!validatePhone(phone))
      return res.status(400).json({ success: false, error: 'Invalid phone number (7–15 digits)' });
    if (gstUp && !validateGST(gstUp))
      return res.status(400).json({ success: false, error: 'Invalid GST number format (e.g. 29ABCDE1234F1Z5)' });
    if (cgst !== null && cgst !== undefined && cgst !== '' && (parseFloat(cgst) < 0 || parseFloat(cgst) > 100))
      return res.status(400).json({ success: false, error: 'CGST must be between 0 and 100' });
    if (sgst !== null && sgst !== undefined && sgst !== '' && (parseFloat(sgst) < 0 || parseFloat(sgst) > 100))
      return res.status(400).json({ success: false, error: 'SGST must be between 0 and 100' });
    if (cgst && sgst && (parseFloat(cgst) + parseFloat(sgst)) > 100)
      return res.status(400).json({ success: false, error: 'CGST + SGST cannot exceed 100%' });

    // Payout split validation
    // Fall back to the legacy single-account fields when no splits array is provided
    let normSplits;
    if (Array.isArray(payoutSplits) && payoutSplits.length > 0) {
      const splitErr = validatePayoutSplits(payoutSplits);
      if (splitErr) return res.status(400).json({ success: false, error: splitErr });
      normSplits = normaliseSplits(payoutSplits);
    } else {
      // Legacy path: wrap the single bank fields into a 100 % split
      if (!bankAccountNumber?.trim())
        return res.status(400).json({ success: false, error: 'Bank account number is required' });
      if (!validateIFSC(ifscUp))
        return res.status(400).json({ success: false, error: 'Invalid IFSC code (e.g. SBIN0001234)' });
      normSplits = [{
        accountHolderName: customerName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        ifscCode:          ifscUp,
        bankName:          bankName || '',
        percentage:        100,
      }];
    }

    // Primary bank account = first split entry (backward-compat columns)
    const primarySplit = normSplits[0];

    // Duplicate check
    const duplicateCheck = await query(
      `SELECT
         CASE
           WHEN COUNT(*) FILTER (WHERE pan_number = $1) > 0 THEN 'PAN'
           WHEN COUNT(*) FILTER (WHERE email = $2)      > 0 THEN 'Email'
           WHEN COUNT(*) FILTER (WHERE phone = $3)      > 0 THEN 'Phone'
           WHEN COUNT(*) FILTER (WHERE gst_no = $4 AND gst_no IS NOT NULL AND $4 != '') > 0 THEN 'GST Number'
         END AS duplicate_field
       FROM customers
       WHERE deleted_at IS NULL
         AND (
           pan_number = $1 OR email = $2 OR phone = $3
           OR ($4 != '' AND gst_no = $4)
         )`,
      [panUp, emailLo, phoneCl, gstUp || '']
    );

    if (duplicateCheck.rows[0]?.duplicate_field)
      return res.status(409).json({
        success: false,
        error: `${duplicateCheck.rows[0].duplicate_field} already exists`,
      });

    // Insert
    const result = await query(
      `INSERT INTO customers (
        customer_name, pan_number, gst_no, cgst, sgst,
        email, phone, address,
        date_of_booking, floor_no, unit_no, sqft,
        bank_account_number, ifsc_code, bank_name,
        property_name, agreement_type, investment_date,
        construction_monthly_rent, estimated_occupancy_date,
        base_rent_9_year, actual_occupancy_date,
        tds_applicable, status, nri_status,
        payout_splits,
        created_by, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,
        $19,$20,
        $21,$22,
        $23,$24,$25,
        $26::jsonb,
        $27,$27
      )
      RETURNING id, customer_id, customer_name, pan_number, gst_no, cgst, sgst,
                email, phone, property_name, status, payout_splits, created_at`,
      [
        customerName.trim(),
        panUp,
        gstUp  || null,
        cgst !== '' && cgst !== undefined ? parseFloat(cgst) : null,
        sgst !== '' && sgst !== undefined ? parseFloat(sgst) : null,
        emailLo,
        phoneCl,
        address || null,
        dateOfBooking           || null,
        floorNo                 || null,
        unitNo                  || null,
        sqft                    || null,
        primarySplit.bankAccountNumber,
        primarySplit.ifscCode,
        primarySplit.bankName   || null,
        propertyName?.trim(),
        agreementType,
        investmentDate          || null,
        constructionMonthlyRent || null,
        estimatedOccupancyDate  || null,
        baseRent9Year           || null,
        actualOccupancyDate     || null,
        tdsApplicable  || 'N',
        status         || 'Active',
        nriStatus      || 'No',
        JSON.stringify(normSplits),
        userId,
      ]
    );

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'CUSTOMER_CREATED','CUSTOMER',$2,$3,$4,$5,'SUCCESS')`,
      [userId, result.rows[0].id,
       JSON.stringify({ customer_id: result.rows[0].customer_id, name: customerName, splits: normSplits.length }),
       req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
    );

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: result.rows[0],
    });

  } catch (error) {
    console.error('Create customer error:', error);
    if (error.code === '23505')
      return res.status(409).json({ success: false, error: 'A record with the same unique value already exists' });
    res.status(500).json({ success: false, error: 'Failed to create customer' });
  }
};

// ─── GET ALL Customers ─────────────────────────────────────────────────────────
const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, agreementType, floorNo } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let queryText = `
      SELECT
        id, customer_id, customer_name, pan_number, gst_no, cgst, sgst,
        email, phone, date_of_booking, floor_no, unit_no, sqft,
        property_name, agreement_type, investment_date,
        construction_monthly_rent, base_rent_9_year,
        tds_applicable, status, nri_status,
        bank_account_number, ifsc_code, bank_name,
        payout_splits,
        created_at
      FROM customers
      WHERE deleted_at IS NULL
    `;
    const queryParams = [];
    let pi = 1;

    if (search) {
      queryText += ` AND (
        customer_name ILIKE $${pi} OR customer_id ILIKE $${pi} OR
        email         ILIKE $${pi} OR pan_number  ILIKE $${pi} OR
        gst_no        ILIKE $${pi} OR phone       ILIKE $${pi}
      )`;
      queryParams.push(`%${search}%`);
      pi++;
    }
    if (status)        { queryText += ` AND status = $${pi}`;         queryParams.push(status);        pi++; }
    if (agreementType) { queryText += ` AND agreement_type = $${pi}`; queryParams.push(agreementType); pi++; }
    if (floorNo)       { queryText += ` AND floor_no ILIKE $${pi}`;   queryParams.push(`%${floorNo}%`); pi++; }

    queryText += ` ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`;
    queryParams.push(parseInt(limit), offset);

    const result = await query(queryText, queryParams);

    let countQuery = 'SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL';
    const countParams = []; let cp = 1;
    if (search)        { countQuery += ` AND (customer_name ILIKE $${cp} OR customer_id ILIKE $${cp} OR email ILIKE $${cp} OR pan_number ILIKE $${cp} OR gst_no ILIKE $${cp} OR phone ILIKE $${cp})`; countParams.push(`%${search}%`); cp++; }
    if (status)        { countQuery += ` AND status = $${cp}`;         countParams.push(status);        cp++; }
    if (agreementType) { countQuery += ` AND agreement_type = $${cp}`; countParams.push(agreementType); cp++; }
    if (floorNo)       { countQuery += ` AND floor_no ILIKE $${cp}`;   countParams.push(`%${floorNo}%`); cp++; }

    const countResult    = await query(countQuery, countParams);
    const totalCustomers = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        customers: result.rows,
        pagination: {
          page:       parseInt(page),
          limit:      parseInt(limit),
          total:      totalCustomers,
          totalPages: Math.ceil(totalCustomers / parseInt(limit)),
        },
      },
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
};

// ─── GET Customer by ID ────────────────────────────────────────────────────────
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customer' });
  }
};

// ─── UPDATE Customer ───────────────────────────────────────────────────────────
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customerName, panNumber, gstNo, cgst, sgst, email, phone, address,
      dateOfBooking, floorNo, unitNo, sqft,
      bankAccountNumber, ifscCode, bankName,
      propertyName, agreementType, investmentDate,
      constructionMonthlyRent, estimatedOccupancyDate,
      baseRent9Year, actualOccupancyDate,
      tdsApplicable, status, nriStatus,
      payoutSplits,                              // ← NEW
    } = req.body;

    const userId  = req.user.id;
    const panUp   = panNumber ? panNumber.trim().toUpperCase()                   : undefined;
    const gstUp   = gstNo     ? gstNo.trim().toUpperCase().replace(/\s/g, '')   : gstNo;
    const emailLo = email     ? email.trim().toLowerCase()                        : undefined;
    const phoneCl = phone     ? cleanPhone(phone)                                 : undefined;

    // Scalar validations
    if (panUp   && !validatePAN(panUp))
      return res.status(400).json({ success: false, error: 'Invalid PAN format' });
    if (emailLo && !validateEmail(emailLo))
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    if (phone   && !validatePhone(phone))
      return res.status(400).json({ success: false, error: 'Invalid phone number (7–15 digits)' });
    if (gstUp   && !validateGST(gstUp))
      return res.status(400).json({ success: false, error: 'Invalid GST number format' });
    if (cgst !== null && cgst !== undefined && cgst !== '' && (parseFloat(cgst) < 0 || parseFloat(cgst) > 100))
      return res.status(400).json({ success: false, error: 'CGST must be between 0 and 100' });
    if (sgst !== null && sgst !== undefined && sgst !== '' && (parseFloat(sgst) < 0 || parseFloat(sgst) > 100))
      return res.status(400).json({ success: false, error: 'SGST must be between 0 and 100' });
    if (cgst && sgst && (parseFloat(cgst) + parseFloat(sgst)) > 100)
      return res.status(400).json({ success: false, error: 'CGST + SGST cannot exceed 100%' });

    // Payout splits validation (if provided)
    let normSplits;
    let primarySplit;
    if (Array.isArray(payoutSplits) && payoutSplits.length > 0) {
      const splitErr = validatePayoutSplits(payoutSplits);
      if (splitErr) return res.status(400).json({ success: false, error: splitErr });
      normSplits   = normaliseSplits(payoutSplits);
      primarySplit = normSplits[0];
    }

    // Duplicate check (only for changed unique fields)
    if (panUp || emailLo || phoneCl || gstUp !== undefined) {
      const duplicateCheck = await query(
        `SELECT CASE
           WHEN COUNT(*) FILTER (WHERE pan_number = $1 AND $1 != '') > 0 THEN 'PAN'
           WHEN COUNT(*) FILTER (WHERE email = $2      AND $2 != '') > 0 THEN 'Email'
           WHEN COUNT(*) FILTER (WHERE phone = $3      AND $3 != '') > 0 THEN 'Phone'
           WHEN COUNT(*) FILTER (WHERE gst_no = $5 AND gst_no IS NOT NULL AND $5 != '') > 0 THEN 'GST Number'
         END AS duplicate_field
         FROM customers
         WHERE deleted_at IS NULL AND id != $4
           AND (
             ($1 != '' AND pan_number = $1) OR
             ($2 != '' AND email = $2) OR
             ($3 != '' AND phone = $3) OR
             ($5 != '' AND gst_no = $5)
           )`,
        [panUp || '', emailLo || '', phoneCl || '', id, gstUp || '']
      );
      if (duplicateCheck.rows[0]?.duplicate_field)
        return res.status(409).json({
          success: false,
          error: `${duplicateCheck.rows[0].duplicate_field} already exists`,
        });
    }

    const result = await query(
      `UPDATE customers SET
        customer_name             = COALESCE($1,  customer_name),
        pan_number                = COALESCE($2,  pan_number),
        gst_no                    = COALESCE($3,  gst_no),
        cgst                      = COALESCE($4,  cgst),
        sgst                      = COALESCE($5,  sgst),
        email                     = COALESCE($6,  email),
        phone                     = COALESCE($7,  phone),
        address                   = COALESCE($8,  address),
        date_of_booking           = COALESCE($9,  date_of_booking),
        floor_no                  = COALESCE($10, floor_no),
        unit_no                   = COALESCE($11, unit_no),
        sqft                      = COALESCE($12, sqft),
        bank_account_number       = COALESCE($13, bank_account_number),
        ifsc_code                 = COALESCE($14, ifsc_code),
        bank_name                 = COALESCE($15, bank_name),
        property_name             = COALESCE($16, property_name),
        agreement_type            = COALESCE($17, agreement_type),
        investment_date           = COALESCE($18, investment_date),
        construction_monthly_rent = COALESCE($19, construction_monthly_rent),
        estimated_occupancy_date  = COALESCE($20, estimated_occupancy_date),
        base_rent_9_year          = COALESCE($21, base_rent_9_year),
        actual_occupancy_date     = COALESCE($22, actual_occupancy_date),
        tds_applicable            = COALESCE($23, tds_applicable),
        status                    = COALESCE($24, status),
        nri_status                = COALESCE($25, nri_status),
        payout_splits             = COALESCE($26::jsonb, payout_splits),
        updated_by                = $27,
        updated_at                = NOW()
      WHERE id = $28 AND deleted_at IS NULL
      RETURNING *`,
      [
        customerName?.trim()                                           || null,
        panUp                                                          || null,
        gstUp !== undefined ? (gstUp || null)                         : null,
        cgst !== '' && cgst !== undefined ? parseFloat(cgst)          : null,
        sgst !== '' && sgst !== undefined ? parseFloat(sgst)          : null,
        emailLo                                                        || null,
        phoneCl                                                        || null,
        address                                                        || null,
        dateOfBooking                                                  || null,
        floorNo                                                        || null,
        unitNo                                                         || null,
        sqft                                                           || null,
        primarySplit?.bankAccountNumber                                || null,
        primarySplit?.ifscCode                                         || null,
        primarySplit?.bankName                                         || null,
        propertyName?.trim()                                           || null,
        agreementType                                                  || null,
        investmentDate                                                 || null,
        constructionMonthlyRent                                        || null,
        estimatedOccupancyDate                                         || null,
        baseRent9Year                                                  || null,
        actualOccupancyDate                                            || null,
        tdsApplicable                                                  || null,
        status                                                         || null,
        nriStatus                                                      || null,
        normSplits ? JSON.stringify(normSplits)                        : null,
        userId, id,
      ]
    );

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
       VALUES ($1,'CUSTOMER_UPDATED','CUSTOMER',$2,$3,$4,$5,'SUCCESS')`,
      [userId, id,
       JSON.stringify({ ...req.body, payoutSplits: normSplits }),
       req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
    );

    res.json({ success: true, message: 'Customer updated successfully', data: result.rows[0] });

  } catch (error) {
    console.error('Update customer error:', error);
    if (error.code === '23505')
      return res.status(409).json({ success: false, error: 'A record with the same unique value already exists' });
    res.status(500).json({ success: false, error: 'Failed to update customer' });
  }
};

// ─── GET Customer Delete Preview ───────────────────────────────────────────────
const getCustomerDeletePreview = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await query(
      `SELECT customer_id, customer_name, email, agreement_type, status FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!customer.rows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    const [payments, financialRecords, escalations, tdsCerts, receipts] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt, COALESCE(SUM(gross_amount),0) AS total_gross, COUNT(*) FILTER (WHERE status='Completed') AS completed, COUNT(*) FILTER (WHERE status='Pending') AS pending FROM payments WHERE customer_id=$1 AND deleted_at IS NULL`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM financial_records WHERE customer_id=$1 AND deleted_at IS NULL`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM escalations WHERE customer_id=$1 AND deleted_at IS NULL`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM tds_certificates WHERE customer_id=$1 AND deleted_at IS NULL`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM payment_receipts pr JOIN payments p ON pr.payment_id=p.id WHERE p.customer_id=$1`, [id]),
    ]);

    res.json({
      success: true,
      data: {
        customer: customer.rows[0],
        relatedData: {
          payments: {
            total:      parseInt(payments.rows[0].cnt),
            completed:  parseInt(payments.rows[0].completed),
            pending:    parseInt(payments.rows[0].pending),
            totalGross: parseFloat(payments.rows[0].total_gross),
          },
          financialRecords: parseInt(financialRecords.rows[0].cnt),
          escalations:      parseInt(escalations.rows[0].cnt),
          tdsCertificates:  parseInt(tdsCerts.rows[0].cnt),
          receipts:         parseInt(receipts.rows[0].cnt),
        },
      },
    });
  } catch (error) {
    console.error('Delete preview error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch deletion preview' });
  }
};

// ─── HARD DELETE Customer + all related data ───────────────────────────────────
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmDelete } = req.body;
    const userId = req.user.id;

    if (!confirmDelete)
      return res.status(400).json({ success: false, error: 'Deletion confirmation required. Send { confirmDelete: true }.' });

    const customerCheck = await query(
      `SELECT customer_id, customer_name, email FROM customers WHERE id=$1 AND deleted_at IS NULL`,
      [id]
    );
    if (!customerCheck.rows.length)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    const { customer_id, customer_name, email } = customerCheck.rows[0];
    let deletionSummary = {};

    await transaction(async (client) => {
      const { rows: paymentRows } = await client.query(`SELECT id FROM payments WHERE customer_id=$1`, [id]);
      const paymentIds = paymentRows.map((r) => r.id);

      if (paymentIds.length > 0) {
        const { rowCount: receiptCount } = await client.query(`DELETE FROM payment_receipts WHERE payment_id=ANY($1)`, [paymentIds]);
        deletionSummary.receipts = receiptCount;
        await client.query(`DELETE FROM payment_batch_items WHERE payment_id=ANY($1)`, [paymentIds]);
      }

      const { rowCount: payCount } = await client.query(`DELETE FROM payments WHERE customer_id=$1`, [id]);
      deletionSummary.payments = payCount;

      const { rows: escalationRows } = await client.query(`SELECT id FROM escalations WHERE customer_id=$1`, [id]);
      const escalationIds = escalationRows.map((r) => r.id);
      if (escalationIds.length > 0) {
        const { rowCount: escHistCount } = await client.query(`DELETE FROM escalation_history WHERE escalation_id=ANY($1)`, [escalationIds]);
        deletionSummary.escalationHistory = escHistCount;
      }

      const { rowCount: escCount } = await client.query(`DELETE FROM escalations WHERE customer_id=$1`, [id]);
      deletionSummary.escalations = escCount;
      const { rowCount: tdsCount } = await client.query(`DELETE FROM tds_certificates WHERE customer_id=$1`, [id]);
      deletionSummary.tdsCertificates = tdsCount;
      const { rowCount: frCount } = await client.query(`DELETE FROM financial_records WHERE customer_id=$1`, [id]);
      deletionSummary.financialRecords = frCount;

      await client.query(`DELETE FROM customers WHERE id=$1`, [id]);

      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'CUSTOMER_PERMANENTLY_DELETED','CUSTOMER',$2,$3,$4,$5,'SUCCESS')`,
        [userId, id, JSON.stringify({ customer_id, customer_name, email, deletionSummary }),
         req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
      );
    });

    res.json({
      success: true,
      message: `Customer "${customer_name}" and all related data permanently deleted.`,
      data: { customerId: customer_id, customerName: customer_name, deletionSummary },
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete customer. Please try again.' });
  }
};

// ─── GET Customer Statistics ───────────────────────────────────────────────────
const getCustomerStats = async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*)                                                  AS total_customers,
        COUNT(*) FILTER (WHERE status='Active')                  AS active_customers,
        COUNT(*) FILTER (WHERE status='Inactive')                AS inactive_customers,
        COUNT(*) FILTER (WHERE agreement_type='Construction')    AS construction_period,
        COUNT(*) FILTER (WHERE agreement_type='9-Year')          AS nine_year_rental,
        COUNT(*) FILTER (WHERE tds_applicable='Y')               AS tds_applicable,
        COUNT(*) FILTER (WHERE gst_no IS NOT NULL)               AS gst_registered,
        COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(payout_splits,'[]'::jsonb)) > 1) AS multi_account_customers,
        COALESCE(SUM(construction_monthly_rent),0)               AS total_construction_rent,
        COALESCE(SUM(base_rent_9_year),0)                        AS total_base_rent,
        COALESCE(AVG(cgst) FILTER (WHERE cgst IS NOT NULL),0)    AS avg_cgst,
        COALESCE(AVG(sgst) FILTER (WHERE sgst IS NOT NULL),0)    AS avg_sgst
       FROM customers WHERE deleted_at IS NULL`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
};

module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerDeletePreview,
  getCustomerStats,
};