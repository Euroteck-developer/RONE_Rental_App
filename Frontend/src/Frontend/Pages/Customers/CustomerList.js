import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Select from 'react-select';
import customerService from '../../Services/customer.service';
import Pagination from '../../Components/Pagination';

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

  // Page & page size live in the URL (?page=14&limit=25) so refresh / Back keep the position.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage  = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const urlLimit = [10, 25, 50, 100].includes(parseInt(searchParams.get('limit'), 10))
    ? parseInt(searchParams.get('limit'), 10) : 10;

  const [customers,   setCustomers]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [pagination,  setPagination]  = useState({ page: urlPage, limit: urlLimit, total: 0, totalPages: 0 });
  const [filters,     setFilters]     = useState({ search: '', status: '', agreementType: '', floorNo: '', financialStatus: '' });
  const [searchInput, setSearchInput] = useState('');

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

  const goToPage = (page, limit = urlLimit) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    next.set('limit', String(limit));
    setSearchParams(next);
  };

  useEffect(() => {
    fetchCustomers(urlPage, urlLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPage, urlLimit, filters]);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters((prev) => ({ ...prev, search: searchInput }));
        if (urlPage !== 1) goToPage(1);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const fetchCustomers = async (page = urlPage, limit = urlLimit) => {
    try {
      setLoading(true);
      const params = { page, limit };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const result = await customerService.getAllCustomers(params);
      const pg = result.data.pagination;
      // e.g. after a delete the last page can become empty → step back one page
      if (result.data.customers.length === 0 && pg.total > 0 && page > pg.totalPages) {
        goToPage(Math.max(1, pg.totalPages), limit);
        return;
      }
      setCustomers(result.data.customers);
      setPagination(pg);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    if (urlPage !== 1) goToPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const resetFilters = () => {
    setSearchInput('');
    setFilters({ search: '', status: '', agreementType: '', floorNo: '', financialStatus: '' });
    goToPage(1);
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
      <style>{`
        .cl-filter-bar { overflow-x: auto; padding-bottom: 2px; }
        .cl-filter-bar > * { flex-shrink: 0; }
        .cl-filter-bar > .input-group { flex-shrink: 1; }
        .cl-table-wrap { max-height: calc(100vh - 330px); overflow-y: auto; }
        .cl-table thead th {
          position: sticky; top: 0; z-index: 2;
          background: #f8fafc; color: #64748b;
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
          border-bottom: 1px solid #e2e8f0; white-space: nowrap; padding: .7rem .75rem;
        }
        .cl-table tbody td { padding: .6rem .75rem; font-size: 0.875rem; border-color: #f1f5f9; }
        .cl-table tbody tr:hover > * { background-color: #eef4ff !important; }
        .cl-icon-btn { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
      `}</style>

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

      {/* Filters — single line (scrolls horizontally on narrow screens, never wraps) */}
      <div className="card mb-3 border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body py-3">
          <div className="cl-filter-bar d-flex flex-nowrap align-items-center gap-2">
            <div className="input-group flex-grow-1" style={{ minWidth: 260 }}>
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control border-start-0 ps-0"
                placeholder="Search name, email, PAN, ID, unit…"
                name="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button type="button" className="btn btn-outline-secondary border-start-0" title="Clear search"
                  onClick={() => setSearchInput('')}>
                  <i className="bi bi-x-lg" />
                </button>
              )}
            </div>
            <div style={{ width: 150, flexShrink: 0 }}>
              <Select
                name="floorNo"
                value={floorOptions.find((o) => o.value === filters.floorNo) || floorOptions[0]}
                onChange={(sel) => handleFilterChange({ target: { name: 'floorNo', value: sel?.value || '' } })}
                options={floorOptions}
                placeholder="All Floors"
                menuPortalTarget={document.body}
                styles={{
                  control:    (p) => ({ ...p, minHeight: 38 }),
                  menuPortal: (p) => ({ ...p, zIndex: 9999 }),
                  menu:       (p) => ({ ...p, maxHeight: 250 }),
                  menuList:   (p) => ({ ...p, maxHeight: 250, overflowY: 'auto' }),
                }}
              />
            </div>
            <select className="form-select" style={{ width: 140, flexShrink: 0 }} name="status" value={filters.status} onChange={handleFilterChange}>
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <select className="form-select" style={{ width: 160, flexShrink: 0 }} name="agreementType" value={filters.agreementType} onChange={handleFilterChange}>
              <option value="">All Agreements</option>
              <option value="Construction">Construction</option>
              <option value="9-Year">9-Year</option>
            </select>
            <select className="form-select" style={{ width: 175, flexShrink: 0 }} name="financialStatus" value={filters.financialStatus} onChange={handleFilterChange}>
              <option value="">Financial: All</option>
              <option value="pending">Financial: Pending</option>
              <option value="filled">Financial: Filled</option>
            </select>
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-1 flex-shrink-0"
              onClick={resetFilters}
              title="Clear all filters"
            >
              <i className="bi bi-arrow-counterclockwise" />Reset
              {activeFilterCount > 0 && <span className="badge rounded-pill bg-primary ms-1">{activeFilterCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12, overflow: 'hidden' }}>
        <div className="card-header bg-white d-flex align-items-center justify-content-between py-3">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-people-fill text-primary" />
            <span className="fw-semibold">Customers</span>
            <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle">
              {pagination.total || 0}
            </span>
          </div>
          {activeFilterCount > 0 && (
            <small className="text-muted"><i className="bi bi-funnel-fill me-1" />{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</small>
          )}
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-3">
              {Array.from({ length: Math.min(pagination.limit || 10, 8) }).map((_, i) => (
                <div key={i} className="placeholder-glow d-flex gap-3 py-2 border-bottom">
                  <span className="placeholder col-1 rounded" />
                  <span className="placeholder col-2 rounded" />
                  <span className="placeholder col-3 rounded" />
                  <span className="placeholder col-2 rounded" />
                  <span className="placeholder col-2 rounded" />
                </div>
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox" style={{ fontSize: '3rem', color: '#cbd5e1' }}></i>
              <p className="text-muted mt-3 mb-2">No customers found</p>
              {activeFilterCount > 0 && (
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={resetFilters}>
                  <i className="bi bi-x-circle me-1" />Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="table-responsive cl-table-wrap">
                <table className="table table-hover table-striped align-middle mb-0 cl-table">
                  <thead>
                    <tr>
                      <th>Customer ID</th>
                      <th>Customer</th>
                      <th>Contact</th>
                      <th className="text-end">Sqft</th>
                      <th>Floor · Unit</th>
                      <th>Agreement</th>
                      <th>Status</th>
                      <th>Financial</th>
                      <th className="text-center" style={{ width: 100 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="badge bg-light text-dark border font-monospace fw-semibold" style={{ fontSize: '0.78rem' }}>
                            {c.customer_ref || c.customer_id}
                          </span>
                        </td>
                        <td>
                          <div className="fw-semibold text-truncate" style={{ maxWidth: 220 }} title={c.customer_name}>{c.customer_name}</div>
                          {c.unit_ref && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{c.unit_ref}</div>}
                        </td>
                        <td>
                          <div className="text-truncate small" style={{ maxWidth: 220 }} title={c.email}>
                            <i className="bi bi-envelope text-muted me-1" />{c.email || '—'}
                          </div>
                          <div className="small text-muted"><i className="bi bi-telephone me-1" />{c.phone || '—'}</div>
                        </td>
                        <td className="text-end">{c.sqft ? parseInt(c.sqft, 10).toLocaleString('en-IN') : '—'}</td>
                        <td className="text-nowrap">
                          <span className="fw-semibold">F{c.floor_no || '—'}</span>
                          <span className="text-muted mx-1">·</span>
                          <span className="fw-semibold">U{c.unit_no || '—'}</span>
                        </td>
                        <td>
                          <span className={`badge border ${c.agreement_type === 'Construction'
                            ? 'bg-warning-subtle text-warning-emphasis border-warning-subtle'
                            : 'bg-info-subtle text-info-emphasis border-info-subtle'}`}>
                            {c.agreement_type || '—'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge border ${c.status === 'Active'
                            ? 'bg-success-subtle text-success border-success-subtle'
                            : 'bg-secondary-subtle text-secondary border-secondary-subtle'}`}>
                            <i className={`bi ${c.status === 'Active' ? 'bi-circle-fill' : 'bi-circle'} me-1`} style={{ fontSize: '0.5rem', verticalAlign: 'middle' }} />
                            {c.status}
                          </span>
                        </td>
                        <td>
                          {c.has_financial ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle" title="Financial details saved">
                              <i className="bi bi-check-circle me-1" />Filled
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="badge bg-danger-subtle text-danger border border-danger-subtle"
                              style={{ cursor: 'pointer' }}
                              title="Financial details not filled — click to fill now"
                              onClick={() => navigate(`/financial?unit=${c.id}`)}
                            >
                              <i className="bi bi-exclamation-circle me-1" />Pending
                            </button>
                          )}
                        </td>
                        <td className="text-center">
                          <div className="d-inline-flex gap-1">
                            <button
                              className="btn btn-sm btn-light border cl-icon-btn"
                              onClick={() => navigate(`/customers/edit/${c.id}`)}
                              title="Edit customer"
                            >
                              <i className="bi bi-pencil text-primary"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-light border cl-icon-btn"
                              onClick={() => openDeleteModal(c)}
                              title="Delete customer permanently"
                            >
                              <i className="bi bi-trash3 text-danger"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination — every page reachable (First/Last, sliding window, Go to page) */}
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                limit={pagination.limit}
                itemLabel="customers"
                onPageChange={(p) => goToPage(p)}
                onLimitChange={(l) => goToPage(1, l)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerList;