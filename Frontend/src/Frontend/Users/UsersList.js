import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';
import api from '../Config/api';

const ROLES       = ['ADMIN', 'USER'];
const DEPARTMENTS = ['R-ONE ACCOUNTS', 'R-ONE CRM', 'R-ONE AUDIT'];

const ROLE_BADGE = {
  SUPERADMIN: 'danger',
  ADMIN:      'warning',
  USER:       'primary',
};

const UsersList = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';

  /*
   * Permission helpers
   * ─────────────────────────────────────────────────────────────
   * canEdit(u):
   *   SUPERADMIN can edit any account EXCEPT another SUPERADMIN.
   *   Self-edit is allowed (name / email / phone / department only).
   *
   * canDelete(u):
   *   SUPERADMIN only, cannot delete self or another SUPERADMIN.
   *
   * isSelfEdit(u):
   *   True when the target row is the currently logged-in user.
   *   Used to suppress role + status fields in the modal.
   */
  const canEdit   = (u) => isSuperAdmin && (u?.role !== 'SUPERADMIN' || u?.id === currentUser?.id);
  const canDelete = (u) => isSuperAdmin && u?.role !== 'SUPERADMIN'  && u?.id  !== currentUser?.id;
  const isSelfEdit = (u) => u?.id === currentUser?.id;

  // ── State ─────────────────────────────────────────────────────
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editUser,      setEditUser]      = useState(null);
  const [editForm,      setEditForm]      = useState({});
  const [editErrors,    setEditErrors]    = useState({});
  const [editLoading,   setEditLoading]   = useState(false);
  const [editSuccess,   setEditSuccess]   = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  const [deleteLoading,   setDeleteLoading]   = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (search)     params.search = search;
      if (roleFilter) params.role   = roleFilter;
      const { data } = await api.get('/users', { params });
      setUsers(data?.data || data || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to fetch users.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Open edit modal ────────────────────────────────────────────
  const openEdit = (u) => {
    if (!canEdit(u)) return;
    setEditUser(u);
    setEditForm({
      name:       u.name       || '',
      email:      u.email      || '',
      phone:      u.phone      || '',
      role:       u.role       || 'USER',
      department: u.department || '',
      is_active:  u.is_active  ?? true,
    });
    setEditErrors({});
    setEditSuccess('');
    setShowEditModal(true);
  };

  // ── Validate edit form ─────────────────────────────────────────
  const validateEdit = () => {
    const errs  = {};
    const self  = isSelfEdit(editUser);

    if (!editForm.name?.trim() || editForm.name.trim().length < 2)
      errs.name = 'Full name must be at least 2 characters.';

    if (!editForm.email?.trim())
      errs.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email))
      errs.email = 'Invalid email format.';

    if (editForm.phone && !/^\+?[\d\s\-()]{7,20}$/.test(editForm.phone))
      errs.phone = 'Invalid mobile number.';

    if (!editForm.department)
      errs.department = 'Department is required.';

    /*
     * Role validation only when editing another user (not self).
     * Backend enforces the same rule — this is just front-end early feedback.
     */
    if (!self && editUser?.role !== 'SUPERADMIN') {
      if (!ROLES.includes(editForm.role))
        errs.role = 'Role is required.';
    }

    return errs;
  };

  // ── Submit edit ────────────────────────────────────────────────
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit(editUser)) {
      setEditErrors({ api: 'You do not have permission to edit this user.' });
      return;
    }

    const errs = validateEdit();
    if (Object.keys(errs).length) { setEditErrors(errs); return; }

    setEditLoading(true);
    setEditErrors({});

    const self = isSelfEdit(editUser);

    try {
      /*
       * Payload rules:
       *
       * Self-edit (SUPERADMIN editing themselves):
       *   → Send only: name, email, phone, department
       *   → Never send role or is_active — backend ignores them for self-edit
       *     anyway, but we omit them so the backend role validator never runs.
       *
       * Editing another ADMIN/USER:
       *   → Send all fields including role and is_active.
       *   → Never send role = 'SUPERADMIN' (backend rejects it).
       */
      const payload = {
        name:       editForm.name.trim(),
        email:      editForm.email.trim().toLowerCase(),
        phone:      editForm.phone?.trim() || null,
        department: editForm.department    || null,
        // Only include role + is_active when editing another non-SUPERADMIN account
        ...(!self && editUser?.role !== 'SUPERADMIN'
          ? { role: editForm.role, is_active: editForm.is_active }
          : {}
        ),
      };

      await api.put(`/users/${editUser.id}`, payload);
      setEditSuccess('User updated successfully.');
      fetchUsers();
      setTimeout(() => setShowEditModal(false), 1200);
    } catch (err) {
      setEditErrors({
        api:
          err?.response?.data?.error  ||
          err?.response?.data?.message ||
          'Update failed.',
      });
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────
  const openDelete = (u) => {
    if (!canDelete(u)) return;
    setDeleteTarget(u);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!canDelete(deleteTarget)) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      setShowDeleteModal(false);
      fetchUsers();
    } catch (err) {
      alert(err?.response?.data?.error || 'Delete failed.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Filtered list ──────────────────────────────────────────────
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (!q ||
        u.name?.toLowerCase().includes(q)       ||
        u.email?.toLowerCase().includes(q)      ||
        u.department?.toLowerCase().includes(q)) &&
      (!roleFilter || u.role === roleFilter)
    );
  });

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="container-fluid px-0">

      {/* Page header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h6 className="text-muted mb-0">
          Total: {filtered.length} user{filtered.length !== 1 ? 's' : ''}
        </h6>
        {isSuperAdmin && (
          <button className="btn btn-primary" onClick={() => navigate('/users/new')}>
            <i className="bi bi-person-plus me-2" />Add User
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-4 border-0 shadow-sm">
        <div className="card-body py-3">
          <div className="row g-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text bg-white border-end-0">
                  <i className="bi bi-search text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Search by name, email or department..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All Roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <button
                className="btn btn-outline-secondary w-100"
                onClick={() => { setSearch(''); setRoleFilter(''); }}
              >
                <i className="bi bi-x-circle me-1" />Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible">
          <i className="bi bi-exclamation-triangle me-2" />{error}
          <button className="btn-close" onClick={() => setError('')} />
        </div>
      )}

      {/* Users table */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" />
              <p className="mt-3 text-muted">Loading users...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-people fs-1 text-muted" />
              <p className="mt-3 text-muted">No users found.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-4">#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Mobile No</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    {isSuperAdmin && <th className="text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, idx) => {
                    const editAllowed   = canEdit(u);
                    const deleteAllowed = canDelete(u);
                    const self          = isSelfEdit(u);

                    return (
                      <tr key={u.id} className={self ? 'table-primary bg-opacity-25' : ''}>
                        <td className="ps-4 text-muted">{idx + 1}</td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div
                              className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
                              style={{
                                width: 36, height: 36, minWidth: 36,
                                background: `hsl(${(u.name?.charCodeAt(0) || 65) * 10}, 55%, 50%)`,
                                fontSize: 14,
                              }}
                            >
                              {u.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <div>
                              <span className="fw-medium">{u.name}</span>
                              {self && (
                                <span className="badge bg-primary ms-2" style={{ fontSize: 10 }}>You</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="text-muted">{u.email}</td>
                        <td className="text-muted">{u.phone || '—'}</td>
                        <td>{u.department || '—'}</td>
                        <td>
                          <span className={`badge bg-${ROLE_BADGE[u.role] || 'secondary'} text-uppercase`}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${u.is_active ? 'bg-success' : 'bg-secondary'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="text-muted small">
                          {u.last_login_at
                            ? new Date(u.last_login_at).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })
                            : '—'}
                        </td>

                        {isSuperAdmin && (
                          <td className="text-center">
                            <div className="d-flex gap-2 justify-content-center">
                              {editAllowed ? (
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => openEdit(u)}
                                  title={self ? 'Edit my profile' : 'Edit user'}
                                >
                                  <i className="bi bi-pencil" />
                                </button>
                              ) : (
                                /* Spacer keeps column width consistent */
                                <span style={{ width: 31, display: 'inline-block' }} />
                              )}

                              {deleteAllowed ? (
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => openDelete(u)}
                                  title="Delete user"
                                >
                                  <i className="bi bi-trash" />
                                </button>
                              ) : (
                                <span style={{ width: 31, display: 'inline-block' }} />
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Modal ────────────────────────────────────────────── */}
      {showEditModal && editUser && (
        <>
          <div className="modal show d-block" tabIndex="-1" style={{ zIndex: 1055 }}>
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content">

                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-pencil-square me-2 text-primary" />
                    {isSelfEdit(editUser) ? 'Edit My Profile' : 'Edit User'}
                    <span className={`badge bg-${ROLE_BADGE[editUser.role] || 'secondary'} ms-2 text-uppercase`}
                      style={{ fontSize: 11 }}>
                      {editUser.role}
                    </span>
                    {isSelfEdit(editUser) && (
                      <span className="badge bg-primary ms-1" style={{ fontSize: 11 }}>You</span>
                    )}
                  </h5>
                  <button
                    className="btn-close"
                    onClick={() => setShowEditModal(false)}
                    disabled={editLoading}
                  />
                </div>

                <form onSubmit={handleEditSubmit} noValidate>
                  <div className="modal-body">

                    {editSuccess && (
                      <div className="alert alert-success py-2">
                        <i className="bi bi-check-circle me-2" />{editSuccess}
                      </div>
                    )}
                    {editErrors.api && (
                      <div className="alert alert-danger py-2">
                        <i className="bi bi-exclamation-triangle me-2" />{editErrors.api}
                      </div>
                    )}

                    {/*
                     * Info banner for self-edit:
                     * Clearly explains role and status are locked.
                     */}
                    {isSelfEdit(editUser) && (
                      <div className="alert alert-info py-2 small mb-3">
                        <i className="bi bi-shield-lock me-2" />
                        You are editing your own profile. <strong>Role</strong> and
                        <strong> account status</strong> cannot be changed from here
                        — these are managed by system administration.
                      </div>
                    )}

                    <div className="row g-3">

                      {/* Full Name */}
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">
                          Full Name <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className={`form-control ${editErrors.name ? 'is-invalid' : ''}`}
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Enter full name"
                        />
                        {editErrors.name && (
                          <div className="invalid-feedback">{editErrors.name}</div>
                        )}
                      </div>

                      {/* Email */}
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">
                          Email Address <span className="text-danger">*</span>
                        </label>
                        <input
                          type="email"
                          className={`form-control ${editErrors.email ? 'is-invalid' : ''}`}
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="Enter email address"
                        />
                        {editErrors.email && (
                          <div className="invalid-feedback">{editErrors.email}</div>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">
                          Mobile No
                          <span className="text-muted fw-normal small ms-1">(Optional)</span>
                        </label>
                        <input
                          type="tel"
                          className={`form-control ${editErrors.phone ? 'is-invalid' : ''}`}
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          placeholder="e.g. +91 98765 43210"
                        />
                        {editErrors.phone && (
                          <div className="invalid-feedback">{editErrors.phone}</div>
                        )}
                      </div>

                      {/* Department */}
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">
                          Department <span className="text-danger">*</span>
                        </label>
                        <select
                          className={`form-select ${editErrors.department ? 'is-invalid' : ''}`}
                          value={editForm.department}
                          onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                        >
                          <option value="">Select Department</option>
                          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {editErrors.department && (
                          <div className="invalid-feedback">{editErrors.department}</div>
                        )}
                      </div>

                      {/*
                       * Role field:
                       *   • Hidden when editing self (SUPERADMIN cannot change own role)
                       *   • Hidden when target is SUPERADMIN (backend rejects SUPERADMIN role)
                       *   • Shown as editable select for ADMIN / USER targets
                       */}
                      {!isSelfEdit(editUser) && editUser.role !== 'SUPERADMIN' ? (
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">
                            Role <span className="text-danger">*</span>
                          </label>
                          <select
                            className={`form-select ${editErrors.role ? 'is-invalid' : ''}`}
                            value={editForm.role}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          >
                            <option value="">Select Role</option>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {editErrors.role && (
                            <div className="invalid-feedback">{editErrors.role}</div>
                          )}
                        </div>
                      ) : (
                        /*
                         * Read-only role display for self-edit.
                         * Shown so the user can see their current role.
                         */
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">Role</label>
                          <div className="form-control bg-light d-flex align-items-center gap-2"
                            style={{ cursor: 'not-allowed' }}>
                            <span className={`badge bg-${ROLE_BADGE[editUser.role] || 'secondary'} text-uppercase`}>
                              {editUser.role}
                            </span>
                            <span className="text-muted small">
                              <i className="bi bi-lock-fill me-1" />Cannot be changed
                            </span>
                          </div>
                        </div>
                      )}

                      {/*
                       * Status toggle:
                       *   • Hidden when editing self — nobody can deactivate themselves
                       *   • Shown when editing another ADMIN / USER
                       */}
                      {!isSelfEdit(editUser) && editUser.role !== 'SUPERADMIN' ? (
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">Status</label>
                          <div className="form-check form-switch mt-2">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="editIsActive"
                              checked={editForm.is_active}
                              onChange={(e) =>
                                setEditForm({ ...editForm, is_active: e.target.checked })
                              }
                            />
                            <label className="form-check-label" htmlFor="editIsActive">
                              <span className={editForm.is_active ? 'text-success' : 'text-secondary'}>
                                {editForm.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          </div>
                        </div>
                      ) : (
                        /*
                         * Read-only status display for self-edit.
                         */
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">Status</label>
                          <div className="form-control bg-light d-flex align-items-center gap-2"
                            style={{ cursor: 'not-allowed' }}>
                            <span className={`badge ${editUser.is_active ? 'bg-success' : 'bg-secondary'}`}>
                              {editUser.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <span className="text-muted small">
                              <i className="bi bi-lock-fill me-1" />Cannot be changed
                            </span>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowEditModal(false)}
                      disabled={editLoading}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={editLoading}>
                      {editLoading ? (
                        <><span className="spinner-border spinner-border-sm me-2" />Saving…</>
                      ) : (
                        <><i className="bi bi-check-lg me-2" />Save Changes</>
                      )}
                    </button>
                  </div>
                </form>

              </div>
            </div>
          </div>
          <div
            className="modal-backdrop show"
            style={{ zIndex: 1050 }}
            onClick={() => !editLoading && setShowEditModal(false)}
          />
        </>
      )}

      {/* ── Delete Modal ──────────────────────────────────────────── */}
      {showDeleteModal && deleteTarget && (
        <>
          <div className="modal show d-block" tabIndex="-1" style={{ zIndex: 1055 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">

                <div className="modal-header border-0 pb-0">
                  <h5 className="modal-title text-danger">
                    <i className="bi bi-exclamation-triangle me-2" />Delete User
                  </h5>
                  <button
                    className="btn-close"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleteLoading}
                  />
                </div>

                <div className="modal-body text-center py-4">
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold mx-auto mb-3"
                    style={{
                      width: 64, height: 64,
                      background: `hsl(${(deleteTarget.name?.charCodeAt(0) || 65) * 10}, 55%, 50%)`,
                      fontSize: 24,
                    }}
                  >
                    {deleteTarget.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <p className="mb-1">
                    Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                  </p>
                  <p className="text-muted small">
                    ({deleteTarget.email}) — This action cannot be undone.
                  </p>
                </div>

                <div className="modal-footer border-0 pt-0">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                    {deleteLoading ? (
                      <><span className="spinner-border spinner-border-sm me-2" />Deleting…</>
                    ) : (
                      <><i className="bi bi-trash me-2" />Delete User</>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </div>
          <div
            className="modal-backdrop show"
            style={{ zIndex: 1050 }}
            onClick={() => !deleteLoading && setShowDeleteModal(false)}
          />
        </>
      )}

    </div>
  );
};

export default UsersList;