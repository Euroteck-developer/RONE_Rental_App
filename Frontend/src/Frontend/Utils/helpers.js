import { parse } from 'date-fns';

// Format currency
// export const formatCurrency = (amount) => {
//   return new Intl.NumberFormat('en-IN', {
//     style: 'currency',
//     currency: 'INR',
//     minimumFractionDigits: 0,
//     maximumFractionDigits: 0
//   }).format(amount);
// };

export const formatCurrency = (amount, forPDF = false) => {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);

  return forPDF ? formatted.replace('₹', 'Rs. ') : formatted;
};


// Format date
// export const formatDate = (date, formatStr = 'dd-MMM-yyyy') => {
//   if (!date) return '-';
//   try {
//     const dateObj = typeof date === 'string' ? parseISO(date) : date;
//     return isValid(dateObj) ? format(dateObj, formatStr) : '-';
//   } catch {
//     return '-';
//   }
// };

export const formatDate = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// Parse date
export const parseDate = (dateString, formatStr = 'yyyy-MM-dd') => {
  if (!dateString) return null;
  try {
    return parse(dateString, formatStr, new Date());
  } catch {
    return null;
  }
};

// Validate PAN
export const validatePAN = (pan) => {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
  return panRegex.test(pan);
};

// Validate IFSC
export const validateIFSC = (ifsc) => {
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return ifscRegex.test(ifsc);
};

// Validate Email
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate Phone
export const validatePhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

// Mask bank account number
export const maskBankAccount = (accountNumber) => {
  if (!accountNumber) return '';
  const length = accountNumber.length;
  if (length <= 4) return accountNumber;
  return '*'.repeat(length - 4) + accountNumber.slice(-4);
};

// Mask PAN
export const maskPAN = (pan) => {
  if (!pan) return '';
  if (pan.length !== 10) return pan;
  return pan.slice(0, 2) + '*'.repeat(6) + pan.slice(-2);
};

// Calculate TDS
export const calculateTDS = (amount) => {
  return amount >= 50000 ? amount * 0.10 : 0;
};

// Calculate escalated rent
export const calculateEscalatedRent = (baseRent, yearsFromOccupancy) => {
  if (yearsFromOccupancy < 3) {
    return baseRent; // Years 1-3
  } else if (yearsFromOccupancy < 6) {
    return baseRent * 1.15; // Years 4-6 (15% increase)
  } else {
    return baseRent * 1.3225; // Years 7-9 (32.25% total)
  }
};

// Get status badge class
export const getStatusBadgeClass = (status) => {
  const statusMap = {
    'Active': 'bg-success',
    'Inactive': 'bg-secondary',
    'Pending': 'bg-warning text-dark',
    'Completed': 'bg-success',
    'Failed': 'bg-danger',
    'Processing': 'bg-info'
  };
  return statusMap[status] || 'bg-secondary';
};

// Get payment status badge
export const getPaymentStatusBadge = (status) => {
  const statusMap = {
    'Pending': { class: 'bg-warning text-dark', icon: 'bi-clock' },
    'Completed': { class: 'bg-success', icon: 'bi-check-circle' },
    'Failed': { class: 'bg-danger', icon: 'bi-x-circle' },
    'Processing': { class: 'bg-info', icon: 'bi-arrow-repeat' }
  };
  return statusMap[status] || { class: 'bg-secondary', icon: 'bi-question-circle' };
};

// Download file
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Get financial year
export const getFinancialYear = (date = new Date()) => {
  const month = date.getMonth();
  const year = date.getFullYear();
  
  if (month < 3) { // Jan, Feb, Mar
    return `FY${year - 1}-${year.toString().slice(-2)}`;
  } else {
    return `FY${year}-${(year + 1).toString().slice(-2)}`;
  }
};

// Get quarter
export const getQuarter = (date = new Date()) => {
  const month = date.getMonth();
  
  if (month >= 3 && month <= 5) return 'Q1';
  if (month >= 6 && month <= 8) return 'Q2';
  if (month >= 9 && month <= 11) return 'Q3';
  return 'Q4';
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Generate receipt number
export const generateReceiptNumber = (prefix = 'REC') => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${year}${month}-${random}`;
};

// Export to CSV
export const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => 
      JSON.stringify(row[header] || '')
    ).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, `${filename}.csv`);
};
