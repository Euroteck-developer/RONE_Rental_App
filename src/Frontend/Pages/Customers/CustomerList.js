import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Select from 'react-select';
import customerService from '../../Services/customer.service';

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
const DeleteConfirmModal = ({ customer, preview, loading, onConfirm, onCancel }) => {
  const [inputName, setInputName] = useState('');
  const nameMatch = inputName.trim().toLowerCase() === customer?.customer_name?.trim().toLowerCase();

  const rd = preview?.relatedData;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="modal-dialog modal-dialog-centered modal-md">
        <div className="modal-content border-0 shadow-lg overflow-hidden">

          {/* Header */}
          <div className="modal-header border-0 pb-0" style={{ background: '#fff1f1', borderBottom: '3px solid #dc3545' }}>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 48, height: 48, background: '#dc3545' }}
              >
                <i className="bi bi-exclamation-triangle-fill text-white fs-4"></i>
              </div>
              <div>
                <h5 className="mb-0 fw-bold text-danger">Permanently Delete Customer</h5>
                <p className="mb-0 small text-muted">This action cannot be undone</p>
              </div>
            </div>
            <button className="btn-close" onClick={onCancel}></button>
          </div>

          <div className="modal-body pt-3 pb-2">

            {/* Customer info */}
            <div className="rounded-3 p-3 mb-3 border" style={{ background: '#f8f9fa' }}>
              <div className="d-flex align-items-center gap-3">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
                  style={{ width: 42, height: 42, background: '#6c757d', fontSize: 16 }}
                >
                  {customer?.customer_name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="fw-semibold">{customer?.customer_name}</div>
                  <div className="small text-muted">{customer?.customer_id} &nbsp;·&nbsp; {customer?.email}</div>
                </div>
              </div>
            </div>

            {/* Related data summary */}
            {loading ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm text-danger me-2"></div>
                <span className="text-muted small">Checking related records...</span>
              </div>
            ) : rd ? (
              <>
                <div className="alert alert-danger border-danger py-2 mb-3">
                  <div className="d-flex align-items-start gap-2">
                    <i className="bi bi-trash3-fill text-danger mt-1 flex-shrink-0"></i>
                    <div className="small">
                      <strong>The following records will be permanently deleted:</strong>
                    </div>
                  </div>
                </div>

                <div className="row g-2 mb-3">
                  {[
                    {
                      icon: 'credit-card',
                      color: '#e74c3c',
                      bg: '#fdf2f2',
                      label: 'Payments',
                      value: rd.payments.total,
                      sub: rd.payments.total > 0
                        ? `${rd.payments.completed} completed · ${rd.payments.pending} pending`
                        : 'No payments',
                    },
                    {
                      icon: 'file-earmark-text',
                      color: '#e67e22',
                      bg: '#fef9f0',
                      label: 'Financial Records',
                      value: rd.financialRecords,
                      sub: rd.financialRecords > 0 ? 'Payment closure & rent details' : 'No records',
                    },
                    {
                      icon: 'graph-up-arrow',
                      color: '#8e44ad',
                      bg: '#fdf4ff',
                      label: 'Escalations',
                      value: rd.escalations,
                      sub: rd.escalations > 0 ? 'Escalation history included' : 'No escalations',
                    },
                    {
                      icon: 'file-earmark-medical',
                      color: '#2980b9',
                      bg: '#f0f8ff',
                      label: 'TDS Certificates',
                      value: rd.tdsCertificates,
                      sub: rd.tdsCertificates > 0 ? 'All quarters deleted' : 'No certificates',
                    },
                    {
                      icon: 'receipt',
                      color: '#27ae60',
                      bg: '#f0fff4',
                      label: 'Payment Receipts',
                      value: rd.receipts,
                      sub: rd.receipts > 0 ? 'All receipt records' : 'No receipts',
                    },
                  ].map(({ icon, color, bg, label, value, sub }) => (
                    <div className="col-6" key={label}>
                      <div
                        className="rounded-3 p-2 d-flex align-items-center gap-2 border"
                        style={{ background: bg, borderColor: color + '30' }}
                      >
                        <div
                          className="rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ width: 32, height: 32, background: color + '18' }}
                        >
                          <i className={`bi bi-${icon}`} style={{ color, fontSize: 14 }}></i>
                        </div>
                        <div className="overflow-hidden">
                          <div className="fw-bold small" style={{ color }}>{value}</div>
                          <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {label} — {sub}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {rd.payments.completed > 0 && (
                  <div className="alert alert-warning py-2 mb-3 small">
                    <i className="bi bi-exclamation-circle me-1"></i>
                    <strong>{rd.payments.completed} completed payment(s)</strong> with transaction history will also be permanently erased.
                  </div>
                )}
              </>
            ) : null}

            {/* Type name to confirm */}
            <div className="mb-1">
              <label className="form-label small fw-semibold text-danger">
                Type <strong>{customer?.customer_name}</strong> to confirm deletion:
              </label>
              <input
                type="text"
                className={`form-control form-control-sm ${inputName && !nameMatch ? 'is-invalid' : inputName && nameMatch ? 'is-valid' : ''}`}
                placeholder="Enter customer name exactly..."
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && nameMatch) onConfirm(); }}
              />
              {inputName && !nameMatch && (
                <div className="invalid-feedback">Name does not match. Check spelling and case.</div>
              )}
              {inputName && nameMatch && (
                <div className="valid-feedback">Name confirmed ✓</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer border-0 pt-1 gap-2">
            <button className="btn btn-outline-secondary btn-sm px-4" onClick={onCancel}>
              <i className="bi bi-x-lg me-1"></i>Cancel
            </button>
            <button
              className="btn btn-danger btn-sm px-4"
              onClick={onConfirm}
              disabled={!nameMatch || loading}
            >
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Deleting...</>
                : <><i className="bi bi-trash3-fill me-2"></i>Permanently Delete</>}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CustomerList = () => {
  const navigate = useNavigate();

  const [customers,   setCustomers]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [pagination,  setPagination]  = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters,     setFilters]     = useState({ search: '', status: '', agreementType: '', floorNo: '' });

  // Delete modal state
  const [deleteModal,    setDeleteModal]    = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState(null);   // { id, customer_name, customer_id, email }
  const [deletePreview,  setDeletePreview]  = useState(null);   // related data counts
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  const floorOptions = [
    { value: '', label: 'All Floors' },
    ...Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: `Floor ${i + 1}` }))
  ];

  useEffect(() => { fetchCustomers(); }, [pagination.page, filters]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const result = await customerService.getAllCustomers({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      setCustomers(result.data.customers);
      setPagination(result.data.pagination);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Open delete modal and fetch preview
  const openDeleteModal = async (customer) => {
    setDeleteTarget(customer);
    setDeletePreview(null);
    setDeleteModal(true);
    setPreviewLoading(true);
    try {
      const res = await customerService.getDeletePreview(customer.id);
      setDeletePreview(res.data);
    } catch {
      toast.error('Could not fetch related data counts. Proceed with caution.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModal(false);
    setDeleteTarget(null);
    setDeletePreview(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await customerService.deleteCustomer(deleteTarget.id);
      toast.success(`"${deleteTarget.customer_name}" and all related data permanently deleted.`);
      closeDeleteModal();
      fetchCustomers();
    } catch (err) {
      toast.error(err?.error || 'Failed to delete customer. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container-fluid">

      {/* Delete Confirmation Modal */}
      {deleteModal && deleteTarget && (
        <DeleteConfirmModal
          customer={deleteTarget}
          preview={deletePreview}
          loading={previewLoading || deleting}
          onConfirm={handleConfirmDelete}
          onCancel={closeDeleteModal}
        />
      )}

      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-1">Customer Management</h4>
          <p className="text-muted mb-0">Manage rental customers and agreements</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/customers/new')}>
          <i className="bi bi-plus-circle me-2"></i>Add Customer
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4 shadow-sm">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <input
                type="text"
                className="form-control"
                placeholder="Search by name, email, PAN, ID..."
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
              />
            </div>
            <div className="col-md-2">
              <Select
                name="floorNo"
                value={floorOptions.find((o) => o.value === filters.floorNo) || floorOptions[0]}
                onChange={(sel) => handleFilterChange({ target: { name: 'floorNo', value: sel?.value || '' } })}
                options={floorOptions}
                placeholder="All Floors"
                styles={{
                  menu:     (p) => ({ ...p, maxHeight: 250 }),
                  menuList: (p) => ({ ...p, maxHeight: 250, overflowY: 'auto' }),
                }}
              />
            </div>
            <div className="col-md-2">
              <select className="form-select" name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="col-md-2">
              <select className="form-select" name="agreementType" value={filters.agreementType} onChange={handleFilterChange}>
                <option value="">All Agreements</option>
                <option value="Construction">Construction</option>
                <option value="9-Year">9-Year</option>
              </select>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-outline-secondary w-100"
                onClick={() => { setFilters({ search: '', status: '', agreementType: '', floorNo: '' }); setPagination((p) => ({ ...p, page: 1 })); }}
              >
                <i className="bi bi-arrow-clockwise me-1"></i>Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status"></div>
              <p className="text-muted mt-3 mb-0">Loading customers...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#ccc' }}></i>
              <p className="text-muted mt-3 mb-0">No customers found</p>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Customer ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Sqft</th>
                      <th>Floor</th>
                      <th>Unit No</th>
                      <th>Agreement</th>
                      <th>Status</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id}>
                        <td><strong className="font-monospace">{c.customer_id}</strong></td>
                        <td className="fw-semibold">{c.customer_name}</td>
                        <td className="text-muted small">{c.email}</td>
                        <td>{c.phone}</td>
                        <td>{c.sqft ? parseInt(c.sqft).toLocaleString('en-IN') : '—'}</td>
                        <td>{c.floor_no || '—'}</td>
                        <td>{c.unit_no  || '—'}</td>
                        <td>
                          <span className={`badge ${c.agreement_type === 'Construction' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                            {c.agreement_type}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${c.status === 'Active' ? 'bg-success' : 'bg-secondary'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-outline-primary"
                              onClick={() => navigate(`/customers/edit/${c.id}`)}
                              title="Edit customer"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button
                              className="btn btn-outline-danger"
                              onClick={() => openDeleteModal(c)}
                              title="Delete customer permanently"
                            >
                              <i className="bi bi-trash3"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center p-3 border-top">
                <div className="text-muted small">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of <strong>{pagination.total}</strong> customers
                </div>
                <nav>
                  <ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${pagination.page === 1 ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>
                        <i className="bi bi-chevron-left"></i>
                      </button>
                    </li>
                    {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => {
                      const pg = i + 1;
                      return (
                        <li key={pg} className={`page-item ${pagination.page === pg ? 'active' : ''}`}>
                          <button className="page-link" onClick={() => setPagination((p) => ({ ...p, page: pg }))}>{pg}</button>
                        </li>
                      );
                    })}
                    <li className={`page-item ${pagination.page === pagination.totalPages ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>
                        <i className="bi bi-chevron-right"></i>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerList;