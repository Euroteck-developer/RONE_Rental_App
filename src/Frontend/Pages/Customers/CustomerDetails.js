import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import customerService from '../../Services/customer.service';
import { formatCurrency, formatDate, maskBankAccount } from '../../Utils/helpers';

const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const fetchCustomer = async () => {
    try {
      const data = await customerService.getCustomerById(id);
      setCustomer(data);
      setLoading(false);
    } catch (error) {
      toast.error('Failed to load customer');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="spinner-container"><div className="spinner-border text-primary"></div></div>;
  }

  if (!customer) {
    return <div className="alert alert-warning">Customer not found</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4>Customer Details</h4>
          <p className="text-muted">Complete information for {customer.customerName}</p>
        </div>
        <div className="d-flex gap-2">
          <Link to={`/customers/edit/${id}`} className="btn btn-primary">
            <i className="bi bi-pencil me-2"></i>Edit
          </Link>
          <button className="btn btn-outline-secondary" onClick={() => navigate('/customers')}>
            <i className="bi bi-arrow-left me-2"></i>Back
          </button>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body text-center">
              <div className="mb-3">
                <div className="user-avatar mx-auto" style={{width: '100px', height: '100px', fontSize: '40px'}}>
                  {customer.customerName.charAt(0)}
                </div>
              </div>
              <h5>{customer.customerName}</h5>
              <p className="text-muted">{customer.customerId}</p>
              <span className={`badge ${customer.status === 'Active' ? 'bg-success' : 'bg-secondary'} mb-3`}>
                {customer.status}
              </span>
              <div className="d-grid gap-2">
                <a href={`mailto:${customer.email}`} className="btn btn-outline-primary">
                  <i className="bi bi-envelope me-2"></i>Send Email
                </a>
                <a href={`tel:${customer.phone}`} className="btn btn-outline-success">
                  <i className="bi bi-telephone me-2"></i>Call
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card mb-4">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0"><i className="bi bi-person me-2"></i>Personal Information</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="text-muted small">Email</label>
                  <div className="fw-semibold">{customer.email}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">Phone</label>
                  <div className="fw-semibold">{customer.phone}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">PAN Number</label>
                  <div className="fw-semibold"><code>{customer.panNumber}</code></div>
                </div>
                <div className="col-md-12">
                  <label className="text-muted small">Address</label>
                  <div className="fw-semibold">{customer.address || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header bg-success text-white">
              <h5 className="mb-0"><i className="bi bi-bank me-2"></i>Bank Details</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="text-muted small">Bank Name</label>
                  <div className="fw-semibold">{customer.bankName}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">Account Number</label>
                  <div className="fw-semibold"><code>{maskBankAccount(customer.bankAccountNumber)}</code></div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">IFSC Code</label>
                  <div className="fw-semibold"><code>{customer.ifscCode}</code></div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0"><i className="bi bi-building me-2"></i>Property Details</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="text-muted small">Property Name</label>
                  <div className="fw-semibold">{customer.propertyName}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">Agreement Type</label>
                  <div className="fw-semibold">{customer.agreementType}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">Construction Rent</label>
                  <div className="fw-semibold">{formatCurrency(customer.constructionMonthlyRent)}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">9-Year Base Rent</label>
                  <div className="fw-semibold">{formatCurrency(customer.baseRent9Year)}</div>
                </div>
                <div className="col-md-6">
                  <label className="text-muted small">TDS Applicable</label>
                  <div className="fw-semibold">{customer.tdsApplicable === 'Y' ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDetails;