import React, { useEffect, useState } from 'react';
import { useAuth } from '../Context/AuthContext';
import api from '../Config/api';

const Profile = () => {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get(`/users/${authUser.id}`);
        setUser(data?.data || data);
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load profile.');
        setUser(authUser);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authUser?.id]);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'SUPERADMIN':
        return 'danger';
      case 'ADMIN':
        return 'warning';
      default:
        return 'primary';
    }
  };

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center vh-100">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-3 text-muted">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="container py-5">

      <h5 className="text-uppercase text-muted mb-4">My Profile</h5>

      {error && (
        <div className="alert alert-warning">
          ⚠ {error} — Showing cached data.
        </div>
      )}

      {/* HERO SECTION */}
      <div className="card shadow-lg border-0 mb-4">
        <div className="card-body p-4 d-flex flex-column flex-md-row align-items-center">

          <div
            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-md-4 mb-3 mb-md-0"
            style={{ width: 90, height: 90, fontSize: 28 }}
          >
            {getInitials(user?.name)}
          </div>

          <div className="flex-grow-1 text-center text-md-start">
            <h3 className="mb-1">{user?.name || 'Unknown User'}</h3>
            <p className="text-muted mb-3">{user?.email}</p>

            <div className="d-flex flex-wrap gap-2 justify-content-center justify-content-md-start">
              <span className={`badge bg-${getRoleBadge(user?.role)}`}>
                {user?.role}
              </span>

              <span className={`badge ${user?.is_active ? 'bg-success' : 'bg-secondary'}`}>
                {user?.is_active ? 'Active' : 'Inactive'}
              </span>

              {user?.is_email_verified && (
                <span className="badge bg-info text-dark">
                  Email Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DETAILS SECTION */}
      <div className="row g-4">

        {/* Account Info */}
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-light fw-semibold">
              👤 Account Information
            </div>
            <div className="card-body">
              <p><strong>Full Name:</strong> {user?.name}</p>
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>Phone:</strong> {user?.phone || '—'}</p>
              <p><strong>Department:</strong> {user?.department || '—'}</p>
            </div>
          </div>
        </div>

        {/* Access & Permissions */}
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-light fw-semibold">
              🔐 Access & Permissions
            </div>
            <div className="card-body">
              <p><strong>Role:</strong> {user?.role}</p>
              <p><strong>Status:</strong> {user?.is_active ? 'Active' : 'Inactive'}</p>
              <p><strong>Email Verified:</strong> {user?.is_email_verified ? 'Yes' : 'No'}</p>
              <p><strong>Last Login:</strong> {formatDate(user?.last_login_at)}</p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="col-md-12">
          <div className="card shadow-sm">
            <div className="card-header bg-light fw-semibold">
              📅 Timeline
            </div>
            <div className="card-body row">
              <div className="col-md-6">
                <p><strong>Account Created:</strong> {formatDate(user?.created_at)}</p>
              </div>
              <div className="col-md-6">
                <p><strong>Last Updated:</strong> {formatDate(user?.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* UUID */}
        {user?.id && (
          <div className="col-md-12">
            <div className="card shadow-sm border-secondary">
              <div className="card-header bg-light fw-semibold">
                🪪 User Identifier
              </div>
              <div className="card-body">
                <code>{user.id}</code>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Profile;