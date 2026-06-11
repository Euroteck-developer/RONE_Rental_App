// 'use strict';

// const { query, transaction } = require('../config/database');

// // ─── Validators ────────────────────────────────────────────────────────────────
// const validatePAN   = (v) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test((v || '').trim());
// const validateIFSC  = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test((v || '').trim());
// const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
// const validatePhone = (v) => /^\d{7,15}$/.test((v || '').replace(/[\s\-().+]/g, ''));
// const validateGST   = (v) =>
//   /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test((v || '').trim());

// const cleanPhone = (v) => (v || '').replace(/[\s\-().+]/g, '');

// // ─── Payout split helpers ──────────────────────────────────────────────────────
// const validatePayoutSplits = (splits) => {
//   if (!Array.isArray(splits) || splits.length === 0)
//     return 'At least one payout bank account is required';
//   for (let i = 0; i < splits.length; i++) {
//     const sp = splits[i];
//     if (!sp.bankAccountNumber?.trim())
//       return `Account #${i + 1}: bank account number is required`;
//     if (!validateIFSC(sp.ifscCode || ''))
//       return `Account #${i + 1}: invalid IFSC code`;
//     const pct = parseFloat(sp.percentage);
//     if (isNaN(pct) || pct <= 0)
//       return `Account #${i + 1}: percentage must be > 0`;
//   }
//   const total = splits.reduce((s, sp) => s + parseFloat(sp.percentage || 0), 0);
//   if (Math.abs(total - 100) > 0.01)
//     return `Payout percentages must sum to 100% (currently ${total.toFixed(2)}%)`;
//   return null;
// };

// const normaliseSplits = (splits) =>
//   splits.map((sp) => ({
//     accountHolderName: (sp.accountHolderName || '').trim(),
//     bankAccountNumber: sp.bankAccountNumber.trim(),
//     ifscCode:          sp.ifscCode.trim().toUpperCase(),
//     bankName:          (sp.bankName || '').trim(),
//     percentage:        parseFloat(parseFloat(sp.percentage).toFixed(4)),
//   }));

// // ─── LOOK UP BY PAN ────────────────────────────────────────────────────────────
// const lookupByPAN = async (req, res) => {
//   try {
//     const pan = (req.params.pan || '').trim().toUpperCase();
//     if (!validatePAN(pan))
//       return res.status(400).json({ success: false, error: 'Invalid PAN format' });

//     const result = await query(
//       `SELECT id, customer_id, customer_name, pan_number,
//               email, phone, nri_status, address, gst_no, cgst, sgst
//        FROM customers
//        WHERE pan_number = $1 AND deleted_at IS NULL
//        LIMIT 1`,
//       [pan]
//     );

//     if (!result.rows.length)
//       return res.status(404).json({ success: false, found: false });

//     const units = await query(
//       `SELECT id, unit_ref, property_name, floor_no, unit_no, status
//        FROM customer_units
//        WHERE customer_id = $1 AND deleted_at IS NULL
//        ORDER BY created_at`,
//       [result.rows[0].id]
//     );

//     return res.json({
//       success: true,
//       found:   true,
//       data:    result.rows[0],
//       units:   units.rows,
//     });
//   } catch (err) {
//     console.error('lookupByPAN:', err);
//     return res.status(500).json({ success: false, error: 'Lookup failed' });
//   }
// };

// // ─── CREATE customer + unit ────────────────────────────────────────────────────
// const createCustomer = async (req, res) => {
//   try {
//     const {
//       customerName, panNumber, gstNo, cgst, sgst,
//       email, phone, address, nriStatus,
//       propertyName, floorNo, unitNo, sqft, dateOfBooking,
//       bankAccountNumber, ifscCode, bankName,
//       agreementType, investmentDate,
//       constructionMonthlyRent, estimatedOccupancyDate,
//       baseRent9Year, actualOccupancyDate,
//       tdsApplicable, status,
//       payoutSplits,
//     } = req.body;

//     const userId  = req.user.id;
//     const panUp   = (panNumber || '').trim().toUpperCase();
//     const gstUp   = (gstNo     || '').trim().toUpperCase().replace(/\s/g, '');
//     const emailLo = (email     || '').trim().toLowerCase();
//     const phoneCl = cleanPhone(phone);

//     if (!customerName?.trim())
//       return res.status(400).json({ success: false, error: 'Customer name is required' });
//     if (!validatePAN(panUp))
//       return res.status(400).json({ success: false, error: 'Invalid PAN format (e.g. ABCDE1234F)' });
//     if (!validateEmail(emailLo))
//       return res.status(400).json({ success: false, error: 'Invalid email address' });
//     if (!validatePhone(phone))
//       return res.status(400).json({ success: false, error: 'Invalid phone number (7–15 digits)' });
//     if (gstUp && !validateGST(gstUp))
//       return res.status(400).json({ success: false, error: 'Invalid GST format' });
//     if (cgst !== undefined && cgst !== '' && (parseFloat(cgst) < 0 || parseFloat(cgst) > 100))
//       return res.status(400).json({ success: false, error: 'CGST must be 0–100' });
//     if (sgst !== undefined && sgst !== '' && (parseFloat(sgst) < 0 || parseFloat(sgst) > 100))
//       return res.status(400).json({ success: false, error: 'SGST must be 0–100' });
//     if (cgst && sgst && parseFloat(cgst) + parseFloat(sgst) > 100)
//       return res.status(400).json({ success: false, error: 'CGST + SGST cannot exceed 100%' });
//     if (!propertyName?.trim())
//       return res.status(400).json({ success: false, error: 'Property name is required' });
//     if (!unitNo?.trim())
//       return res.status(400).json({ success: false, error: 'Unit number is required' });

//     let normSplits;
//     if (Array.isArray(payoutSplits) && payoutSplits.length > 0) {
//       const splitErr = validatePayoutSplits(payoutSplits);
//       if (splitErr) return res.status(400).json({ success: false, error: splitErr });
//       normSplits = normaliseSplits(payoutSplits);
//     } else {
//       if (!bankAccountNumber?.trim())
//         return res.status(400).json({ success: false, error: 'Bank account number is required' });
//       if (!validateIFSC((ifscCode || '').toUpperCase()))
//         return res.status(400).json({ success: false, error: 'Invalid IFSC code' });
//       normSplits = [{
//         accountHolderName: customerName.trim(),
//         bankAccountNumber: bankAccountNumber.trim(),
//         ifscCode:          (ifscCode || '').trim().toUpperCase(),
//         bankName:          bankName || '',
//         percentage:        100,
//       }];
//     }
//     const primarySplit = normSplits[0];

//     let responseData;
//     let isNewCustomer = false;

//     await transaction(async (client) => {
//       const existing = await client.query(
//         `SELECT id, customer_id, customer_name, email, phone
//          FROM customers WHERE pan_number = $1 AND deleted_at IS NULL LIMIT 1`,
//         [panUp]
//       );

//       let customerId;
//       let customerRef;

//       if (existing.rows.length > 0) {
//         const ec = existing.rows[0];
//         if (ec.email !== emailLo)
//           throw Object.assign(
//             new Error('Email does not match existing record for this PAN'),
//             { statusCode: 409 }
//           );
//         if (ec.phone !== phoneCl)
//           throw Object.assign(
//             new Error('Phone does not match existing record for this PAN'),
//             { statusCode: 409 }
//           );
//         customerId  = ec.id;
//         customerRef = ec.customer_id;
//       } else {
//         const dup = await client.query(
//           `SELECT CASE
//              WHEN COUNT(*) FILTER (WHERE email = $1) > 0 THEN 'Email'
//              WHEN COUNT(*) FILTER (WHERE phone = $2) > 0 THEN 'Phone'
//              WHEN COUNT(*) FILTER (WHERE gst_no = $3 AND $3 != '') > 0 THEN 'GST Number'
//            END AS dup
//            FROM customers
//            WHERE deleted_at IS NULL
//              AND (email = $1 OR phone = $2 OR ($3 != '' AND gst_no = $3))`,
//           [emailLo, phoneCl, gstUp || '']
//         );
//         if (dup.rows[0]?.dup)
//           throw Object.assign(
//             new Error(`${dup.rows[0].dup} already exists for a different customer`),
//             { statusCode: 409 }
//           );

