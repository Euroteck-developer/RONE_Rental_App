import api from '../Config/api';

const authService = {
  // Login user
  login: async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      
      const { user, accessToken, refreshToken } = response.data.data;

      // Store tokens and user data
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      return { success: true, data: { user, accessToken, refreshToken } };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
        attemptsRemaining: error.response?.data?.attemptsRemaining
      };
    }
  },

  // Logout user
  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  },

  // Get current user
  getCurrentUser: () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  },

  // Check authentication with token validation ✅
  isAuthenticated: () => {
    const token = localStorage.getItem('accessToken');
    
    if (!token) return false;

    try {
      // Decode JWT and check expiration
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();
      
      if (isExpired) {
        console.log('🔒 Token expired');
        authService.logout(); // Clear expired token
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('🔒 Invalid token:', error);
      authService.logout(); // Clear invalid token
      return false;
    }
  },

  // Get access token
  getAccessToken: () => {
    return localStorage.getItem('accessToken');
  }
};

export default authService;