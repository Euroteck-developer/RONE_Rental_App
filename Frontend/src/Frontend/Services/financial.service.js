import api from '../Config/api';

const financialService = {

  // ── Create or Update Financial Record ───────────────────────────────────────

  upsertFinancialRecord: async (data) => {
    try {
      const response = await api.post('/financial', data);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to save financial record' };
    }
  },

  // ── Get All Financial Records ────────────────────────────────────────────────
  // Params: { page, limit, search, paymentMode }
  getAllFinancialRecords: async (params = {}) => {
    try {
      const response = await api.get('/financial', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch financial records' };
    }
  },

  // ── Get Financial Record by Customer ID ─────────────────────────────────────
  // Returns existing record for the given customer (used to pre-fill the form)
  getByCustomerId: async (customerId) => {
    try {
      const response = await api.get(`/financial/customer/${customerId}`);
      return response.data;
    } catch (error) {
      // Include the HTTP status: 404 = no record yet (safe to start a new form),
      // anything else = real error (caller must NOT show an empty form).
      const data = error.response?.data || { error: 'Failed to load financial record' };
      throw Object.assign(new Error(data.error || 'Failed to load financial record'), data, {
        status: error.response?.status || 0,
      });
    }
  },

  // ── Get Financial Record by Record ID ───────────────────────────────────────
  getFinancialRecordById: async (id) => {
    try {
      const response = await api.get(`/financial/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch financial record' };
    }
  },

  // ── Soft Delete Financial Record ────────────────────────────────────────────
  deleteFinancialRecord: async (id) => {
    try {
      const response = await api.delete(`/financial/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to delete financial record' };
    }
  },

  // ── Filled vs pending financial data per unit ───────────────────────────────
  // Returns: { totalUnits, filled, pending, pendingList: [...] }
  getStatusSummary: async () => {
    try {
      const response = await api.get('/financial/status-summary');
      return response.data.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch financial status' };
    }
  },

  // ── Get Financial Summary / Dashboard Stats ─────────────────────────────────
  // Returns: { summary: { total_records, full_payment_count, partial_payment_count,
  //   total_sale_consideration, total_received, total_rent, tds_applicable_count,
  //   total_outstanding, avg_received_percentage }, tdsBreakdown: [...] }
  getSummary: async () => {
    try {
      const response = await api.get('/financial/summary');
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch financial summary' };
    }
  }
};

export default financialService;