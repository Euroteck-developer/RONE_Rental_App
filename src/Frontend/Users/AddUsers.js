import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';
import api from '../Config/api';

const ROLES = ['ADMIN', 'USER'];

const DEPARTMENTS = [
  'R-ONE ACCOUNTS', 'R-ONE CRM', 'R-ONE AUDIT'
];

const PASSWORD_RULES = [
  { label: 'At least 8 characters',   test: (p) => p.length >= 8 },
  { label: 'One uppercase letter',     test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter',     test: (p) => /[a-z]/.test(p) },
  { label: 'One number',               test: (p) => /\d/.test(p) },
  { label: 'One special character',    test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

const AddUsers = () => {
  const initialForm = { name: '', email: '', phone: '', role: '', department: '', password: '', confirmPassword: '' };
  const [form, setForm]               = useState(initialForm);
  const [errors, setErrors]           = useState({});
  const [loading, setLoading]         = useState(false);
  const [success, setSuccess]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  // Guard — only SUPERADMIN
  if (currentUser?.role !== 'SUPERADMIN') {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <i className="bi bi-shield-lock fs-1 text-danger mb-3"></i>
        <h5 className="text-danger">Access Denied</h5>
        <p className="text-muted">Only SUPERADMIN can create users.</p>
        <button className="btn btn-outline-secondary" onClick={() => navigate('/users')}>
          <i className="bi bi-arrow-left me-2"></i>Back to Users
        </button>
      </div>
    );
  }

  const passwordStrength = PASSWORD_RULES.filter((r) => r.test(form.password)).length;
  const strengthLabel    = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][passwordStrength];
  const strengthColor    = ['', 'danger', 'warning', 'info', 'primary', 'success'][passwordStrength];

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim())             errs.name            = 'Full name is required.';
    else if (form.name.trim().length < 2) errs.name         = 'Name must be at least 2 characters.';
    if (!form.email.trim())            errs.email           = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (form.phone && !/^\+?[\d\s\-()]{7,20}$/.test(form.phone)) errs.phone = 'Enter a valid mobile number.';
    if (!form.role)                    errs.role            = 'Please select a role.';
    if (!form.department)              errs.department      = 'Please select department';
    if (!form.password)                errs.password        = 'Password is required.';
    else if (passwordStrength < 3)     errs.password        = 'Password is too weak.';
    if (!form.confirmPassword)         errs.confirmPassword = 'Please confirm the password.';
    else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    setSuccess('');
    try {
      await api.post('/users', {
        name:       form.name.trim(),
        email:      form.email.trim().toLowerCase(),
        phone:      form.phone?.trim() || null,
        role:       form.role,
        department: form.department || null,
        password:   form.password,
      });
      setSuccess('User created successfully! Redirecting...');
      setForm(initialForm);
      setTimeout(() => navigate('/users'), 1500);
    } catch (err) {
      const msg = err?.response?.data?.message;
      if (msg?.toLowerCase().includes('email')) setErrors({ email: msg });
      else setErrors({ api: msg || 'Failed to create user. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid px-0">
      <div className="row justify-content-center">
        <div className="col-xl-8 col-lg-10">

          {success    && <div className="alert alert-success mb-4"><i className="bi bi-check-circle-fill me-2"></i>{success}</div>}
          {errors.api && (
            <div className="alert alert-danger alert-dismissible mb-4">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>{errors.api}
              <button className="btn-close" onClick={() => setErrors((p) => ({ ...p, api: '' }))}></button>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* ── Personal Info ──────────────────────────────────────────────── */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white border-bottom py-3">
                <h6 className="mb-0 fw-semibold"><i className="bi bi-person-fill me-2 text-primary"></i>Personal Information</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Full Name <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text bg-white"><i className="bi bi-person text-muted"></i></span>
                      <input
                        type="text"
                        className={`form-control border-start-0 ${errors.name ? 'is-invalid' : form.name ? 'is-valid' : ''}`}
                        placeholder="Enter full name"
                        value={form.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                      />
                      {errors.name && <div className="invalid-feedback">{errors.name}</div>}
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Email Address <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text bg-white"><i className="bi bi-envelope text-muted"></i></span>
                      <input
                        type="email"
                        className={`form-control border-start-0 ${errors.email ? 'is-invalid' : form.email ? 'is-valid' : ''}`}
                        placeholder="Enter email address"
                        value={form.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                      />
                      {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold">
                      Mobile No <span className="text-muted fw-normal small">(Optional)</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-white"><i className="bi bi-phone text-muted"></i></span>
                      <input
                        type="tel"
                        className={`form-control border-start-0 ${errors.phone ? 'is-invalid' : ''}`}
                        placeholder="+91 XXXXX XXXXX"
                        value={form.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                      />
                      {errors.phone && <div className="invalid-feedback">{errors.phone}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Role & Department ──────────────────────────────────────────── */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white border-bottom py-3">
                <h6 className="mb-0 fw-semibold"><i className="bi bi-shield-check me-2 text-primary"></i>Role & Department</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Role <span className="text-danger">*</span></label>
                    <select
                      className={`form-select ${errors.role ? 'is-invalid' : form.role ? 'is-valid' : ''}`}
                      value={form.role}
                      onChange={(e) => handleChange('role', e.target.value)}
                    >
                      <option value="">Select Role</option>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {errors.role && <div className="invalid-feedback">{errors.role}</div>}
                    {form.role && (
                      <div className="form-text">
                        {form.role === 'SUPERADMIN' && <><i className="bi bi-exclamation-triangle text-warning me-1"></i>Full system access</>}
                        {form.role === 'ADMIN'      && <><i className="bi bi-info-circle text-info me-1"></i>Management access</>}
                        {form.role === 'USER'       && <><i className="bi bi-check-circle text-success me-1"></i>Standard access</>}
                      </div>
                    )}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold">
                      Department <span className="text-danger">*</span>
                    </label>
                    <select
                      className={`form-select ${errors.department ? 'is-invalid' : form.department ? 'is-valid' : ''}`}
                      value={form.department}
                      onChange={(e) => handleChange('department', e.target.value)}
                    >
                      <option value="">Select Department</option>
                      {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {errors.department && <div className="invalid-feedback">{errors.department}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Password ──────────────────────────────────────────────────── */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white border-bottom py-3">
                <h6 className="mb-0 fw-semibold"><i className="bi bi-lock-fill me-2 text-primary"></i>Set Password</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Password <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text bg-white"><i className="bi bi-lock text-muted"></i></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`form-control border-start-0 border-end-0 ${errors.password ? 'is-invalid' : ''}`}
                        placeholder="Create password"
                        value={form.password}
                        onChange={(e) => handleChange('password', e.target.value)}
                        autoComplete="new-password"
                      />
                      <button type="button" className="input-group-text bg-white" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                        <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'} text-muted`}></i>
                      </button>
                      {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
                    </div>
                    {form.password && (
                      <div className="mt-2">
                        <div className="d-flex gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex-fill rounded" style={{ height: 4, background: i <= passwordStrength ? `var(--bs-${strengthColor})` : '#e9ecef', transition: 'background 0.3s' }} />
                          ))}
                        </div>
                        <small className={`text-${strengthColor}`}>{strengthLabel}</small>
                      </div>
                    )}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Confirm Password <span className="text-danger">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text bg-white"><i className="bi bi-lock-fill text-muted"></i></span>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        className={`form-control border-start-0 border-end-0 ${errors.confirmPassword ? 'is-invalid' : form.confirmPassword && form.password === form.confirmPassword ? 'is-valid' : ''}`}
                        placeholder="Confirm password"
                        value={form.confirmPassword}
                        onChange={(e) => handleChange('confirmPassword', e.target.value)}
                        autoComplete="new-password"
                      />
                      <button type="button" className="input-group-text bg-white" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                        <i className={`bi ${showConfirm ? 'bi-eye-slash' : 'bi-eye'} text-muted`}></i>
                      </button>
                      {errors.confirmPassword && <div className="invalid-feedback d-block">{errors.confirmPassword}</div>}
                    </div>
                  </div>

                  <div className="col-12">
                    <div className="p-3 bg-light rounded">
                      <small className="text-muted fw-semibold d-block mb-2">Password Requirements:</small>
                      <div className="row g-1">
                        {PASSWORD_RULES.map((rule, i) => {
                          const met = rule.test(form.password);
                          return (
                            <div key={i} className="col-md-6">
                              <small className={met ? 'text-success' : 'text-muted'}>
                                <i className={`bi ${met ? 'bi-check-circle-fill' : 'bi-circle'} me-1`}></i>{rule.label}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Actions ───────────────────────────────────────────────────── */}
            <div className="d-flex gap-3 justify-content-end">
              <button type="button" className="btn btn-outline-secondary px-4" onClick={() => navigate('/users')} disabled={loading}>
                <i className="bi bi-x-lg me-2"></i>Cancel
              </button>
              <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Creating User...</>
                  : <><i className="bi bi-person-plus me-2"></i>Create User</>}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default AddUsers;