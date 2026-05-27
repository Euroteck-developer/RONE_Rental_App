// import api from '../Config/api';

// // Custom error class to carry extra fields while satisfying no-throw-literal
// class ServiceError extends Error {
//   constructor(message, details = []) {
//     super(message);
//     this.name = 'ServiceError';
//     this.success = false;
//     this.details = details;
//   }
// }

// const customerService = {
//   createCustomer: async (customerData) => {
//     try {
//       const response = await api.post('/customers', customerData);
//       return { success: true, data: response.data.data, message: response.data.message };
//     } catch (error) {
//       throw new ServiceError(
//         error.response?.data?.error || 'Failed to create customer',
//         error.response?.data?.details || []
//       );
//     }
//   },

//   getAllCustomers: async (params = {}) => {
//     try {
//       const response = await api.get('/customers', { params });
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw new ServiceError(error.response?.data?.error || 'Failed to fetch customers');
//     }
//   },

//   lookupByPAN: async (pan) => {
//     const response = await api.get(`/customers/lookup/pan/${pan}`);
//     return response.data;
//   },

//   getCustomerById: async (customerId) => {
//     try {
//       const response = await api.get(`/customers/${customerId}`);
//       return response.data.data;
//     } catch (error) {
//       throw new ServiceError(error.response?.data?.error || 'Failed to fetch customer');
//     }
//   },

//   updateCustomer: async (customerId, customerData) => {
//     try {
//       const response = await api.put(`/customers/${customerId}`, customerData);
//       return { success: true, data: response.data.data, message: response.data.message };
//     } catch (error) {
//       throw new ServiceError(
//         error.response?.data?.error || 'Failed to update customer',
//         error.response?.data?.details || []
//       );
//     }
//   },

//   getDeletePreview: async (customerId) => {
//     const res = await api.get(`/customers/${customerId}/delete-preview`);
//     return { success: true, data: res.data.data };
//   },

//   deleteCustomer: async (customerId) => {
//     const res = await api.delete(`/customers/${customerId}`, {
//       data: { confirmDelete: true },
//     });
//     return { success: true, data: res.data.data, message: res.data.message };
//   },

//   getCustomerStats: async () => {
//     try {
//       const response = await api.get('/customers/stats');
//       return { success: true, data: response.data.data };
//     } catch (error) {
//       throw new ServiceError(error.response?.data?.error || 'Failed to fetch statistics');
//     }
//   },
// };

// export default customerService;

import api from '../Config/api';

// Custom error class to carry extra fields while satisfying no-throw-literal
class ServiceError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name    = 'ServiceError';
    this.success = false;
    this.details = details;
  }
}

// ─── Helper: extract the best available error message from an axios error ─────
// FIX: Previously the catch blocks only read err.response?.data?.error,
//      so a 500 with a plain string body or no body would surface as
//      "Operation failed" instead of the real server message.
const extractError = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim())         return data.trim();
  if (typeof data?.error === 'string' && data.error)   return data.error;
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (error?.message)                                  return error.message;
  return fallback;
};

const customerService = {
  createCustomer: async (customerData) => {
    try {
      const response = await api.post('/customers', customerData);
      return { success: true, data: response.data.data, message: response.data.message };
    } catch (error) {
      throw new ServiceError(
        extractError(error, 'Failed to create customer'),
        error.response?.data?.details || []
      );
    }
  },

  getAllCustomers: async (params = {}) => {
    try {
      const response = await api.get('/customers', { params });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(extractError(error, 'Failed to fetch customers'));
    }
  },

  lookupByPAN: async (pan) => {
    // Deliberately not wrapped — callers handle the 404 themselves
    const response = await api.get(`/customers/lookup/pan/${pan}`);
    return response.data;
  },

  getCustomerById: async (customerId) => {
    try {
      const response = await api.get(`/customers/${customerId}`);
      return response.data.data;
    } catch (error) {
      throw new ServiceError(extractError(error, 'Failed to fetch customer'));
    }
  },

  updateCustomer: async (customerId, customerData) => {
    try {
      const response = await api.put(`/customers/${customerId}`, customerData);
      return { success: true, data: response.data.data, message: response.data.message };
    } catch (error) {
      throw new ServiceError(
        extractError(error, 'Failed to update customer'),
        error.response?.data?.details || []
      );
    }
  },

  getDeletePreview: async (customerId) => {
    try {
      const res = await api.get(`/customers/${customerId}/delete-preview`);
      return { success: true, data: res.data.data };
    } catch (error) {
      throw new ServiceError(extractError(error, 'Failed to fetch delete preview'));
    }
  },

  deleteCustomer: async (customerId) => {
    try {
      const res = await api.delete(`/customers/${customerId}`, {
        data: { confirmDelete: true },
      });
      return { success: true, data: res.data.data, message: res.data.message };
    } catch (error) {
      throw new ServiceError(extractError(error, 'Failed to delete customer'));
    }
  },

  getCustomerStats: async () => {
    try {
      const response = await api.get('/customers/stats');
      return { success: true, data: response.data.data };
    } catch (error) {
      throw new ServiceError(extractError(error, 'Failed to fetch statistics'));
    }
  },
};

export default customerService;