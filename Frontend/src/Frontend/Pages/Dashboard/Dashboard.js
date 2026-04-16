import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import dashboardService from '../../Services/DashboardService';
import { formatCurrency, formatDate } from '../../Utils/helpers';
import { useAuth } from '../../Context/AuthContext';
import { toast } from 'react-toastify';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    monthlyPayout: 0,
    tdsCurrent: 0,
    upcomingEscalations: 0
  });
  const [loading, setLoading] = useState(true);
  const [upcomingPayments, setUpcomingPayments] = useState([]);
  const [paymentTrends, setPaymentTrends] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch dashboard statistics
      const dashboardData = await dashboardService.getDashboardStats();
      
      // Set statistics
      setStats({
        totalCustomers: parseInt(dashboardData.data.customers.total_customers) || 0,
        activeCustomers: parseInt(dashboardData.data.customers.active_customers) || 0,
        monthlyPayout: parseFloat(dashboardData.data.payments.current_month_net) || 0,
        tdsCurrent: parseFloat(dashboardData.data.payments.current_month_tds) || 0,
        upcomingEscalations: parseInt(dashboardData.data.escalations.upcoming_escalations) || 0
      });

      // Set upcoming payments
      setUpcomingPayments(dashboardData.data.upcomingPayments || []);

      // Fetch payment trends
      const trendsData = await dashboardService.getPaymentTrends(6);
      setPaymentTrends(trendsData.data || []);

      // Fetch recent activity
      const activityData = await dashboardService.getRecentActivity(5);
      setRecentActivity(activityData.data || []);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
      setLoading(false);
    }
  };

  // Prepare chart data
  const paymentTrendData = {
    labels: paymentTrends.map(t => t.month || ''),
    datasets: [
      {
        label: 'Monthly Payouts',
        data: paymentTrends.map(t => parseFloat(t.net_payout) || 0),
        borderColor: 'rgb(13, 110, 253)',
        backgroundColor: 'rgba(13, 110, 253, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  const customerStatusData = {
    labels: ['Active', 'Inactive'],
    datasets: [
      {
        data: [
          stats.activeCustomers,
          stats.totalCustomers - stats.activeCustomers
        ],
        backgroundColor: [
          'rgba(25, 135, 84, 0.8)',
          'rgba(108, 117, 125, 0.8)'
        ],
        borderWidth: 0
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom'
      }
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}>
        <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* Welcome Banner */}
      <div className="mb-4 p-4 bg-gradient bg-primary text-white rounded-3">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h4 className="mb-2">Welcome back, {user?.name}!</h4>
            <p className="mb-0">Here's your overview for today</p>
          </div>
          <button onClick={handleLogout} className="btn btn-light">
            <i className="bi bi-box-arrow-right me-2"></i>Logout
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-shrink-0">
                  <div className="bg-primary bg-opacity-10 text-primary rounded p-3">
                    <i className="bi bi-people fs-4"></i>
                  </div>
                </div>
                <div className="flex-grow-1 ms-3">
                  <div className="text-muted small">Active Customers</div>
                  <h3 className="mb-0">{stats.activeCustomers}</h3>
                  <small className="text-success">
                    <i className="bi bi-graph-up"></i> All active
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-shrink-0">
                  <div className="bg-success bg-opacity-10 text-success rounded p-3">
                    <i className="bi bi-cash-stack fs-4"></i>
                  </div>
                </div>
                <div className="flex-grow-1 ms-3">
                  <div className="text-muted small">Monthly Payout</div>
                  <h3 className="mb-0">{formatCurrency(stats.monthlyPayout)}</h3>
                  <small className="text-muted">
                    <i className="bi bi-calendar-check"></i> Current month
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-shrink-0">
                  <div className="bg-warning bg-opacity-10 text-warning rounded p-3">
                    <i className="bi bi-receipt fs-4"></i>
                  </div>
                </div>
                <div className="flex-grow-1 ms-3">
                  <div className="text-muted small">TDS This Month</div>
                  <h3 className="mb-0">{formatCurrency(stats.tdsCurrent)}</h3>
                  <small className="text-muted">
                    <i className="bi bi-info-circle"></i> 10% deduction
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-shrink-0">
                  <div className="bg-danger bg-opacity-10 text-danger rounded p-3">
                    <i className="bi bi-graph-up-arrow fs-4"></i>
                  </div>
                </div>
                <div className="flex-grow-1 ms-3">
                  <div className="text-muted small">Upcoming Escalations</div>
                  <h3 className="mb-0">{stats.upcomingEscalations}</h3>
                  <small className="text-muted">
                    <i className="bi bi-calendar-event"></i> Next 6 months
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-4 border-0 shadow-sm">
        <div className="card-header bg-white">
          <h5 className="mb-0"><i className="bi bi-lightning me-2"></i>Quick Actions</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <Link to="/customers/new" className="btn btn-outline-primary w-100">
                <i className="bi bi-person-plus me-2"></i>Add Customer
              </Link>
            </div>
            <div className="col-md-3">
              <Link to="/payments/calculator" className="btn btn-outline-success w-100">
                <i className="bi bi-calculator me-2"></i>Payment Calculator
              </Link>
            </div>
            <div className="col-md-3">
              <Link to="/payments/initiate" className="btn btn-outline-info w-100">
                <i className="bi bi-send me-2"></i>Initiate Payment
              </Link>
            </div>
            <div className="col-md-3">
              <Link to="/payments/history" className="btn btn-outline-warning w-100">
                <i className="bi bi-file-earmark-bar-graph me-2"></i>View Reports
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="row g-3 mb-4">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white">
              <h5 className="mb-0"><i className="bi bi-graph-up me-2"></i>Payment Trends</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '300px' }}>
                {paymentTrends.length > 0 ? (
                  <Line data={paymentTrendData} options={chartOptions} />
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100">
                    <p className="text-muted">No data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white">
              <h5 className="mb-0"><i className="bi bi-pie-chart me-2"></i>Customer Status</h5>
            </div>
            <div className="card-body">
              <div style={{ height: '300px' }}>
                <Doughnut data={customerStatusData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Payments & Recent Activity */}
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0"><i className="bi bi-calendar-check me-2"></i>Upcoming Payments</h5>
              <Link to="/payments/schedule" className="btn btn-sm btn-link">View All</Link>
            </div>
            <div className="card-body">
              {upcomingPayments.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <div className="fw-semibold">{payment.customer_name}</div>
                            <small className="text-muted">{payment.customer_code}</small>
                          </td>
                          <td>{formatDate(payment.payment_date)}</td>
                          <td>{formatCurrency(payment.net_payout)}</td>
                          <td>
                            <span className="badge bg-warning text-dark">{payment.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-5">
                  <i className="bi bi-inbox fs-3 text-muted d-block mb-2"></i>
                  <p className="text-muted">No upcoming payments</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white">
              <h5 className="mb-0"><i className="bi bi-clock-history me-2"></i>Recent Activity</h5>
            </div>
            <div className="card-body">
              {recentActivity.length > 0 ? (
                <div className="list-group list-group-flush">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="list-group-item px-0">
                      <div className="d-flex align-items-center">
                        <div className="flex-shrink-0">
                          <div className={`bg-${
                            activity.action.includes('COMPLETED') ? 'success' :
                            activity.action.includes('CREATED') ? 'primary' :
                            'warning'
                          } bg-opacity-10 text-${
                            activity.action.includes('COMPLETED') ? 'success' :
                            activity.action.includes('CREATED') ? 'primary' :
                            'warning'
                          } rounded-circle p-2`}>
                            <i className={`bi bi-${
                              activity.action.includes('COMPLETED') ? 'check-circle' :
                              activity.action.includes('CREATED') ? 'plus-circle' :
                              'graph-up-arrow'
                            }`}></i>
                          </div>
                        </div>
                        <div className="flex-grow-1 ms-3">
                          <div className="fw-semibold">
                            {activity.action.replace(/_/g, ' ').toLowerCase()}
                          </div>
                          <small className="text-muted">{activity.resource_type}</small>
                        </div>
                        <small className="text-muted">
                          {new Date(activity.created_at).toLocaleDateString()}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-5">
                  <i className="bi bi-clock-history fs-3 text-muted d-block mb-2"></i>
                  <p className="text-muted">No recent activity</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;