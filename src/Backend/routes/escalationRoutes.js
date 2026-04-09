const express = require('express');
const router = express.Router();
const escalationController = require('../controllers/escalationController');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validator');

// All routes require authentication
router.use(authenticate);

// Get escalation statistics
router.get('/statistics', escalationController.getEscalationStats);

// Get upcoming escalations
router.get('/upcoming', escalationController.getUpcomingEscalations);

// Generate escalations (Admin only)
router.post(
  '/generate',
  authorize('SUPERADMIN', 'ADMIN'),
  escalationController.generateEscalations
);

// Get all escalations
router.get('/', escalationController.getAllEscalations);

// Get escalation by customer
router.get(
  '/customer/:customerId',
  param('customerId').isUUID(),
  handleValidationErrors,
  escalationController.getEscalationByCustomer
);

// Get escalation timeline
router.get(
  '/timeline/:customerId',
  param('customerId').isUUID(),
  handleValidationErrors,
  escalationController.getEscalationTimeline
);

// Create escalation (Admin only)
router.post(
  '/',
  authorize('ADMIN'),
  [
    body('customerId').isUUID(),
    body('escalationType').isIn(['FIRST', 'SECOND']),
    body('escalationDate').isISO8601(),
    body('currentRent').isFloat({ min: 0 }),
    body('newRent').isFloat({ min: 0 }),
    body('increaseAmount').isFloat({ min: 0 }),
    body('increasePercentage').isFloat({ min: 0 })
  ],
  handleValidationErrors,
  escalationController.createEscalation
);

// Apply escalation (Admin only)
router.post(
  '/:id/apply',
  authorize('SUPERADMIN', 'ADMIN'),
  param('id').isUUID(),
  handleValidationErrors,
  escalationController.applyEscalation
);

module.exports = router;