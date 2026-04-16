import api from '../Config/api';

const paymentService = {
  calculatePayment: async (customerId, paymentDate) => {
    const res = await api.post('/payments/calculate', { customerId, paymentDate });
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

  // ── Easebuzz gateway ──────────────────────────────────────────────────────
  // Step 1: Backend generates hash, calls Easebuzz initiateLink, returns access_key
  createEasebuzzOrder: async (paymentIds) => {
    const res = await api.post('/payments/easebuzz/create-order', { paymentIds });
    return { success: true, data: res.data.data };
  },

  // Step 2: Frontend calls this after EasebuzzCheckout.onResponse fires with status=success
  verifyEasebuzzPayment: async (verificationData) => {
    // verificationData: { paymentIds, easebuzzResponse }
    const res = await api.post('/payments/easebuzz/verify', verificationData);
    return { success: true, data: res.data.data, message: res.data.message };
  },

  // Step 3 (on failure/dismiss): Notify backend to reset payment status
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
    if (month) params.month = month;
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