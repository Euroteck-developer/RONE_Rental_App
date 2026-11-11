import api from '../Config/api';
import { fetchAllPages, REPORT_TIMEOUT } from '../Utils/fetchAllPages';

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

  getPaymentHistory: async (params = {}, config = {}) => {
    const res = await api.get('/payments/history', { params, ...config });
    return { success: true, data: res.data.data };
  },

  /**
   * Fetch EVERY payment matching the filters, page by page (no silent truncation).
   * Throws if the number of rows received differs from the server's total.
   */
  getAllPaymentHistory: async (params = {}) => {
    const rows = await fetchAllPages(
      (p) => api.get('/payments/history', { params: { ...params, ...p }, timeout: REPORT_TIMEOUT })
        .then((r) => ({ items: r.data.data.payments || [], pagination: r.data.data.pagination })),
    );
    return rows;
  },

  /** Read-only SQL totals for the same filters — used to reconcile Excel output. */
  getReportTotals: async (params = {}) => {
    const res = await api.get('/payments/report-totals', { params, timeout: REPORT_TIMEOUT });
    return res.data.data;
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

  // Pass customerUnitId so a multi-flat customer sees THIS flat's saved payment,
  // not another flat's record for the same month.
  getPaymentByMonth: async (customerId, rentMonth, customerUnitId = null) => {
    const params = { rentMonth };
    if (customerUnitId) params.customerUnitId = customerUnitId;
    else params.customerId = customerId;
    const res = await api.get('/payments/by-month', { params });
    return { success: true, data: res.data.data };
  },
};

export default paymentService;