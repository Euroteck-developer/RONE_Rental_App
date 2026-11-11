import api from '../Config/api';

const authService = {

  login: async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data.data;

      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('refreshToken', refreshToken);
      sessionStorage.setItem('user', JSON.stringify(user));

      return { success: true, data: { user, accessToken, refreshToken } };
    } catch (error) {
      const data = error.response?.data || {};

      // Forward ALL backend fields so the Login UI can use them
      return {
        success:           false,
        error:             data.error             || 'Login failed',
        attemptsRemaining: data.attemptsRemaining  ?? undefined,
        blockedUntil:      data.blockedUntil       ?? undefined,
        blockedFor:        data.blockedFor         ?? undefined,
      };
    }
  },

  logout: async () => {
    try {
      const refreshToken = sessionStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('user');
      // Also clear the remembered block timer
      sessionStorage.removeItem('rpm_blocked_until');
    }
  },

  getCurrentUser: () => {
    try {
      const userStr = sessionStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  // ✅ Fixed: no longer calls async logout() inside sync function
  isAuthenticated: () => {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return false;

    try {
      const payload   = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();

      if (isExpired) {
        // Just clear storage synchronously — don't call async logout()
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        return false;
      }

      return true;
    } catch {
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('user');
      return false;
    }
  },

  getAccessToken: () => sessionStorage.getItem('accessToken'),
};

export default authService;