//         const ins = await client.query(
//           `INSERT INTO customers (
//              customer_name, pan_number, gst_no, cgst, sgst,
//              email, phone, address, nri_status,
//              bank_account_number, ifsc_code, bank_name, payout_splits,
//              property_name, agreement_type, investment_date,
//              floor_no, unit_no, sqft, date_of_booking,
//              tds_applicable, status,
//              created_by, updated_by
//            ) VALUES (
//              $1,$2,$3,$4,$5,
//              $6,$7,$8,$9,
//              $10,$11,$12,$13::jsonb,
//              $14,$15,$16,
//              $17,$18,$19,$20,
//              $21,$22,
//              $23,$23
//            )
//            RETURNING id, customer_id`,
//           [
//             customerName.trim(), panUp,
//             gstUp || null,
//             cgst !== '' && cgst !== undefined ? parseFloat(cgst) : null,
//             sgst !== '' && sgst !== undefined ? parseFloat(sgst) : null,
//             emailLo, phoneCl, address || null, nriStatus || 'No',
//             primarySplit.bankAccountNumber,
//             primarySplit.ifscCode,
//             primarySplit.bankName || null,
//             JSON.stringify(normSplits),
//             propertyName.trim(),
//             agreementType || 'Construction',
//             investmentDate || null,
//             floorNo || null, unitNo || null, sqft || null, dateOfBooking || null,
//             tdsApplicable || 'N', status || 'Active',
//             userId,
//           ]
//         );
//         customerId    = ins.rows[0].id;
//         customerRef   = ins.rows[0].customer_id;
//         isNewCustomer = true;
//       }

//       const dupUnit = await client.query(
//         `SELECT id FROM customer_units
//          WHERE customer_id    = $1
//            AND property_name  = $2
//            AND LOWER(COALESCE(floor_no,'')) = LOWER($3)
//            AND LOWER(unit_no) = LOWER($4)
//            AND deleted_at IS NULL`,
//         [customerId, propertyName.trim(), floorNo || '', unitNo]
//       );
//       if (dupUnit.rows.length > 0)
//         throw Object.assign(
//           new Error(
//             `Customer already owns unit ${unitNo} on floor ${floorNo || 'N/A'} in ${propertyName}`
//           ),
//           { statusCode: 409 }
//         );

//       const unitIns = await client.query(
//         `INSERT INTO customer_units (
//            customer_id,
//            property_name, floor_no, unit_no, sqft, date_of_booking,
//            bank_account_number, ifsc_code, bank_name, payout_splits,
//            agreement_type, investment_date,
//            construction_monthly_rent, estimated_occupancy_date,
//            base_rent_9_year, actual_occupancy_date,
//            tds_applicable, status,
//            created_by, updated_by
//          ) VALUES (
//            $1,
//            $2,$3,$4,$5,$6,
//            $7,$8,$9,$10::jsonb,
//            $11,$12,
//            $13,$14,
//            $15,$16,
//            $17,$18,
//            $19,$19
//          )
//          RETURNING id, unit_ref`,
//         [
//           customerId,
//           propertyName.trim(), floorNo || null, unitNo,
//           sqft || null, dateOfBooking || null,
//           primarySplit.bankAccountNumber,
//           primarySplit.ifscCode,
//           primarySplit.bankName || null,
//           JSON.stringify(normSplits),
//           agreementType || 'Construction',
//           investmentDate || null,
//           constructionMonthlyRent  || null,
//           estimatedOccupancyDate   || null,
//           baseRent9Year            || null,
//           actualOccupancyDate      || null,
//           tdsApplicable || 'N',
//           status        || 'Active',
//           userId,
//         ]
//       );

//       responseData = {
//         customerId:   customerId,
//         customerRef:  customerRef,
//         unitId:       unitIns.rows[0].id,
//         unitRef:      unitIns.rows[0].unit_ref,
//         isNewCustomer,
//       };

//       await client.query(
//         `INSERT INTO audit_logs
//            (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
//          VALUES ($1,$2,'CUSTOMER_UNIT',$3,$4,$5,$6,'SUCCESS')`,
//         [
//           userId,
//           isNewCustomer ? 'CUSTOMER_AND_UNIT_CREATED' : 'UNIT_ADDED_TO_EXISTING_CUSTOMER',
//           responseData.unitId,
//           JSON.stringify({ customer_ref: responseData.customerRef, unit_ref: responseData.unitRef }),
//           req.ip || '0.0.0.0',
//           req.headers['user-agent'] || 'system',
//         ]
//       );
//     });

//     return res.status(201).json({
//       success: true,
//       message: isNewCustomer
//         ? 'Customer and unit created successfully'
//         : `New unit added to existing customer ${responseData.customerRef}`,
//       data: responseData,
//     });
//   } catch (err) {
//     console.error('createCustomer:', err);
//     if (err.statusCode === 409 || err.code === '23505')
//       return res.status(409).json({ success: false, error: err.message || 'Duplicate record' });
//     return res.status(500).json({ success: false, error: 'Failed to create customer / unit' });
//   }
// };

// // ─── GET ALL ───────────────────────────────────────────────────────────────────
// // ══════════════════════════════════════════════════════════════════════════════
// // FIX: Limit was Math.min(100, ...) — capped at 100 even when frontend
// //      requested 1000. With 226 customers only 100 showed in the dropdown.
// //      Changed to Math.min(5000, ...) so all customers load correctly.
// // ══════════════════════════════════════════════════════════════════════════════
// const getAllCustomers = async (req, res) => {
//   try {
//     const { page = 1, limit = 10, search, status, agreementType, floorNo } = req.query;
//     const pageNum  = Math.max(1, parseInt(page,  10) || 1);
//     const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 10)); // ← WAS 100, NOW 5000
//     const offset   = (pageNum - 1) * limitNum;

//     const params = [];
//     let pi    = 1;
//     let where = `WHERE cu.deleted_at IS NULL AND c.deleted_at IS NULL`;

//     if (search) {
//       where += ` AND (
//         c.customer_name    ILIKE $${pi} OR
//         c.customer_id      ILIKE $${pi} OR
//         c.email            ILIKE $${pi} OR
//         c.pan_number       ILIKE $${pi} OR
//         c.phone            ILIKE $${pi} OR
//         cu.unit_ref        ILIKE $${pi} OR
//         cu.unit_no         ILIKE $${pi} OR
//         cu.property_name   ILIKE $${pi}
//       )`;
//       params.push(`%${search}%`); pi++;
//     }
//     if (status)        { where += ` AND cu.status = $${pi}`;         params.push(status);        pi++; }
//     if (agreementType) { where += ` AND cu.agreement_type = $${pi}`; params.push(agreementType); pi++; }
//     if (floorNo)       { where += ` AND cu.floor_no ILIKE $${pi}`;   params.push(`%${floorNo}%`); pi++; }

//     const base = `
//       FROM customer_units cu
//       JOIN customers c ON cu.customer_id = c.id
//       ${where}`;

//     const [rows, countRes] = await Promise.all([
//       query(
//         `SELECT
//            cu.id,
//            cu.unit_ref,
//            cu.customer_id,
//            cu.property_name,
//            cu.floor_no,
//            cu.unit_no,
//            cu.sqft,
//            cu.date_of_booking,
//            cu.bank_account_number,
//            cu.ifsc_code,
//            cu.bank_name,
//            cu.payout_splits,
//            cu.agreement_type,
//            cu.investment_date,
//            cu.construction_monthly_rent,
//            cu.estimated_occupancy_date,
//            cu.base_rent_9_year,
//            cu.actual_occupancy_date,
//            cu.tds_applicable,
//            cu.status,
//            cu.created_at,
//            c.customer_id   AS customer_ref,
//            c.customer_name,
//            c.pan_number,
//            c.email,
//            c.phone,
//            c.nri_status,
//            c.gst_no,
//            c.cgst,
//            c.sgst,
//            c.address
//          ${base}
//          ORDER BY cu.created_at DESC
//          LIMIT $${pi} OFFSET $${pi + 1}`,
//         [...params, limitNum, offset]
//       ),
//       query(`SELECT COUNT(*) ${base}`, params.slice(0, pi - 1)),
//     ]);

//     return res.json({
//       success: true,
//       data: {
//         customers: rows.rows,
//         pagination: {
//           page: pageNum,
//           limit: limitNum,
//           total: parseInt(countRes.rows[0].count, 10),
//           totalPages: Math.ceil(parseInt(countRes.rows[0].count, 10) / limitNum),
//         },
//       },
//     });
//   } catch (err) {
//     console.error('getAllCustomers:', err);
//     return res.status(500).json({ success: false, error: 'Failed to fetch customers' });
//   }
// };

// // ─── GET BY ID (unit ID) ───────────────────────────────────────────────────────
// const getCustomerById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await query(
//       `SELECT
//          cu.*,
//          c.customer_id   AS customer_ref,
//          c.customer_name,
//          c.pan_number,
//          c.email,
//          c.phone,
//          c.nri_status,
//          c.gst_no,
//          c.cgst,
//          c.sgst,
//          c.address
//        FROM customer_units cu
//        JOIN customers c ON cu.customer_id = c.id
//        WHERE cu.id = $1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL`,
//       [id]
//     );
//     if (!result.rows.length)
//       return res.status(404).json({ success: false, error: 'Unit not found' });
//     return res.json({ success: true, data: result.rows[0] });
//   } catch (err) {
//     console.error('getCustomerById:', err);
//     return res.status(500).json({ success: false, error: 'Failed to fetch unit' });
//   }
// };

// // ─── UPDATE (unit ID) ──────────────────────────────────────────────────────────
// const updateCustomer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       customerName, gstNo, cgst, sgst, address, nriStatus,
//       propertyName, floorNo, unitNo, sqft, dateOfBooking,
//       bankAccountNumber, ifscCode, bankName,
//       agreementType, investmentDate,
//       constructionMonthlyRent, estimatedOccupancyDate,
//       baseRent9Year, actualOccupancyDate,
//       tdsApplicable, status,
//       payoutSplits,
//     } = req.body;

//     const userId = req.user.id;
//     const gstUp  = gstNo ? gstNo.trim().toUpperCase().replace(/\s/g, '') : undefined;

//     if (gstUp && !validateGST(gstUp))
//       return res.status(400).json({ success: false, error: 'Invalid GST format' });
//     if (cgst !== undefined && cgst !== '' && (parseFloat(cgst) < 0 || parseFloat(cgst) > 100))
//       return res.status(400).json({ success: false, error: 'CGST must be 0–100' });
//     if (sgst !== undefined && sgst !== '' && (parseFloat(sgst) < 0 || parseFloat(sgst) > 100))
//       return res.status(400).json({ success: false, error: 'SGST must be 0–100' });

//     let normSplits, primarySplit;
//     if (Array.isArray(payoutSplits) && payoutSplits.length > 0) {
//       const splitErr = validatePayoutSplits(payoutSplits);
//       if (splitErr) return res.status(400).json({ success: false, error: splitErr });
//       normSplits   = normaliseSplits(payoutSplits);
//       primarySplit = normSplits[0];
//     }

//     let updatedUnit;

//     await transaction(async (client) => {
//       const cur = await client.query(
//         `SELECT cu.customer_id FROM customer_units cu
//          WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
//         [id]
//       );
//       if (!cur.rows.length)
//         throw Object.assign(new Error('Unit not found'), { statusCode: 404 });

//       const cid = cur.rows[0].customer_id;

//       if (customerName || gstUp !== undefined || cgst !== undefined || sgst !== undefined || address || nriStatus) {
//         await client.query(
//           `UPDATE customers SET
//              customer_name = COALESCE($1, customer_name),
//              gst_no        = COALESCE($2, gst_no),
//              cgst          = COALESCE($3::numeric, cgst),
//              sgst          = COALESCE($4::numeric, sgst),
//              address       = COALESCE($5, address),
//              nri_status    = COALESCE($6, nri_status),
//              updated_by    = $7,
//              updated_at    = NOW()
//            WHERE id = $8`,
//           [
//             customerName?.trim()  || null,
//             gstUp !== undefined   ? (gstUp || null) : null,
//             cgst  !== undefined && cgst !== '' ? parseFloat(cgst) : null,
//             sgst  !== undefined && sgst !== '' ? parseFloat(sgst) : null,
//             address   || null,
//             nriStatus || null,
//             userId, cid,
//           ]
//         );
//       }

//       const unitRes = await client.query(
//         `UPDATE customer_units SET
//            property_name             = COALESCE($1,  property_name),
//            floor_no                  = COALESCE($2,  floor_no),
//            unit_no                   = COALESCE($3,  unit_no),
//            sqft                      = COALESCE($4,  sqft),
//            date_of_booking           = COALESCE($5,  date_of_booking),
//            bank_account_number       = COALESCE($6,  bank_account_number),
//            ifsc_code                 = COALESCE($7,  ifsc_code),
//            bank_name                 = COALESCE($8,  bank_name),
//            payout_splits             = COALESCE($9::jsonb, payout_splits),
//            agreement_type            = COALESCE($10, agreement_type),
//            investment_date           = COALESCE($11, investment_date),
//            construction_monthly_rent = COALESCE($12, construction_monthly_rent),
//            estimated_occupancy_date  = COALESCE($13, estimated_occupancy_date),
//            base_rent_9_year          = COALESCE($14, base_rent_9_year),
//            actual_occupancy_date     = COALESCE($15, actual_occupancy_date),
//            tds_applicable            = COALESCE($16, tds_applicable),
//            status                    = COALESCE($17, status),
//            updated_by                = $18,
//            updated_at                = NOW()
//          WHERE id = $19 AND deleted_at IS NULL
//          RETURNING *`,
//         [
//           propertyName?.trim()           || null,
//           floorNo                        || null,
//           unitNo                         || null,
//           sqft                           || null,
//           dateOfBooking                  || null,
//           primarySplit?.bankAccountNumber || null,
//           primarySplit?.ifscCode          || null,
//           primarySplit?.bankName          || null,
//           normSplits ? JSON.stringify(normSplits) : null,
//           agreementType                  || null,
//           investmentDate                 || null,
//           constructionMonthlyRent        || null,
//           estimatedOccupancyDate         || null,
//           baseRent9Year                  || null,
//           actualOccupancyDate            || null,
//           tdsApplicable                  || null,
//           status                         || null,
//           userId, id,
//         ]
//       );
//       updatedUnit = unitRes.rows[0];

//       await client.query(
//         `INSERT INTO audit_logs
//            (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
//          VALUES ($1,'UNIT_UPDATED','CUSTOMER_UNIT',$2,$3,$4,$5,'SUCCESS')`,
//         [userId, id, JSON.stringify(req.body), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
//       );
//     });

//     return res.json({ success: true, message: 'Unit updated successfully', data: updatedUnit });
//   } catch (err) {
//     console.error('updateCustomer:', err);
//     if (err.statusCode === 404)
//       return res.status(404).json({ success: false, error: err.message });
//     return res.status(500).json({ success: false, error: 'Failed to update unit' });
//   }
// };

