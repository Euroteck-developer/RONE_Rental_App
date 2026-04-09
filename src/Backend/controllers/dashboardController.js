const { query } = require('../config/database');

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

    // Get all statistics in parallel
    const [customerStats, paymentStats, escalationStats, upcomingPayments] = await Promise.all([
      // Customer Statistics
      query(`
        SELECT 
          COUNT(*) as total_customers,
          COUNT(*) FILTER (WHERE status = 'Active') as active_customers,
          COUNT(*) FILTER (WHERE status = 'Inactive') as inactive_customers,
          COUNT(*) FILTER (WHERE agreement_type = 'Construction') as construction_period,
          COUNT(*) FILTER (WHERE agreement_type = '9-Year') as nine_year_rental
        FROM customers 
        WHERE deleted_at IS NULL
      `),

      // Payment Statistics
      query(`
        SELECT 
          COUNT(*) as total_payments,
          COUNT(*) FILTER (WHERE status = 'Completed') as completed_payments,
          COUNT(*) FILTER (WHERE status = 'Pending') as pending_payments,
          SUM(gross_amount) as total_gross,
          SUM(tds_amount) as total_tds,
          SUM(net_payout) as total_net,
          SUM(CASE WHEN status = 'Completed' THEN net_payout ELSE 0 END) as total_paid,
          SUM(CASE WHEN payment_month = $1 THEN gross_amount ELSE 0 END) as current_month_gross,
          SUM(CASE WHEN payment_month = $1 THEN tds_amount ELSE 0 END) as current_month_tds,
          SUM(CASE WHEN payment_month = $1 THEN net_payout ELSE 0 END) as current_month_net
        FROM payments 
        WHERE deleted_at IS NULL
      `, [currentMonth]),

      // Escalation Statistics (customers who will escalate in next 6 months)
      query(`
        SELECT COUNT(*) as upcoming_escalations
        FROM customers 
        WHERE deleted_at IS NULL 
          AND status = 'Active'
          AND actual_occupancy_date IS NOT NULL
          AND actual_occupancy_date + INTERVAL '3 years' BETWEEN NOW() AND NOW() + INTERVAL '6 months'
      `),

      // Upcoming Payments (next 5)
      query(`
        SELECT 
          p.id, p.payment_id, p.payment_date, p.gross_amount, p.tds_amount, p.net_payout, p.status,
          c.customer_name, c.customer_id as customer_code, c.property_name
        FROM payments p
        JOIN customers c ON p.customer_id = c.id
        WHERE p.deleted_at IS NULL 
          AND p.status IN ('Pending', 'Approved')
          AND p.scheduled_date >= CURRENT_DATE
        ORDER BY p.scheduled_date ASC
        LIMIT 5
      `)
    ]);

    res.json({
      success: true,
      data: {
        customers: customerStats.rows[0],
        payments: paymentStats.rows[0],
        escalations: escalationStats.rows[0],
        upcomingPayments: upcomingPayments.rows
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics' });
  }
};

// Get payment trends (for chart)
const getPaymentTrends = async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const result = await query(`
      SELECT 
        TO_CHAR(payment_date, 'Mon') as month,
        TO_CHAR(payment_date, 'YYYY-MM') as month_key,
        SUM(gross_amount) as gross_amount,
        SUM(tds_amount) as tds_amount,
        SUM(net_payout) as net_payout,
        COUNT(*) as payment_count
      FROM payments
      WHERE deleted_at IS NULL
        AND payment_date >= CURRENT_DATE - INTERVAL '${parseInt(months)} months'
      GROUP BY month_key, month
      ORDER BY month_key ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get payment trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment trends' });
  }
};

// Get recent activity
const getRecentActivity = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await query(`
      SELECT 
        id, user_id, action, resource_type, resource_id, 
        changes, created_at, status
      FROM audit_logs
      WHERE action IN (
        'PAYMENT_COMPLETED', 'CUSTOMER_CREATED', 'PAYMENT_BATCH_INITIATED',
        'CUSTOMER_UPDATED', 'PAYMENT_CREATED'
      )
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent activity' });
  }
};

// Get monthly summary
const getMonthlySummary = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    const result = await query(`
      SELECT 
        TO_CHAR(payment_date, 'Month') as month_name,
        EXTRACT(MONTH FROM payment_date) as month_number,
        COUNT(*) as total_payments,
        SUM(gross_amount) as total_gross,
        SUM(tds_amount) as total_tds,
        SUM(net_payout) as total_net,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending_count
      FROM payments
      WHERE deleted_at IS NULL
        AND EXTRACT(YEAR FROM payment_date) = $1
      GROUP BY month_number, month_name
      ORDER BY month_number ASC
    `, [year]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get monthly summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monthly summary' });
  }
};

module.exports = {
  getDashboardStats,
  getPaymentTrends,
  getRecentActivity,
  getMonthlySummary
};