import React from 'react';

const Settings = () => {
  return (
    <div>
      <h4 className="mb-4">Settings</h4>
      <div className="card">
        <div className="card-header"><h5 className="mb-0">Company Information</h5></div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6"><label className="form-label">Company Name</label><input type="text" className="form-control" defaultValue="R-ONE" /></div>
            <div className="col-md-6"><label className="form-label">Email</label><input type="email" className="form-control" defaultValue="info@rentalcompany.com" /></div>
          </div>
          <button className="btn btn-primary mt-3"><i className="bi bi-check-circle me-2"></i>Save Changes</button>
        </div>
      </div>
    </div>
  );
};
export default Settings;