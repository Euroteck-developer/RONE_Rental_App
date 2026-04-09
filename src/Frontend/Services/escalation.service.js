// import api from '../Config/api';

// const escalationService = {
//   // Get all escalations
//   getAllEscalations: async (params = {}) => {
//     try {
//       const response = await api.get('/escalations', { params });
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to fetch escalations'
//       };
//     }
//   },

//   // Get upcoming escalations
//   getUpcomingEscalations: async (months = 6) => {
//     try {
//       const response = await api.get('/escalations/upcoming', {
//         params: { months }
//       });
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to fetch upcoming escalations'
//       };
//     }
//   },

//   // Get escalation by customer ID
//   getEscalationByCustomer: async (customerId) => {
//     try {
//       const response = await api.get(`/escalations/customer/${customerId}`);
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to fetch customer escalations'
//       };
//     }
//   },

//   // Apply escalation
//   applyEscalation: async (escalationId) => {
//     try {
//       const response = await api.post(`/escalations/${escalationId}/apply`);
//       return { success: true, message: response.data.message };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to apply escalation'
//       };
//     }
//   },

//   // Get escalation timeline
//   getEscalationTimeline: async (customerId) => {
//     try {
//       const response = await api.get(`/escalations/timeline/${customerId}`);
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to fetch escalation timeline'
//       };
//     }
//   },

//   // Get escalation statistics
//   getEscalationStats: async () => {
//     try {
//       const response = await api.get('/escalations/statistics');
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to fetch escalation statistics'
//       };
//     }
//   },

//   // Generate escalations
//   generateEscalations: async () => {
//     try {
//       const response = await api.post('/escalations/generate');
//       return { success: true, data: response.data.data, message: response.data.message };
//     } catch (error) {
//       throw {
//         success: false,
//         error: error.response?.data?.error || 'Failed to generate escalations'
//       };
//     }
//   }
// };

// export default escalationService;

import api from '../Config/api';
import ServiceError from '../Utils/ServiceError';

const escalationService = {
  getAllEscalations: async (params = {}) => {
    try {
      const response = await api.get('/escalations', { params });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to fetch escalations');
    }
  },

  getUpcomingEscalations: async (months = 6) => {
    try {
      const response = await api.get('/escalations/upcoming', { params: { months } });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to fetch upcoming escalations');
    }
  },

  getEscalationByCustomer: async (customerId) => {
    try {
      const response = await api.get(`/escalations/customer/${customerId}`);
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to fetch customer escalations');
    }
  },

  applyEscalation: async (escalationId) => {
    try {
      const response = await api.post(`/escalations/${escalationId}/apply`);
      return { success: true, message: response.data.message };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to apply escalation');
    }
  },

  getEscalationTimeline: async (customerId) => {
    try {
      const response = await api.get(`/escalations/timeline/${customerId}`);
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to fetch escalation timeline');
    }
  },

  getEscalationStats: async () => {
    try {
      const response = await api.get('/escalations/statistics');
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to fetch escalation statistics');
    }
  },

  generateEscalations: async () => {
    try {
      const response = await api.post('/escalations/generate');
      return { success: true, data: response.data.data, message: response.data.message };
    } catch (error) {
      throw new ServiceError(error.response?.data?.error || 'Failed to generate escalations');
    }
  }
};

export default escalationService;