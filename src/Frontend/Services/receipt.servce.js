import api from './api.service';

const receiptService = {
  // Get all receipts
  getAllReceipts: async (params = {}) => {
    const response = await api.get('/receipts', { params });
    return response.data;
  },

  // Get receipt by ID
  getReceiptById: async (id) => {
    const response = await api.get(`/receipts/${id}`);
    return response.data;
  },

  // Generate receipt
  generateReceipt: async (paymentId) => {
    const response = await api.post('/receipts/generate', { paymentId });
    return response.data;
  },

  // Download receipt PDF
  downloadReceiptPDF: async (receiptId) => {
    const response = await api.get(`/receipts/${receiptId}/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Email receipt
  emailReceipt: async (receiptId, email) => {
    const response = await api.post(`/receipts/${receiptId}/email`, { email });
    return response.data;
  },

  // Get receipts by customer
  getReceiptsByCustomer: async (customerId) => {
    const response = await api.get('/receipts/customer/' + customerId);
    return response.data;
  }
};

export default receiptService;
