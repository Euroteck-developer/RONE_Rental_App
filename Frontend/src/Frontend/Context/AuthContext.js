import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../Services/AuthServices';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = () => {
      try {
        const isAuth = authService.isAuthenticated();
        const storedUser = authService.getCurrentUser();

        if (isAuth && storedUser) {
          setUser(storedUser);
        } else {
          authService.logout();
          setUser(null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        authService.logout();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const result = await authService.login(email, password);

      if (result.success) {
        setUser(result.data.user);
        navigate('/dashboard', { replace: true });
        return { success: true };
      }

      return result;
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      navigate('/login', { replace: true });
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;