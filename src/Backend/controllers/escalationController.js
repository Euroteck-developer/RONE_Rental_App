const { query, transaction } = require('../config/database');

const getAllEscalations = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const offset = (page - 1) * limit;

    let queryText = `
      SELECT 
        e.*,
        c.customer_name,
        c.customer_id  AS customer_code,
        c.property_name,
        c.email, c.phone,
        c.floor_no,
        c.agreement_type,
        c.actual_occupancy_date
      FROM escalations e
      JOIN customers c ON e.customer_id = c.id
      WHERE e.deleted_at IS NULL
        AND c.agreement_type = '9-Year'
        AND c.floor_no = '7'
    `;
    const queryParams = [];
    let p = 1;

    if (status) { queryText += ` AND e.status = $${p}`; queryParams.push(status); p++; }
    if (type)   { queryText += ` AND e.escalation_type = $${p}`; queryParams.push(type); p++; }

    queryText += ` ORDER BY e.escalation_date ASC LIMIT $${p} OFFSET $${p + 1}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await query(queryText, queryParams);

    let countQuery = `
      SELECT COUNT(*) FROM escalations e
      JOIN customers c ON e.customer_id = c.id
      WHERE e.deleted_at IS NULL
        AND c.agreement_type = '9-Year'
        AND c.floor_no = '7'
    `;
    const countParams = [];
    let cp = 1;

    if (status) { countQuery += ` AND e.status = $${cp}`; countParams.push(status); cp++; }
    if (type)   { countQuery += ` AND e.escalation_type = $${cp}`; countParams.push(type); }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        escalations: result.rows,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    console.error('Get escalations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch escalations' });
  }
};

// ── Get upcoming escalations ──────────────────────────────────
const getUpcomingEscalations = async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const result = await query(`
      SELECT
        c.id,
        c.customer_id        AS customer_code,
        c.customer_name,
        c.property_name,
        c.floor_no,
        c.actual_occupancy_date,
        c.agreement_type,
        fr.rent                                                                    AS current_rent,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date))::INTEGER     AS years_elapsed,

        CASE
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6 THEN 'SECOND'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3 THEN 'FIRST'
          ELSE NULL
        END AS escalation_type,

        CASE
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
            THEN ROUND(fr.rent * 1.3225, 2)
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
            THEN ROUND(fr.rent * 1.15, 2)
          ELSE fr.rent
        END AS new_rent,

        CASE
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
            THEN ROUND(fr.rent * 0.3225, 2)
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
            THEN ROUND(fr.rent * 0.15, 2)
          ELSE 0
        END AS increase_amount,

        CASE
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
            THEN '7-9 Years (32.25% increase)'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
            THEN '4-6 Years (15% increase)'
          ELSE '1-3 Years (Base rent)'
        END AS escalation_period,

        CASE
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
            THEN c.actual_occupancy_date + INTERVAL '6 years'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
            THEN c.actual_occupancy_date + INTERVAL '3 years'
          ELSE NULL
        END AS escalation_date

      FROM customers c
      -- ← Use financial_records.rent (same source as payment calculator)
      JOIN (
        SELECT DISTINCT ON (customer_id)
          customer_id, rent
        FROM financial_records
        WHERE deleted_at IS NULL
        ORDER BY customer_id, created_at DESC
      ) fr ON c.id = fr.customer_id
      WHERE c.deleted_at IS NULL
        AND c.status             = 'Active'
        AND c.agreement_type     = '9-Year'
        AND c.floor_no           = '7'
        AND c.actual_occupancy_date IS NOT NULL
        AND fr.rent              IS NOT NULL
        AND fr.rent              > 0
        AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
        AND (
          c.actual_occupancy_date + INTERVAL '3 years' <= CURRENT_DATE + ($1 || ' months')::INTERVAL
          OR
          c.actual_occupancy_date + INTERVAL '6 years' <= CURRENT_DATE + ($1 || ' months')::INTERVAL
        )
      ORDER BY escalation_date ASC
    `, [months]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get upcoming escalations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch upcoming escalations' });
  }
};

const getEscalationByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await query(`
      SELECT e.*, c.customer_name, c.customer_id AS customer_code,
             c.property_name, c.floor_no, c.agreement_type, c.actual_occupancy_date
      FROM escalations e
      JOIN customers c ON e.customer_id = c.id
      WHERE e.customer_id = $1 AND e.deleted_at IS NULL
        AND c.agreement_type = '9-Year' AND c.floor_no = '7'
      ORDER BY e.escalation_date DESC
    `, [customerId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get customer escalations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch customer escalations' });
  }
};

const createEscalation = async (req, res) => {
  try {
    const { customerId, escalationType, escalationPeriod, escalationDate,
            currentRent, newRent, increaseAmount, increasePercentage } = req.body;
    const userId = req.user.id;

    const customerCheck = await query(
      `SELECT id, agreement_type, floor_no, actual_occupancy_date
       FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [customerId]
    );
    if (customerCheck.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Customer not found' });

    const customer = customerCheck.rows[0];
    if (customer.agreement_type !== '9-Year')
      return res.status(400).json({ success: false, error: 'Escalations only apply to 9-Year rental customers' });
    if (customer.floor_no !== '7')
      return res.status(400).json({ success: false, error: 'Escalations only apply to Floor 7 customers' });
    if (!customer.actual_occupancy_date)
      return res.status(400).json({ success: false, error: 'Customer must have an actual occupancy date' });

    const dupCheck = await query(
      `SELECT id FROM escalations WHERE customer_id = $1 AND escalation_type = $2 AND deleted_at IS NULL`,
      [customerId, escalationType]
    );
    if (dupCheck.rows.length > 0)
      return res.status(400).json({ success: false, error: `A ${escalationType} escalation already exists for this customer` });

    const result = await query(`
      INSERT INTO escalations (customer_id, escalation_type, escalation_period, escalation_date,
        current_rent, new_rent, increase_amount, increase_percentage, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending') RETURNING *
    `, [customerId, escalationType, escalationPeriod, escalationDate,
        currentRent, newRent, increaseAmount, increasePercentage]);

    await query(`
      INSERT INTO escalation_history (escalation_id, customer_id, action, previous_rent, new_rent, change_amount, performed_by)
      VALUES ($1,$2,'CREATED',$3,$4,$5,$6)
    `, [result.rows[0].id, customerId, currentRent, newRent, increaseAmount, userId]);

    res.status(201).json({ success: true, message: 'Escalation created successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Create escalation error:', error);
    res.status(500).json({ success: false, error: 'Failed to create escalation' });
  }
};

