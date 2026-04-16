import React from 'react';

const ReceiptView = () => {
  return (
    <div>
      <h4 className="mb-4">Receipt View</h4>
      <div className="card">
        <div className="card-body">
          <div className="text-center mb-4">
            <h3>RENTAL PAYMENT RECEIPT</h3>
            <p>Receipt No: REC-202601-001</p>
          </div>
          <div className="row">
            <div className="col-6"><strong>Customer:</strong> Rajesh Kumar</div>
            <div className="col-6"><strong>Date:</strong> 05-Jan-2026</div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ReceiptView;