// // ─── DELETE PREVIEW ────────────────────────────────────────────────────────────
// const getCustomerDeletePreview = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const unit = await query(
//       `SELECT cu.unit_ref, cu.property_name, cu.floor_no, cu.unit_no, cu.status,
//               c.customer_name, c.customer_id AS customer_ref
//        FROM customer_units cu
//        JOIN customers c ON cu.customer_id = c.id
//        WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
//       [id]
//     );
//     if (!unit.rows.length)
//       return res.status(404).json({ success: false, error: 'Unit not found' });

//     const [payments, financialRecords, escalations, tdsCerts, otherUnits] = await Promise.all([
//       query(
//         `SELECT COUNT(*) AS cnt,
//                 COALESCE(SUM(gross_amount),0) AS total_gross,
//                 COUNT(*) FILTER (WHERE status='Completed') AS completed,
//                 COUNT(*) FILTER (WHERE status='Pending')   AS pending
//          FROM payments WHERE customer_unit_id=$1 AND deleted_at IS NULL`,
//         [id]
//       ),
//       query(`SELECT COUNT(*) AS cnt FROM financial_records  WHERE customer_unit_id=$1 AND deleted_at IS NULL`, [id]),
//       query(`SELECT COUNT(*) AS cnt FROM escalations        WHERE customer_unit_id=$1 AND deleted_at IS NULL`, [id]),
//       query(`SELECT COUNT(*) AS cnt FROM tds_certificates   WHERE customer_unit_id=$1 AND deleted_at IS NULL`, [id]),
//       query(
//         `SELECT COUNT(*) AS cnt FROM customer_units
//          WHERE customer_id = (SELECT customer_id FROM customer_units WHERE id=$1)
//            AND id != $1 AND deleted_at IS NULL`,
//         [id]
//       ),
//     ]);

//     return res.json({
//       success: true,
//       data: {
//         unit:               unit.rows[0],
//         willDeleteCustomer: parseInt(otherUnits.rows[0].cnt) === 0,
//         relatedData: {
//           payments: {
//             total:      parseInt(payments.rows[0].cnt),
//             completed:  parseInt(payments.rows[0].completed),
//             pending:    parseInt(payments.rows[0].pending),
//             totalGross: parseFloat(payments.rows[0].total_gross),
//           },
//           financialRecords: parseInt(financialRecords.rows[0].cnt),
//           escalations:      parseInt(escalations.rows[0].cnt),
//           tdsCertificates:  parseInt(tdsCerts.rows[0].cnt),
//         },
//       },
//     });
//   } catch (err) {
//     console.error('deletePreview:', err);
//     return res.status(500).json({ success: false, error: 'Failed to fetch deletion preview' });
//   }
// };

// // ─── DELETE UNIT ───────────────────────────────────────────────────────────────
// const deleteCustomer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { confirmDelete } = req.body;
//     const userId = req.user.id;

//     if (!confirmDelete)
//       return res.status(400).json({
//         success: false,
//         error: 'Confirmation required. Send { confirmDelete: true }.',
//       });

//     const unitCheck = await query(
//       `SELECT cu.id, cu.unit_ref, cu.customer_id, cu.property_name, cu.unit_no,
//               c.customer_name, c.customer_id AS customer_ref
//        FROM customer_units cu
//        JOIN customers c ON cu.customer_id = c.id
//        WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
//       [id]
//     );
//     if (!unitCheck.rows.length)
//       return res.status(404).json({ success: false, error: 'Unit not found' });

//     const unit = unitCheck.rows[0];
//     let deletedCustomer = false;

//     await transaction(async (client) => {
//       const { rows: payRows } = await client.query(
//         `SELECT id FROM payments WHERE customer_unit_id=$1`, [id]
//       );
//       const payIds = payRows.map((r) => r.id);
//       if (payIds.length) {
//         await client.query(`DELETE FROM payment_receipts    WHERE payment_id   = ANY($1)`, [payIds]);
//         await client.query(`DELETE FROM payment_batch_items WHERE payment_id   = ANY($1)`, [payIds]);
//         await client.query(`DELETE FROM payments            WHERE customer_unit_id = $1`,  [id]);
//       }

//       const { rows: escRows } = await client.query(
//         `SELECT id FROM escalations WHERE customer_unit_id=$1`, [id]
//       );
//       const escIds = escRows.map((r) => r.id);
//       if (escIds.length) {
//         await client.query(`DELETE FROM escalation_history WHERE escalation_id = ANY($1)`, [escIds]);
//         await client.query(`DELETE FROM escalations        WHERE customer_unit_id = $1`,   [id]);
//       }

//       await client.query(`DELETE FROM tds_certificates  WHERE customer_unit_id=$1`, [id]);
//       await client.query(`DELETE FROM financial_records WHERE customer_unit_id=$1`, [id]);
//       await client.query(`DELETE FROM customer_units    WHERE id=$1`,               [id]);

//       const remaining = await client.query(
//         `SELECT COUNT(*) AS cnt FROM customer_units
//          WHERE customer_id=$1 AND deleted_at IS NULL`,
//         [unit.customer_id]
//       );
//       if (parseInt(remaining.rows[0].cnt) === 0) {
//         await client.query(`DELETE FROM customers WHERE id=$1`, [unit.customer_id]);
//         deletedCustomer = true;
//       }

//       await client.query(
//         `INSERT INTO audit_logs
//            (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
//          VALUES ($1,'UNIT_PERMANENTLY_DELETED','CUSTOMER_UNIT',$2,$3,$4,$5,'SUCCESS')`,
//         [
//           userId, id,
//           JSON.stringify({ unit_ref: unit.unit_ref, customer_ref: unit.customer_ref, deletedCustomer }),
//           req.ip || '0.0.0.0', req.headers['user-agent'] || 'system',
//         ]
//       );
//     });

//     return res.json({
//       success: true,
//       message: deletedCustomer
//         ? `Unit ${unit.unit_ref} and customer "${unit.customer_name}" deleted (last unit)`
//         : `Unit ${unit.unit_ref} deleted. Customer identity retained.`,
//       data: { unitRef: unit.unit_ref, customerRef: unit.customer_ref, deletedCustomer },
//     });
//   } catch (err) {
//     console.error('deleteCustomer:', err);
//     return res.status(500).json({ success: false, error: 'Failed to delete unit' });
//   }
// };

// // ─── STATS ─────────────────────────────────────────────────────────────────────
// const getCustomerStats = async (_req, res) => {
//   try {
//     const [unitStats, customerStats] = await Promise.all([
//       query(`
//         SELECT
//           COUNT(*)                                                     AS total_units,
//           COUNT(*) FILTER (WHERE status='Active')                     AS active_units,
//           COUNT(*) FILTER (WHERE status='Inactive')                   AS inactive_units,
//           COUNT(*) FILTER (WHERE status='Sold')                       AS sold_units,
//           COUNT(*) FILTER (WHERE agreement_type='Construction')       AS construction_period,
//           COUNT(*) FILTER (WHERE agreement_type='9-Year')             AS nine_year_rental,
//           COUNT(*) FILTER (WHERE tds_applicable='Y')                  AS tds_applicable,
//           COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(payout_splits,'[]'::jsonb)) > 1) AS multi_account_units,
//           COALESCE(SUM(construction_monthly_rent),0)                  AS total_construction_rent,
//           COALESCE(SUM(base_rent_9_year),0)                           AS total_base_rent
//         FROM customer_units WHERE deleted_at IS NULL
//       `),
//       query(`
//         SELECT
//           COUNT(*)                                                     AS total_customers,
//           COUNT(*) FILTER (WHERE gst_no IS NOT NULL)                  AS gst_registered,
//           COALESCE(AVG(cgst) FILTER (WHERE cgst IS NOT NULL),0)       AS avg_cgst,
//           COALESCE(AVG(sgst) FILTER (WHERE sgst IS NOT NULL),0)       AS avg_sgst
//         FROM customers WHERE deleted_at IS NULL
//       `),
//     ]);

