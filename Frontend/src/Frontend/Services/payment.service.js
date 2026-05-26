import api from '../Config/api';

const paymentService = {

  // ── KEY FIX: Pass customerUnitId so backend can load the correct
  //    payment_closure_date → prorated rent works correctly ──────────────────
  calculatePayment: async (customerId, paymentDate, customerUnitId = null) => {
    const payload = { paymentDate };
    if (customerUnitId) {
      payload.customerUnitId = customerUnitId;   // ← unit-based lookup (prorated)
    } else if (customerId) {
      payload.customerId = customerId;            // ← legacy fallback
    }
    const res = await api.post('/payments/calculate', payload);
    return res.data.data;
  },

  getPaymentSchedule: async (params = {}) => {
    const res = await api.get('/payments/schedule', { params });
    return { success: true, data: res.data.data };
  },

  getPaymentById: async (id) => {
    const res = await api.get(`/payments/${id}`);
    return { success: true, data: res.data.data };
  },

  createPaymentSchedule: async (customerIds, scheduledDate) => {
    const res = await api.post('/payments/schedule', { customerIds, scheduledDate });
    return { success: true, data: res.data.data, message: res.data.message };
  },

  generateMonthlyPayments: async (data) => {
    const res = await api.post('/payments/generate-monthly', data);
    return res.data;
  },

  initiatePaymentBatch: async (paymentIds) => {
    const res = await api.post('/payments/batch/initiate', { paymentIds });
    return { success: true, data: res.data.data, message: res.data.message };
  },

  createEasebuzzOrder: async (paymentIds) => {
    const res = await api.post('/payments/easebuzz/create-order', { paymentIds });
    return { success: true, data: res.data.data };
  },

  verifyEasebuzzPayment: async (verificationData) => {
    const res = await api.post('/payments/easebuzz/verify', verificationData);
    return { success: true, data: res.data.data, message: res.data.message };
  },

  reportEasebuzzFailure: async (paymentIds, txnid, easebuzzResponse) => {
    try {
      await api.post('/payments/easebuzz/failure', { paymentIds, txnid, easebuzzResponse });
    } catch { /* best-effort — don't block UX */ }
  },

  completePayment: async (paymentId, transactionReference, bankReference) => {
    const res = await api.put(`/payments/${paymentId}/complete`, { transactionReference, bankReference });
    return { success: true, data: res.data.data, message: res.data.message };
  },

  resetOrderCreated: (paymentIds) =>
    api.post('/payments/reset-order-created', { paymentIds }).then((r) => r.data),

  getPaymentHistory: async (params = {}) => {
    const res = await api.get('/payments/history', { params });
    return { success: true, data: res.data.data };
  },

  getPaymentStats: async (month = null, agreementType = null) => {
    const params = {};
    if (month)         params.month         = month;
    if (agreementType) params.agreementType = agreementType;
    const res = await api.get('/payments/stats', { params });
    return { success: true, data: res.data.data };
  },

  savePaymentWithAdjustment: (payload) =>
    api.post('/payments/save-with-adjustment', payload),

  getSavedAdjustments: async (params = {}) => {
    const res = await api.get('/payments/saved-adjustments', { params });
    return { success: true, data: res.data.data };
  },

  getPaymentByMonth: async (customerId, rentMonth) => {
    const res = await api.get('/payments/by-month', { params: { customerId, rentMonth } });
    return { success: true, data: res.data.data };
  },
};

export default paymentService;