const applyEscalation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await transaction(async (client) => {
      const { rows } = await client.query(`
        SELECT e.*, c.base_rent_9_year, c.agreement_type,
               c.actual_occupancy_date, c.customer_name, c.floor_no
        FROM escalations e
        JOIN customers c ON e.customer_id = c.id
        WHERE e.id = $1 AND e.deleted_at IS NULL
      `, [id]);

      if (rows.length === 0) throw new Error('Escalation not found');
      const esc = rows[0];

      if (esc.agreement_type !== '9-Year') throw new Error('Escalations only apply to 9-Year rental customers');
      if (esc.floor_no !== '7')            throw new Error('Escalations only apply to Floor 7 customers');
      if (!esc.actual_occupancy_date)      throw new Error('Customer must have an actual occupancy date');
      if (esc.status === 'Applied')        throw new Error('Escalation has already been applied');

      await client.query(
        `UPDATE customers SET base_rent_9_year = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3`,
        [esc.new_rent, userId, esc.customer_id]
      );
      await client.query(
        `UPDATE escalations SET status = 'Applied', applied_date = NOW(), applied_by = $1, updated_at = NOW() WHERE id = $2`,
        [userId, id]
      );
      await client.query(`
        INSERT INTO escalation_history (escalation_id, customer_id, action, previous_rent, new_rent, change_amount, performed_by, notes)
        VALUES ($1,$2,'APPLIED',$3,$4,$5,$6,$7)
      `, [id, esc.customer_id, esc.current_rent, esc.new_rent, esc.increase_amount, userId,
          `Applied: ${esc.escalation_period} | Occupancy: ${esc.actual_occupancy_date}`]);
      await client.query(`
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
        VALUES ($1,'ESCALATION_APPLIED','ESCALATION',$2,$3,$4,$5,'SUCCESS')
      `, [userId, id,
          JSON.stringify({ customer_name: esc.customer_name, old_rent: esc.current_rent, new_rent: esc.new_rent }),
          req.ip || '0.0.0.0', req.headers['user-agent'] || 'system']);
    });

    res.json({ success: true, message: 'Escalation applied successfully' });
  } catch (error) {
    console.error('Apply escalation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to apply escalation' });
  }
};