//     return res.json({ success: true, data: { ...unitStats.rows[0], ...customerStats.rows[0] } });
//   } catch (err) {
//     console.error('getCustomerStats:', err);
//     return res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
//   }
// };

// module.exports = {
//   lookupByPAN,
//   createCustomer,
//   getAllCustomers,
//   getCustomerById,
//   updateCustomer,
//   deleteCustomer,
//   getCustomerDeletePreview,
//   getCustomerStats,
// };

'use strict';

const { query, transaction } = require('../config/database');

// ─── Validators ────────────────────────────────────────────────────────────────
const validatePAN   = (v) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test((v || '').trim());
const validateIFSC  = (v) => /^[A-Z]{4}[A-Z0-9]{7}$/i.test((v || '').trim());
const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
const validatePhone = (v) => /^\d{7,15}$/.test((v || '').replace(/[\s\-().+]/g, ''));
const validateGST   = (v) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test((v || '').trim());
const validateBankAccount = (v) => /^\d{6,20}$/.test((v || '').trim().replace(/\s/g, ''));

const cleanPhone = (v) => (v || '').replace(/[\s\-().+]/g, '');

// ─── Payout split helpers ──────────────────────────────────────────────────────
const validatePayoutSplits = (splits) => {
  if (!Array.isArray(splits) || splits.length === 0)
    return 'At least one payout bank account is required';
  for (let i = 0; i < splits.length; i++) {
    const sp = splits[i];
    if (!sp.bankAccountNumber?.trim())
      return `Account #${i + 1}: bank account number is required`;
    if (!validateBankAccount(sp.bankAccountNumber))
      return `Account #${i + 1}: bank account must be 6–20 digits`;
    if (!validateIFSC(sp.ifscCode || ''))
      return `Account #${i + 1}: invalid IFSC code (must be 11 characters, e.g. SBIN0001234)`;
    const pct = parseFloat(sp.percentage);
    if (isNaN(pct) || pct <= 0)
      return `Account #${i + 1}: percentage must be > 0`;
  }
  const total = splits.reduce((s, sp) => s + parseFloat(sp.percentage || 0), 0);
  if (Math.abs(total - 100) > 0.01)
    return `Payout percentages must sum to 100% (currently ${total.toFixed(2)}%)`;
  return null;
};

const normaliseSplits = (splits) =>
  splits.map((sp) => ({
    accountHolderName: (sp.accountHolderName || '').trim(),
    bankAccountNumber: sp.bankAccountNumber.trim().replace(/\s/g, ''),
    ifscCode:          sp.ifscCode.trim().toUpperCase(),
    bankName:          (sp.bankName || '').trim(),
    percentage:        parseFloat(parseFloat(sp.percentage).toFixed(4)),
  }));

// ─── LOOK UP BY PAN ────────────────────────────────────────────────────────────
const lookupByPAN = async (req, res) => {
  try {
    const pan = (req.params.pan || '').trim().toUpperCase();
    if (!validatePAN(pan))
      return res.status(400).json({ success: false, error: 'Invalid PAN format' });

    const result = await query(
      `SELECT id, customer_id, customer_name, pan_number,
              email, phone, nri_status, address, gst_no, cgst, sgst
       FROM customers
       WHERE pan_number = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [pan]
    );

    if (!result.rows.length)
      return res.status(404).json({ success: false, found: false });

    const units = await query(
      `SELECT id, unit_ref, property_name, floor_no, unit_no, status
       FROM customer_units
       WHERE customer_id = $1 AND deleted_at IS NULL
       ORDER BY created_at`,
      [result.rows[0].id]
    );

    return res.json({
      success: true,
      found:   true,
      data:    result.rows[0],
      units:   units.rows,
    });
  } catch (err) {
    console.error('lookupByPAN:', err);
    return res.status(500).json({ success: false, error: 'Lookup failed' });
  }
};

// ─── CREATE customer + unit ────────────────────────────────────────────────────
const createCustomer = async (req, res) => {
  try {
    const {
      customerName, panNumber, gstNo, cgst, sgst,
      email, phone, address, nriStatus,
      propertyName, floorNo, unitNo, sqft, dateOfBooking,
      bankAccountNumber, ifscCode, bankName,
      agreementType, investmentDate,
      constructionMonthlyRent, estimatedOccupancyDate,
      baseRent9Year, actualOccupancyDate,
      tdsApplicable, status,
      payoutSplits,
    } = req.body;

    const userId  = req.user.id;
    const panUp   = (panNumber || '').trim().toUpperCase();
    const gstUp   = (gstNo     || '').trim().toUpperCase().replace(/\s/g, '');
    const emailLo = (email     || '').trim().toLowerCase();
    const phoneCl = cleanPhone(phone);

    if (!customerName?.trim())
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    if (!validatePAN(panUp))
      return res.status(400).json({ success: false, error: 'Invalid PAN format (e.g. ABCDE1234F)' });
    if (!validateEmail(emailLo))
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    if (!validatePhone(phone))
      return res.status(400).json({ success: false, error: 'Invalid phone number (7–15 digits)' });
    if (gstUp && !validateGST(gstUp))
      return res.status(400).json({ success: false, error: 'Invalid GST format' });

    const cgstVal = (cgst !== undefined && cgst !== null && cgst !== '') ? parseFloat(cgst) : null;
    const sgstVal = (sgst !== undefined && sgst !== null && sgst !== '') ? parseFloat(sgst) : null;

    if (cgstVal !== null && (isNaN(cgstVal) || cgstVal < 0 || cgstVal > 100))
      return res.status(400).json({ success: false, error: 'CGST must be between 0 and 100' });
    if (sgstVal !== null && (isNaN(sgstVal) || sgstVal < 0 || sgstVal > 100))
      return res.status(400).json({ success: false, error: 'SGST must be between 0 and 100' });
    if (cgstVal !== null && sgstVal !== null && cgstVal + sgstVal > 100)
      return res.status(400).json({ success: false, error: 'CGST + SGST cannot exceed 100%' });

    if (!propertyName?.trim())
      return res.status(400).json({ success: false, error: 'Property name is required' });
    if (!unitNo?.trim())
      return res.status(400).json({ success: false, error: 'Unit number is required' });

    let normSplits;
    if (Array.isArray(payoutSplits) && payoutSplits.length > 0) {
      const splitErr = validatePayoutSplits(payoutSplits);
      if (splitErr) return res.status(400).json({ success: false, error: splitErr });
      normSplits = normaliseSplits(payoutSplits);
    } else {
      if (!bankAccountNumber?.trim())
        return res.status(400).json({ success: false, error: 'Bank account number is required' });
      if (!validateBankAccount(bankAccountNumber))
        return res.status(400).json({ success: false, error: 'Bank account number must be 6–20 digits' });
      if (!validateIFSC((ifscCode || '').toUpperCase()))
        return res.status(400).json({ success: false, error: 'Invalid IFSC code (must be 11 characters, e.g. SBIN0001234)' });
      normSplits = [{
        accountHolderName: customerName.trim(),
        bankAccountNumber: bankAccountNumber.trim().replace(/\s/g, ''),
        ifscCode:          (ifscCode || '').trim().toUpperCase(),
        bankName:          bankName || '',
        percentage:        100,
      }];
    }
    const primarySplit = normSplits[0];

    let responseData;
    let isNewCustomer = false;

    await transaction(async (client) => {
      const existing = await client.query(
        `SELECT id, customer_id, customer_name, email, phone
         FROM customers WHERE pan_number = $1 AND deleted_at IS NULL LIMIT 1`,
        [panUp]
      );

      let customerId;
      let customerRef;

      if (existing.rows.length > 0) {
        const ec = existing.rows[0];
        if (ec.email !== emailLo)
          throw Object.assign(
            new Error('Email does not match existing record for this PAN'),
            { statusCode: 409 }
          );
        if (ec.phone !== phoneCl)
          throw Object.assign(
            new Error('Phone does not match existing record for this PAN'),
            { statusCode: 409 }
          );
        customerId  = ec.id;
        customerRef = ec.customer_id;
      } else {
        // Phone is NOT checked for uniqueness — family members / joint investors share numbers.
        // Only email and GST must be unique.
        const dup = await client.query(
          `SELECT CASE
             WHEN COUNT(*) FILTER (WHERE email = $1) > 0 THEN 'Email'
             WHEN COUNT(*) FILTER (WHERE gst_no = $2 AND $2 != '') > 0 THEN 'GST Number'
           END AS dup
           FROM customers
           WHERE deleted_at IS NULL
             AND (email = $1 OR ($2 != '' AND gst_no = $2))`,
          [emailLo, gstUp || '']
        );
        if (dup.rows[0]?.dup)
          throw Object.assign(
            new Error(`${dup.rows[0].dup} already exists for a different customer`),
            { statusCode: 409 }
          );

        const ins = await client.query(
          `INSERT INTO customers (
             customer_name, pan_number, gst_no, cgst, sgst,
             email, phone, address, nri_status,
             bank_account_number, ifsc_code, bank_name, payout_splits,
             property_name, agreement_type, investment_date,
             floor_no, unit_no, sqft, date_of_booking,
             tds_applicable, status,
             created_by, updated_by
           ) VALUES (
             $1,$2,$3,$4,$5,
             $6,$7,$8,$9,
             $10,$11,$12,$13::jsonb,
             $14,$15,$16,
             $17,$18,$19,$20,
             $21,$22,
             $23,$23
           )
           RETURNING id, customer_id`,
          [
            customerName.trim(), panUp,
            gstUp || null, cgstVal, sgstVal,
            emailLo, phoneCl, address || null, nriStatus || 'No',
            primarySplit.bankAccountNumber,
            primarySplit.ifscCode,
            primarySplit.bankName || null,
            JSON.stringify(normSplits),
            propertyName.trim(),
            agreementType || 'Construction',
            investmentDate || null,
            floorNo || null, unitNo || null, sqft || null, dateOfBooking || null,
            tdsApplicable || 'N', status || 'Active',
            userId,
          ]
        );
        customerId    = ins.rows[0].id;
        customerRef   = ins.rows[0].customer_id;
        isNewCustomer = true;
      }

      const dupUnit = await client.query(
        `SELECT id FROM customer_units
         WHERE customer_id    = $1
           AND property_name  = $2
           AND LOWER(COALESCE(floor_no,'')) = LOWER($3)
           AND LOWER(unit_no) = LOWER($4)
           AND deleted_at IS NULL`,
        [customerId, propertyName.trim(), floorNo || '', unitNo]
      );
      if (dupUnit.rows.length > 0)
        throw Object.assign(
          new Error(`Customer already owns unit ${unitNo} on floor ${floorNo || 'N/A'} in ${propertyName}`),
          { statusCode: 409 }
        );

      const unitIns = await client.query(
        `INSERT INTO customer_units (
           customer_id,
           property_name, floor_no, unit_no, sqft, date_of_booking,
           bank_account_number, ifsc_code, bank_name, payout_splits,
           agreement_type, investment_date,
           construction_monthly_rent, estimated_occupancy_date,
           base_rent_9_year, actual_occupancy_date,
           tds_applicable, status,
           created_by, updated_by
         ) VALUES (
           $1,
           $2,$3,$4,$5,$6,
           $7,$8,$9,$10::jsonb,
           $11,$12,
           $13,$14,
           $15,$16,
           $17,$18,
           $19,$19
         )
         RETURNING id, unit_ref`,
        [
          customerId,
          propertyName.trim(), floorNo || null, unitNo,
          sqft || null, dateOfBooking || null,
          primarySplit.bankAccountNumber,
          primarySplit.ifscCode,
          primarySplit.bankName || null,
          JSON.stringify(normSplits),
          agreementType || 'Construction',
          investmentDate || null,
          constructionMonthlyRent  || null,
          estimatedOccupancyDate   || null,
          baseRent9Year            || null,
          actualOccupancyDate      || null,
          tdsApplicable || 'N',
          status        || 'Active',
          userId,
        ]
      );

      responseData = {
        customerId:   customerId,
        customerRef:  customerRef,
        unitId:       unitIns.rows[0].id,
        unitRef:      unitIns.rows[0].unit_ref,
        isNewCustomer,
      };

      await client.query(
        `INSERT INTO audit_logs
           (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,$2,'CUSTOMER_UNIT',$3,$4,$5,$6,'SUCCESS')`,
        [
          userId,
          isNewCustomer ? 'CUSTOMER_AND_UNIT_CREATED' : 'UNIT_ADDED_TO_EXISTING_CUSTOMER',
          responseData.unitId,
          JSON.stringify({ customer_ref: responseData.customerRef, unit_ref: responseData.unitRef }),
          req.ip || '0.0.0.0',
          req.headers['user-agent'] || 'system',
        ]
      );
    });

    return res.status(201).json({
      success: true,
      message: isNewCustomer
        ? 'Customer and unit created successfully'
        : `New unit added to existing customer ${responseData.customerRef}`,
      data: responseData,
    });
  } catch (err) {
    console.error('createCustomer:', err);
    if (err.statusCode === 409 || err.code === '23505')
      return res.status(409).json({ success: false, error: err.message || 'Duplicate record' });
    return res.status(500).json({ success: false, error: err.message || 'Failed to create customer / unit' });
  }
};

// ─── GET ALL ───────────────────────────────────────────────────────────────────
const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, agreementType, floorNo } = req.query;
    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 10));
    const offset   = (pageNum - 1) * limitNum;

    const params = [];
    let pi    = 1;
    let where = `WHERE cu.deleted_at IS NULL AND c.deleted_at IS NULL`;

    if (search) {
      where += ` AND (
        c.customer_name    ILIKE $${pi} OR
        c.customer_id      ILIKE $${pi} OR
        c.email            ILIKE $${pi} OR
        c.pan_number       ILIKE $${pi} OR
        c.phone            ILIKE $${pi} OR
        cu.unit_ref        ILIKE $${pi} OR
        cu.unit_no         ILIKE $${pi} OR
        cu.property_name   ILIKE $${pi}
      )`;
      params.push(`%${search}%`); pi++;
    }
    if (status)        { where += ` AND cu.status = $${pi}`;         params.push(status);        pi++; }
    if (agreementType) { where += ` AND cu.agreement_type = $${pi}`; params.push(agreementType); pi++; }
    if (floorNo)       { where += ` AND cu.floor_no ILIKE $${pi}`;   params.push(`%${floorNo}%`); pi++; }

    const base = `
      FROM customer_units cu
      JOIN customers c ON cu.customer_id = c.id
      ${where}`;

    const [rows, countRes] = await Promise.all([
      query(
        `SELECT
           cu.id,
           cu.unit_ref,
           cu.customer_id,
           cu.property_name,
           cu.floor_no,
           cu.unit_no,
           cu.sqft,
           cu.date_of_booking,
           cu.bank_account_number,
           cu.ifsc_code,
           cu.bank_name,
           cu.payout_splits,
           cu.agreement_type,
           cu.investment_date,
           cu.construction_monthly_rent,
           cu.estimated_occupancy_date,
           cu.base_rent_9_year,
           cu.actual_occupancy_date,
           cu.tds_applicable,
           cu.status,
           cu.created_at,
           c.customer_id   AS customer_ref,
           c.customer_name,
           c.pan_number,
           c.email,
           c.phone,
           c.nri_status,
           c.gst_no,
           c.cgst,
           c.sgst,
           c.address
         ${base}
         ORDER BY cu.created_at DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limitNum, offset]
      ),
      query(`SELECT COUNT(*) ${base}`, params.slice(0, pi - 1)),
    ]);

    return res.json({
      success: true,
      data: {
        customers: rows.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: parseInt(countRes.rows[0].count, 10),
          totalPages: Math.ceil(parseInt(countRes.rows[0].count, 10) / limitNum),
        },
      },
    });
  } catch (err) {
    console.error('getAllCustomers:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
};

// ─── GET BY ID (unit ID) ───────────────────────────────────────────────────────
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT
         cu.*,
         c.customer_id   AS customer_ref,
         c.customer_name,
         c.pan_number,
         c.email,
         c.phone,
         c.nri_status,
         c.gst_no,
         c.cgst,
         c.sgst,
         c.address
       FROM customer_units cu
       JOIN customers c ON cu.customer_id = c.id
       WHERE cu.id = $1 AND cu.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Unit not found' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('getCustomerById:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch unit' });
  }
};

