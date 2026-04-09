import api from '../Config/api';

const customerService = {
  // Create customer
  createCustomer: async (customerData) => {
    try {
      const response = await api.post('/customers', customerData);
      return { success: true, data: response.data.data, message: response.data.message };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to create customer',
        details: error.response?.data?.details || []
      };
    }
  },

  // Get all customers
  getAllCustomers: async (params = {}) => {
    try {
      const response = await api.get('/customers', { params });
      return { success: true, data: response.data.data };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch customers'
      };
    }
  },

  // Get customer by ID
  getCustomerById: async (customerId) => {
    try {
      const response = await api.get(`/customers/${customerId}`);
      return response.data.data;
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch customer'
      };
    }
  },

  // Update customer
  updateCustomer: async (customerId, customerData) => {
    try {
      const response = await api.put(`/customers/${customerId}`, customerData);
      return { success: true, data: response.data.data, message: response.data.message };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to update customer',
        details: error.response?.data?.details || []
      };
    }
  },

  // Delete customer
  // Add these two methods to your existing customerService object:

getDeletePreview: async (customerId) => {
  const res = await api.get(`/customers/${customerId}/delete-preview`);
  return { success: true, data: res.data.data };
},

deleteCustomer: async (customerId) => {
  const res = await api.delete(`/customers/${customerId}`, {
    data: { confirmDelete: true }   // axios needs body in data for DELETE
  });
  return { success: true, data: res.data.data, message: res.data.message };
},
  // deleteCustomer: async (customerId) => {
  //   try {
  //     const response = await api.delete(`/customers/${customerId}`);
  //     return { success: true, message: response.data.message };
  //   } catch (error) {
  //     throw {
  //       success: false,
  //       error: error.response?.data?.error || 'Failed to delete customer'
  //     };
  //   }
  // },

  // Get statistics
  getCustomerStats: async () => {
    try {
      const response = await api.get('/customers/stats');
      return { success: true, data: response.data.data };
    } catch (error) {
      throw {
        success: false,
        error: error.response?.data?.error || 'Failed to fetch statistics'
      };
    }
  }
};

export default customerService;