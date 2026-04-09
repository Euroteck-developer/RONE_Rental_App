import api from '../Config/api';

const tdsService = {
  getAllTDS: async (params = {}) => {
    const response = await api.get('/tds', { params });
    return response.data;
  },

  // ← NEW: summary cards for TDS tracker
  getTDSSummary: async (params = {}) => {
    const response = await api.get('/tds/summary', { params });
    return response.data;
  },

  getMonthlyTDS: async (month, year) => {
    const response = await api.get('/tds/monthly', { params: { month, year } });
    return response.data;
  },

  getQuarterlyTDS: async (quarter, year) => {
    const response = await api.get('/tds/quarterly', { params: { quarter, year } });
    return response.data;
  },

  getTDSStats: async (year) => {
    const response = await api.get('/tds/statistics', { params: { year } });
    return response.data;
  },

  generateCertificate: async (customerId, quarter, year) => {
    const response = await api.post('/tds/certificate/generate', { customerId, quarter, year });
    return response.data;
  },

  getCertificates: async (params = {}) => {
    const response = await api.get('/tds/certificates', { params });
    return response.data;
  },

  downloadCertificate: async (certificateId) => {
    const response = await api.get(`/tds/certificate/${certificateId}/download`, { responseType: 'blob' });
    return response.data;
  },

  updateCertificateStatus: async (certificateId, status) => {
    const response = await api.put(`/tds/certificate/${certificateId}/status`, { status });
    return response.data;
  },
};

export default tdsService;