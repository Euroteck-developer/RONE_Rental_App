const express = require('express');
const router = express.Router();
const tdsController = require('../controllers/tdsController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get all TDS records (with filters)
router.get('/', tdsController.getAllTDS);

// Get monthly TDS records
router.get('/monthly', tdsController.getMonthlyTDS);

// Get quarterly TDS summary
router.get('/quarterly', tdsController.getQuarterlyTDS);

// Get TDS statistics
router.get('/statistics', tdsController.getTDSStats);

// Generate TDS certificate
router.post('/certificate/generate', 
//   authorize(['Admin', 'Manager', 'Accountant']),
  tdsController.generateCertificate
);

// Get TDS certificates
router.get('/certificates', tdsController.getCertificates);

router.get('/summary', authenticate, tdsController.getTDSSummary);

// Download TDS certificate
router.get('/certificate/:certificateId/download', tdsController.downloadCertificate);

// Update certificate status
router.put('/certificate/:certificateId/status',
//   authorize(['Admin', 'Manager']),
  tdsController.updateCertificateStatus
);

module.exports = router;