// ─── UPDATE (unit ID) ──────────────────────────────────────────────────────────
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // ── FIX: email and phone were missing from destructuring and never
    //         written to the DB on update — old values always showed after save.
    const {
      customerName, email, phone,
      gstNo, cgst, sgst, address, nriStatus,
      propertyName, floorNo, unitNo, sqft, dateOfBooking,
      bankAccountNumber, ifscCode, bankName,
      agreementType, investmentDate,
      constructionMonthlyRent, estimatedOccupancyDate,
      baseRent9Year, actualOccupancyDate,
      tdsApplicable, status,
      payoutSplits,
    } = req.body;

    const userId  = req.user.id;
    const gstUp   = gstNo  ? gstNo.trim().toUpperCase().replace(/\s/g, '') : undefined;
    // Normalise email and phone the same way create does
    const emailLo = email ? email.trim().toLowerCase() : undefined;
    const phoneCl = phone ? cleanPhone(phone)          : undefined;

    // ── Validate fields that are being changed ───────────────────────────────
    if (emailLo !== undefined && !validateEmail(emailLo))
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    if (phoneCl !== undefined && !validatePhone(phoneCl))
      return res.status(400).json({ success: false, error: 'Invalid phone number (7–15 digits)' });
    if (gstUp   !== undefined && gstUp && !validateGST(gstUp))
      return res.status(400).json({ success: false, error: 'Invalid GST format' });

    const cgstVal = (cgst !== undefined && cgst !== null && cgst !== '') ? parseFloat(cgst) : null;
    const sgstVal = (sgst !== undefined && sgst !== null && sgst !== '') ? parseFloat(sgst) : null;

    if (cgstVal !== null && (isNaN(cgstVal) || cgstVal < 0 || cgstVal > 100))
      return res.status(400).json({ success: false, error: 'CGST must be between 0 and 100' });
    if (sgstVal !== null && (isNaN(sgstVal) || sgstVal < 0 || sgstVal > 100))
      return res.status(400).json({ success: false, error: 'SGST must be between 0 and 100' });

    let normSplits, primarySplit;
    if (Array.isArray(payoutSplits) && payoutSplits.length > 0) {
      const splitErr = validatePayoutSplits(payoutSplits);
      if (splitErr) return res.status(400).json({ success: false, error: splitErr });
      normSplits   = normaliseSplits(payoutSplits);
      primarySplit = normSplits[0];
    }

    let updatedUnit;

    await transaction(async (client) => {
      const cur = await client.query(
        `SELECT cu.customer_id FROM customer_units cu
         WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
        [id]
      );
      if (!cur.rows.length)
        throw Object.assign(new Error('Unit not found'), { statusCode: 404 });

      const cid = cur.rows[0].customer_id;

      // ── FIX: Check if email is being changed to one already used by
      //         a DIFFERENT customer (preserve the uniqueness constraint).
      if (emailLo) {
        const emailConflict = await client.query(
          `SELECT id FROM customers
           WHERE email = $1 AND id != $2 AND deleted_at IS NULL LIMIT 1`,
          [emailLo, cid]
        );
        if (emailConflict.rows.length)
          throw Object.assign(
            new Error('Email already exists for a different customer'),
            { statusCode: 409 }
          );
      }

      // ── FIX: Update customers row — now includes email and phone ────────────
      const needsCustomerUpdate =
        customerName || emailLo    || phoneCl   ||
        gstUp !== undefined        ||
        cgstVal !== null           || sgstVal !== null ||
        address                    || nriStatus;

      if (needsCustomerUpdate) {
        await client.query(
          `UPDATE customers SET
             customer_name = COALESCE($1,  customer_name),
             email         = COALESCE($2,  email),
             phone         = COALESCE($3,  phone),
             gst_no        = COALESCE($4,  gst_no),
             cgst          = COALESCE($5::numeric, cgst),
             sgst          = COALESCE($6::numeric, sgst),
             address       = COALESCE($7,  address),
             nri_status    = COALESCE($8,  nri_status),
             updated_by    = $9,
             updated_at    = NOW()
           WHERE id = $10`,
          [
            customerName?.trim() || null,
            emailLo              || null,   // ← was missing before
            phoneCl              || null,   // ← was missing before
            gstUp !== undefined ? (gstUp || null) : null,
            cgstVal,
            sgstVal,
            address   || null,
            nriStatus || null,
            userId, cid,
          ]
        );
      }

      // ── Update customer_units row ────────────────────────────────────────────
      const unitRes = await client.query(
        `UPDATE customer_units SET
           property_name             = COALESCE($1,  property_name),
           floor_no                  = COALESCE($2,  floor_no),
           unit_no                   = COALESCE($3,  unit_no),
           sqft                      = COALESCE($4,  sqft),
           date_of_booking           = COALESCE($5,  date_of_booking),
           bank_account_number       = COALESCE($6,  bank_account_number),
           ifsc_code                 = COALESCE($7,  ifsc_code),
           bank_name                 = COALESCE($8,  bank_name),
           payout_splits             = COALESCE($9::jsonb, payout_splits),
           agreement_type            = COALESCE($10, agreement_type),
           investment_date           = COALESCE($11, investment_date),
           construction_monthly_rent = COALESCE($12, construction_monthly_rent),
           estimated_occupancy_date  = COALESCE($13, estimated_occupancy_date),
           base_rent_9_year          = COALESCE($14, base_rent_9_year),
           actual_occupancy_date     = COALESCE($15, actual_occupancy_date),
           tds_applicable            = COALESCE($16, tds_applicable),
           status                    = COALESCE($17, status),
           updated_by                = $18,
           updated_at                = NOW()
         WHERE id = $19 AND deleted_at IS NULL
         RETURNING *`,
        [
          propertyName?.trim()            || null,
          floorNo                         || null,
          unitNo                          || null,
          sqft                            || null,
          dateOfBooking                   || null,
          primarySplit?.bankAccountNumber || null,
          primarySplit?.ifscCode          || null,
          primarySplit?.bankName          || null,
          normSplits ? JSON.stringify(normSplits) : null,
          agreementType                   || null,
          investmentDate                  || null,
          constructionMonthlyRent         || null,
          estimatedOccupancyDate          || null,
          baseRent9Year                   || null,
          actualOccupancyDate             || null,
          tdsApplicable                   || null,
          status                          || null,
          userId, id,
        ]
      );
      updatedUnit = unitRes.rows[0];

      await client.query(
        `INSERT INTO audit_logs
           (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'UNIT_UPDATED','CUSTOMER_UNIT',$2,$3,$4,$5,'SUCCESS')`,
        [userId, id, JSON.stringify(req.body), req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']
      );
    });

    // ── FIX: Re-fetch the full joined row so the response always reflects
    //         the latest data (including customer-level fields like phone/email).
    const fresh = await query(
      `SELECT
         cu.*,
         c.customer_id   AS customer_ref,
         c.customer_name,
         c.pan_number,
         c.email,
         c.phone,
         c.nri_status,
         c.gst_no,
         c.cgst,
         c.sgst,
         c.address
       FROM customer_units cu
       JOIN customers c ON cu.customer_id = c.id
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Unit updated successfully',
      data:    fresh.rows[0],
    });
  } catch (err) {
    console.error('updateCustomer:', err);
    if (err.statusCode === 404)
      return res.status(404).json({ success: false, error: err.message });
    if (err.statusCode === 409 || err.code === '23505')
      return res.status(409).json({ success: false, error: err.message || 'Duplicate record' });
    return res.status(500).json({ success: false, error: err.message || 'Failed to update unit' });
  }
};

