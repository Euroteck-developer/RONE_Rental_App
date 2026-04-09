const express = require('express');
const router = express.Router();
const financialController = require('../controllers/financialController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Create or Update Financial Record
router.post('/', financialController.upsertFinancialRecord);

// Get All Financial Records (with pagination & search)
router.get('/', financialController.getAllFinancialRecords);

// Get Financial Summary/Statistics
router.get('/summary', financialController.getFinancialSummary);

// Get Financial Record by Customer ID
router.get('/customer/:customerId', financialController.getFinancialRecordByCustomer);

// Delete Financial Record
router.delete('/:id', financialController.deleteFinancialRecord);

module.exports = router;