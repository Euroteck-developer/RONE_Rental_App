import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import escalationService from '../../Services/escalation.service';
import { formatCurrency, formatDate } from '../../Utils/helpers';

const Escalation = () => {
  const [escalations, setEscalations]   = useState([]);
  const [pagination, setPagination]     = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [stats, setStats] = useState({
    upcomingCount: 0, escalationRate: 0, totalIncrease: 0,
    total9YearCustomers: 0, totalConstructionCustomers: 0,
    pendingCount: 0, appliedCount: 0
  });
  const [loading, setLoading]       = useState(false);
  const [generating, setGenerating] = useState(false);
  const [processing, setProcessing] = useState({});

  useEffect(() => { fetchEscalations(); }, [pagination.page, filterStatus, filterType]);
  useEffect(() => { fetchStats(); }, []);

  // ── Fetch from escalations table (real records) ─────────────
  const fetchEscalations = async () => {
    try {
      setLoading(true);
      const result = await escalationService.getAllEscalations({
        page:   pagination.page,
        limit:  pagination.limit,
        status: filterStatus || undefined,
        type:   filterType   || undefined,
      });
      setEscalations(result.data.escalations || []);
      setPagination(prev => ({ ...prev, ...result.data.pagination }));
    } catch (error) {
      toast.error(error.error || 'Failed to load escalations');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const result = await escalationService.getEscalationStats();
      const d = result.data;
      setStats({
        upcomingCount:              parseInt(d.upcoming_escalations)          || 0,
        escalationRate:             parseFloat(d.avg_increase_percentage)     || 0,
        totalIncrease:              parseFloat(d.total_increase_amount)       || 0,
        total9YearCustomers:        parseInt(d.total_9year_customers)         || 0,
        totalConstructionCustomers: parseInt(d.total_construction_customers)  || 0,
        pendingCount:               parseInt(d.pending_escalations)           || 0,
        appliedCount:               parseInt(d.applied_escalations)           || 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleApplyEscalation = async (escalationId, customerName) => {
    if (!window.confirm(`Apply escalation for ${customerName}?\n\nThis will update the base rent permanently.`)) return;
    try {
      setProcessing(prev => ({ ...prev, [escalationId]: true }));
      await escalationService.applyEscalation(escalationId);
      toast.success('Escalation applied successfully');
      fetchEscalations();
      fetchStats();
    } catch (error) {
      toast.error(error.error || 'Failed to apply escalation');
    } finally {
      setProcessing(prev => ({ ...prev, [escalationId]: false }));
    }
  };

  const handleGenerateEscalations = async () => {
    if (!window.confirm('Generate escalations for all eligible Floor 7 / 9-Year customers?\n\nExisting escalations will not be duplicated.')) return;
    try {
      setGenerating(true);
      const result = await escalationService.generateEscalations();
      toast.success(result.message);
      if (result.data?.skippedCount > 0) {
        toast.info(`${result.data.skippedCount} already existed — skipped`);
      }
      fetchEscalations();
      fetchStats();
    } catch (error) {
      toast.error(error.error || 'Failed to generate escalations');
    } finally {
      setGenerating(false);
    }
  };

  const handleFilterChange = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchEscalations();
  };

  const statusBadge = (status) => ({
    Pending:   'bg-warning text-dark',
    Applied:   'bg-success',
    Scheduled: 'bg-primary',
    Cancelled: 'bg-secondary',
  }[status] || 'bg-secondary');

  const typeBadge = (type) => ({
    FIRST:  'bg-info text-dark',
    SECOND: 'bg-danger',
  }[type] || 'bg-secondary');

  const periodBadge = (period = '') => {
    if (period.includes('7-9')) return 'bg-danger';
    if (period.includes('4-6')) return 'bg-warning text-dark';
    return 'bg-info text-dark';
  };

  return (
    <div className="container-fluid px-4 py-3">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h3 className="mb-1 fw-bold">
            <i className="bi bi-graph-up-arrow text-primary me-2"></i>
            Escalation Tracker
          </h3>
          <p className="text-muted mb-0 small">
            Manage rent escalations for Floor 7 / 9-Year rental customers
          </p>
        </div>
        <button className="btn btn-primary shadow-sm" onClick={handleGenerateEscalations} disabled={generating || loading}>
          {generating
            ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</>
            : <><i className="bi bi-arrow-clockwise me-2"></i>Generate Escalations</>
          }
        </button>
      </div>

      {/* ── Policy alert ───────────────────────────────────────── */}
      <div className="alert alert-info border-0 shadow-sm mb-4">
        <div className="d-flex gap-3">
          <i className="bi bi-info-circle-fill fs-4 flex-shrink-0"></i>
          <div>
            <h6 className="alert-heading mb-1">Escalation Policy — Floor 7 / 9-Year Only</h6>
            <p className="mb-1 small">
              Escalations apply <strong>only to Floor 7 customers on 9-Year rental agreements</strong>.
              All other floors receive fixed monthly rent.
            </p>
            <div className="small">
              <strong>Schedule:</strong>
              &nbsp;Years 1–3: Base rent &nbsp;|&nbsp;
              Years 4–6: +15% &nbsp;|&nbsp;
              Years 7–9: +32.25%
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Pending',       value: stats.pendingCount,               icon: 'bi-hourglass-split',  color: 'warning' },
          { label: 'Applied',       value: stats.appliedCount,               icon: 'bi-check-circle-fill', color: 'success' },
          { label: 'Upcoming (6m)', value: stats.upcomingCount,              icon: 'bi-calendar-event',   color: 'primary' },
          { label: 'Total Increase',value: formatCurrency(stats.totalIncrease), icon: 'bi-cash-stack',   color: 'info'    },
        ].map(card => (
          <div key={card.label} className="col-md-3">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body d-flex align-items-center gap-3">
                <div className={`bg-${card.color} bg-opacity-10 text-${card.color} rounded-3 p-3 flex-shrink-0`}>
                  <i className={`bi ${card.icon} fs-3`}></i>
                </div>
                <div>
                  <div className="text-muted small mb-1">{card.label}</div>
                  <h4 className="mb-0 fw-bold">{card.value}</h4>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label small fw-semibold">Status</label>
              <select className="form-select form-select-sm" value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}>
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Applied">Applied</option>
                <option value="Scheduled">Scheduled</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small fw-semibold">Type</label>
              <select className="form-select form-select-sm" value={filterType}
                onChange={e => { setFilterType(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}>
                <option value="">All Types</option>
                <option value="FIRST">FIRST (4-6 Years)</option>
                <option value="SECOND">SECOND (7-9 Years)</option>
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn btn-outline-secondary btn-sm w-100"
                onClick={() => { setFilterStatus(''); setFilterType(''); setPagination(p => ({ ...p, page: 1 })); }}>
                <i className="bi bi-arrow-counterclockwise me-1"></i>Reset
              </button>
            </div>
            <div className="col-md-4 text-end">
              <span className="badge bg-primary fs-6">{pagination.total} Records</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-bottom d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-semibold">
            <i className="bi bi-table me-2"></i>Escalation Records
          </h5>
          <small className="text-muted">{pagination.total} total</small>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <p className="text-muted">Loading escalation records...</p>
            </div>
          ) : escalations.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox text-muted" style={{ fontSize: '4rem', opacity: 0.3 }}></i>
              <h5 className="text-muted mt-3 mb-2">No Escalation Records</h5>
              <p className="text-muted small mb-3">Click Generate to create escalations for eligible customers</p>
              <button className="btn btn-primary" onClick={handleGenerateEscalations} disabled={generating}>
                <i className="bi bi-arrow-clockwise me-2"></i>Generate Escalations
              </button>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Customer</th>
                      <th>Property</th>
                      <th>Type</th>
                      <th className="text-end">Current Rent</th>
                      <th className="text-end">New Rent</th>
                      <th className="text-end">Increase</th>
                      <th>Escalation Date</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escalations.map(esc => (
                      <tr key={esc.id}>
                        <td>
                          <div className="fw-semibold">{esc.customer_name}</div>
                          <small className="text-muted">{esc.customer_code}</small>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark border">{esc.property_name}</span>
                        </td>
                        <td>
                          <span className={`badge ${typeBadge(esc.escalation_type)}`}>
                            {esc.escalation_type}
                          </span>
                        </td>
                        <td className="text-end fw-semibold">{formatCurrency(esc.current_rent)}</td>
                        <td className="text-end fw-bold text-success">{formatCurrency(esc.new_rent)}</td>
                        <td className="text-end">
                          <span className="badge bg-warning text-dark">
                            <i className="bi bi-arrow-up me-1"></i>
                            {formatCurrency(esc.increase_amount)}
                          </span>
                        </td>
                        <td>
                          <i className="bi bi-calendar3 me-1 text-muted"></i>
                          {formatDate(esc.escalation_date)}
                        </td>
                        <td>
                          <span className={`badge ${periodBadge(esc.escalation_period)}`}>
                            {esc.escalation_period}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${statusBadge(esc.status)}`}>{esc.status}</span>
                        </td>
                        <td className="text-center">
                          {esc.status === 'Applied' ? (
                            <span className="text-success small"><i className="bi bi-check-circle me-1"></i>Done</span>
                          ) : (
                            <button className="btn btn-sm btn-primary"
                              onClick={() => handleApplyEscalation(esc.id, esc.customer_name)}
                              disabled={processing[esc.id]}>
                              {processing[esc.id]
                                ? <span className="spinner-border spinner-border-sm"></span>
                                : <><i className="bi bi-check-circle me-1"></i>Apply</>
                              }
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center px-3 py-3 border-top">
                  <small className="text-muted">
                    Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </small>
                  <nav>
                    <ul className="pagination pagination-sm mb-0">
                      <li className={`page-item ${pagination.page === 1 ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>‹</button>
                      </li>
                      {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => (
                        <li key={i + 1} className={`page-item ${pagination.page === i + 1 ? 'active' : ''}`}>
                          <button className="page-link" onClick={() => setPagination(p => ({ ...p, page: i + 1 }))}>{i + 1}</button>
                        </li>
                      ))}
                      <li className={`page-item ${pagination.page === pagination.totalPages ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>›</button>
                      </li>
                    </ul>
                  </nav>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Escalation;