// ─── DELETE PREVIEW ────────────────────────────────────────────────────────────
const getCustomerDeletePreview = async (req, res) => {
  try {
    const { id } = req.params;

    const unit = await query(
      `SELECT cu.unit_ref, cu.property_name, cu.floor_no, cu.unit_no, cu.status,
              c.customer_name, c.customer_id AS customer_ref
       FROM customer_units cu
       JOIN customers c ON cu.customer_id = c.id
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [id]
    );
    if (!unit.rows.length)
      return res.status(404).json({ success: false, error: 'Unit not found' });

    const [payments, financialRecords, escalations, tdsCerts, otherUnits] = await Promise.all([
      query(
        `SELECT COUNT(*) AS cnt,
                COALESCE(SUM(gross_amount),0) AS total_gross,
                COUNT(*) FILTER (WHERE status='Completed') AS completed,
                COUNT(*) FILTER (WHERE status='Pending')   AS pending
         FROM payments WHERE customer_unit_id=$1 AND deleted_at IS NULL`,
        [id]
      ),
      query(`SELECT COUNT(*) AS cnt FROM financial_records  WHERE customer_unit_id=$1 AND deleted_at IS NULL`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM escalations        WHERE customer_unit_id=$1 AND deleted_at IS NULL`, [id]),
      query(`SELECT COUNT(*) AS cnt FROM tds_certificates   WHERE customer_unit_id=$1 AND deleted_at IS NULL`, [id]),
      query(
        `SELECT COUNT(*) AS cnt FROM customer_units
         WHERE customer_id = (SELECT customer_id FROM customer_units WHERE id=$1)
           AND id != $1 AND deleted_at IS NULL`,
        [id]
      ),
    ]);

    return res.json({
      success: true,
      data: {
        unit:               unit.rows[0],
        willDeleteCustomer: parseInt(otherUnits.rows[0].cnt) === 0,
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
        },
      },
    });
  } catch (err) {
    console.error('deletePreview:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch deletion preview' });
  }
};

// ─── DELETE UNIT ───────────────────────────────────────────────────────────────
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmDelete } = req.body;
    const userId = req.user.id;

    if (!confirmDelete)
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Send { confirmDelete: true }.',
      });

    const unitCheck = await query(
      `SELECT cu.id, cu.unit_ref, cu.customer_id, cu.property_name, cu.unit_no,
              c.customer_name, c.customer_id AS customer_ref
       FROM customer_units cu
       JOIN customers c ON cu.customer_id = c.id
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [id]
    );
    if (!unitCheck.rows.length)
      return res.status(404).json({ success: false, error: 'Unit not found' });

    const unit = unitCheck.rows[0];
    let deletedCustomer = false;

    await transaction(async (client) => {
      const { rows: payRows } = await client.query(
        `SELECT id FROM payments WHERE customer_unit_id=$1`, [id]
      );
      const payIds = payRows.map((r) => r.id);
      if (payIds.length) {
        await client.query(`DELETE FROM payment_receipts    WHERE payment_id   = ANY($1)`, [payIds]);
        await client.query(`DELETE FROM payment_batch_items WHERE payment_id   = ANY($1)`, [payIds]);
        await client.query(`DELETE FROM payments            WHERE customer_unit_id = $1`,  [id]);
      }

      const { rows: escRows } = await client.query(
        `SELECT id FROM escalations WHERE customer_unit_id=$1`, [id]
      );
      const escIds = escRows.map((r) => r.id);
      if (escIds.length) {
        await client.query(`DELETE FROM escalation_history WHERE escalation_id = ANY($1)`, [escIds]);
        await client.query(`DELETE FROM escalations        WHERE customer_unit_id = $1`,   [id]);
      }

      await client.query(`DELETE FROM tds_certificates  WHERE customer_unit_id=$1`, [id]);
      await client.query(`DELETE FROM financial_records WHERE customer_unit_id=$1`, [id]);
      await client.query(`DELETE FROM customer_units    WHERE id=$1`,               [id]);

      const remaining = await client.query(
        `SELECT COUNT(*) AS cnt FROM customer_units
         WHERE customer_id=$1 AND deleted_at IS NULL`,
        [unit.customer_id]
      );
      if (parseInt(remaining.rows[0].cnt) === 0) {
        await client.query(`DELETE FROM customers WHERE id=$1`, [unit.customer_id]);
        deletedCustomer = true;
      }

      await client.query(
        `INSERT INTO audit_logs
           (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1,'UNIT_PERMANENTLY_DELETED','CUSTOMER_UNIT',$2,$3,$4,$5,'SUCCESS')`,
        [
          userId, id,
          JSON.stringify({ unit_ref: unit.unit_ref, customer_ref: unit.customer_ref, deletedCustomer }),
          req.ip || '0.0.0.0', req.headers['user-agent'] || 'system',
        ]
      );
    });

    return res.json({
      success: true,
      message: deletedCustomer
        ? `Unit ${unit.unit_ref} and customer "${unit.customer_name}" deleted (last unit)`
        : `Unit ${unit.unit_ref} deleted. Customer identity retained.`,
      data: { unitRef: unit.unit_ref, customerRef: unit.customer_ref, deletedCustomer },
    });
  } catch (err) {
    console.error('deleteCustomer:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete unit' });
  }
};

// ─── STATS ─────────────────────────────────────────────────────────────────────
const getCustomerStats = async (_req, res) => {
  try {
    const [unitStats, customerStats] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                                     AS total_units,
          COUNT(*) FILTER (WHERE status='Active')                     AS active_units,
          COUNT(*) FILTER (WHERE status='Inactive')                   AS inactive_units,
          COUNT(*) FILTER (WHERE status='Sold')                       AS sold_units,
          COUNT(*) FILTER (WHERE agreement_type='Construction')       AS construction_period,
          COUNT(*) FILTER (WHERE agreement_type='9-Year')             AS nine_year_rental,
          COUNT(*) FILTER (WHERE tds_applicable='Y')                  AS tds_applicable,
          COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(payout_splits,'[]'::jsonb)) > 1) AS multi_account_units,
          COALESCE(SUM(construction_monthly_rent),0)                  AS total_construction_rent,
          COALESCE(SUM(base_rent_9_year),0)                           AS total_base_rent
        FROM customer_units WHERE deleted_at IS NULL
      `),
      query(`
        SELECT
          COUNT(*)                                                     AS total_customers,
          COUNT(*) FILTER (WHERE gst_no IS NOT NULL)                  AS gst_registered,
          COALESCE(AVG(cgst) FILTER (WHERE cgst IS NOT NULL),0)       AS avg_cgst,
          COALESCE(AVG(sgst) FILTER (WHERE sgst IS NOT NULL),0)       AS avg_sgst
        FROM customers WHERE deleted_at IS NULL
      `),
    ]);

    return res.json({ success: true, data: { ...unitStats.rows[0], ...customerStats.rows[0] } });
  } catch (err) {
    console.error('getCustomerStats:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
};

module.exports = {
  lookupByPAN,
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerDeletePreview,
  getCustomerStats,
};