const getEscalationTimeline = async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await query(`
      SELECT h.*, u.name AS performed_by_name, c.agreement_type, c.actual_occupancy_date, c.floor_no
      FROM escalation_history h
      LEFT JOIN users u ON h.performed_by = u.id
      LEFT JOIN customers c ON h.customer_id = c.id
      WHERE h.customer_id = $1 AND c.agreement_type = '9-Year' AND c.floor_no = '7'
      ORDER BY h.performed_at DESC
    `, [customerId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get escalation timeline error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch escalation timeline' });
  }
};

const getEscalationStats = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE e.status = 'Pending')         AS pending_escalations,
        COUNT(*) FILTER (WHERE e.status = 'Applied')         AS applied_escalations,
        COUNT(*) FILTER (WHERE e.escalation_type = 'FIRST')  AS first_escalations,
        COUNT(*) FILTER (WHERE e.escalation_type = 'SECOND') AS second_escalations,
        SUM(e.increase_amount)                               AS total_increase_amount,
        AVG(e.increase_percentage)                           AS avg_increase_percentage,
        COUNT(*) FILTER (
          WHERE e.escalation_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 months'
        )                                                    AS upcoming_escalations,
        COUNT(DISTINCT c.id) FILTER (WHERE c.agreement_type = '9-Year')       AS total_9year_customers,
        COUNT(DISTINCT c.id) FILTER (WHERE c.agreement_type = 'Construction') AS total_construction_customers,
        COUNT(DISTINCT c.id) FILTER (
          WHERE c.agreement_type = '9-Year' AND c.floor_no = '7' AND c.actual_occupancy_date IS NOT NULL
        ) AS customers_with_occupancy_date,
        COUNT(DISTINCT c.id) FILTER (
          WHERE c.agreement_type = '9-Year' AND c.floor_no = '7'
            AND c.actual_occupancy_date IS NOT NULL
            AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
        ) AS customers_eligible_for_escalation
      FROM escalations e
      RIGHT JOIN customers c ON e.customer_id = c.id AND e.deleted_at IS NULL
      WHERE c.deleted_at IS NULL AND c.status = 'Active'
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get escalation stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch escalation statistics' });
  }
};

