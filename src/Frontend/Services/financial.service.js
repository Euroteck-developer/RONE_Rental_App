import api from '../Config/api';

const financialService = {

  // ── Create or Update Financial Record ───────────────────────────────────────
  // Payload for full payment:
  //   { customerId, totalSaleConsideration, rentalValuePerSFT, paymentClosureDate,
  //     paymentMode: 'full', bankCollection, tdsCollection, dateOfPayment,
  //     rent, tdsApplicable }
  // Payload for partial payment:
  //   { customerId, totalSaleConsideration, rentalValuePerSFT, paymentClosureDate,
  //     paymentMode: 'partial', partialPayments: [{ amountReceived, date, rent }],
  //     tdsApplicable }
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
      // 404 means no record yet — throw so caller can handle gracefully
      throw error.response?.data || { error: 'Financial record not found' };
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