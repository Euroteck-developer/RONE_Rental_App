import api from '../Config/api';

const dashboardService = {
  // Get all dashboard statistics
  getDashboardStats: async () => {
    try {
      const response = await api.get('/dashboard/stats');
      return { success: true, data: response.data.data };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch dashboard statistics'
      };
    }
  },

  // Get payment trends
  getPaymentTrends: async (months = 6) => {
    try {
      const response = await api.get('/dashboard/trends', { params: { months } });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch payment trends'
      };
    }
  },

  // Get recent activity
  getRecentActivity: async (limit = 10) => {
    try {
      const response = await api.get('/dashboard/activity', { params: { limit } });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch recent activity'
      };
    }
  },

  // Get monthly summary
  getMonthlySummary: async (year) => {
    try {
      const response = await api.get('/dashboard/monthly-summary', { params: { year } });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch monthly summary'
      };
    }
  }
};

export default dashboardService;