// ── KEY FIX: generate BOTH FIRST and SECOND for customers with >= 6 years ──
const generateEscalations = async (req, res) => {
  try {
    const userId = req.user.id;
    const generatedEscalations = [];
    const skipped = [];

    await transaction(async (client) => {
      // ← JOIN financial_records instead of using c.base_rent_9_year
      const { rows: eligible } = await client.query(`
        SELECT
          c.id,
          c.customer_id          AS customer_code,
          c.customer_name,
          c.property_name,
          c.floor_no,
          c.actual_occupancy_date,
          fr.rent                AS current_rent,         -- ← from financial_records
          EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date))
            ::INTEGER            AS years_elapsed,

          CASE
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6 THEN 'SECOND'
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3 THEN 'FIRST'
            ELSE NULL
          END AS escalation_type,

          CASE
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
              THEN ROUND(fr.rent * 1.3225, 2)
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
              THEN ROUND(fr.rent * 1.15, 2)
            ELSE fr.rent
          END AS new_rent,

          CASE
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
              THEN ROUND(fr.rent * 0.3225, 2)
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
              THEN ROUND(fr.rent * 0.15, 2)
            ELSE 0
          END AS increase_amount,

          CASE
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6
              THEN '7-9 Years (32.25% increase)'
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
              THEN '4-6 Years (15% increase)'
            ELSE '1-3 Years (Base rent)'
          END AS escalation_period,

          CASE
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 6 THEN 32.25
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3 THEN 15
            ELSE 0
          END AS increase_percentage

        FROM customers c
        -- ← INNER JOIN: skip customers with no financial record at all
        JOIN (
          SELECT DISTINCT ON (customer_id)
            customer_id, rent
          FROM financial_records
          WHERE deleted_at IS NULL
          ORDER BY customer_id, created_at DESC
        ) fr ON c.id = fr.customer_id
        WHERE c.deleted_at          IS NULL
          AND c.status              = 'Active'
          AND c.agreement_type      = '9-Year'
          AND c.floor_no            = '7'
          AND c.actual_occupancy_date IS NOT NULL
          AND fr.rent               IS NOT NULL
          AND fr.rent               > 0
          AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.actual_occupancy_date)) >= 3
      `);

      if (eligible.length === 0) {
        throw new Error('No eligible customers found. Ensure Floor 7 / 9-Year customers have a financial record with rent > 0 and actual occupancy date set.');
      }

      // Build FIRST + SECOND pairs for customers with >= 6 years
      const escalationsToCreate = [];

      for (const customer of eligible) {
        if (customer.years_elapsed >= 3) {
          const occupancy = new Date(customer.actual_occupancy_date);
          const firstDate = new Date(occupancy);
          firstDate.setFullYear(firstDate.getFullYear() + 3);

          escalationsToCreate.push({
            customer,
            escalation_type:      'FIRST',
            escalation_period:    '4-6 Years (15% increase)',
            escalation_date:      firstDate.toISOString().split('T')[0],
            new_rent:             Math.round(customer.current_rent * 1.15 * 100) / 100,
            increase_amount:      Math.round(customer.current_rent * 0.15 * 100) / 100,
            increase_percentage:  15,
          });
        }

        if (customer.years_elapsed >= 6) {
          const occupancy   = new Date(customer.actual_occupancy_date);
          const secondDate  = new Date(occupancy);
          secondDate.setFullYear(secondDate.getFullYear() + 6);

          escalationsToCreate.push({
            customer,
            escalation_type:      'SECOND',
            escalation_period:    '7-9 Years (32.25% increase)',
            escalation_date:      secondDate.toISOString().split('T')[0],
            new_rent:             Math.round(customer.current_rent * 1.3225 * 100) / 100,
            increase_amount:      Math.round(customer.current_rent * 0.3225 * 100) / 100,
            increase_percentage:  32.25,
          });
        }
      }

      for (const item of escalationsToCreate) {
        const { customer, ...fields } = item;

        // Skip if already exists for this customer + type
        const { rows: existing } = await client.query(`
          SELECT id, status FROM escalations
          WHERE customer_id     = $1
            AND escalation_type = $2
            AND deleted_at      IS NULL
        `, [customer.id, fields.escalation_type]);

        if (existing.length > 0) {
          skipped.push({
            id:     customer.id,
            name:   customer.customer_name,
            type:   fields.escalation_type,
            reason: `${fields.escalation_type} escalation already exists (status: ${existing[0].status})`
          });
          continue;
        }

        const { rows: [newEsc] } = await client.query(`
          INSERT INTO escalations (
            customer_id, escalation_type, escalation_period, escalation_date,
            current_rent, new_rent, increase_amount, increase_percentage, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending')
          RETURNING *
        `, [
          customer.id,
          fields.escalation_type,
          fields.escalation_period,
          fields.escalation_date,
          customer.current_rent,      // ← financial_records.rent
          fields.new_rent,
          fields.increase_amount,
          fields.increase_percentage
        ]);

        await client.query(`
          INSERT INTO escalation_history (
            escalation_id, customer_id, action,
            previous_rent, new_rent, change_amount, performed_by, notes
          ) VALUES ($1,$2,'CREATED',$3,$4,$5,$6,$7)
        `, [
          newEsc.id,
          customer.id,
          customer.current_rent,
          fields.new_rent,
          fields.increase_amount,
          userId,
          `Auto-generated | ${fields.escalation_type} | ${fields.escalation_period} | Occupancy: ${customer.actual_occupancy_date} | Years elapsed: ${customer.years_elapsed}`
        ]);

        generatedEscalations.push({
          ...newEsc,
          customer_name:     customer.customer_name,
          customer_code:     customer.customer_code,
          property_name:     customer.property_name,
          years_elapsed:     customer.years_elapsed,
          escalation_period: fields.escalation_period
        });
      }

      await client.query(`
        INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status
        ) VALUES ($1,'ESCALATIONS_GENERATED','ESCALATION',NULL,$2,$3,$4,'SUCCESS')
      `, [
        userId,
        JSON.stringify({ generated: generatedEscalations.length, skipped: skipped.length, total_eligible: eligible.length }),
        req.ip || '0.0.0.0',
        req.headers['user-agent'] || 'system'
      ]);
    });

    res.status(201).json({
      success: true,
      message: `${generatedEscalations.length} escalation(s) generated, ${skipped.length} skipped`,
      data: {
        generated:      generatedEscalations,
        generatedCount: generatedEscalations.length,
        skipped,
        skippedCount:   skipped.length
      }
    });
  } catch (error) {
    console.error('Generate escalations error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate escalations' });
  }
};

module.exports = {
  getAllEscalations, 
  getUpcomingEscalations, 
  getEscalationByCustomer,
  createEscalation, 
  applyEscalation, 
  getEscalationTimeline,
  getEscalationStats, 
  generateEscalations
};

