// const express = require('express');
// const router = express.Router();
// const escalationController = require('../controllers/escalationController');
// const { authenticate, authorize } = require('../middleware/auth');
// const { body, param } = require('express-validator');
// const { handleValidationErrors } = require('../middleware/validator');

// // All routes require authentication
// router.use(authenticate);

// // Get escalation statistics
// router.get('/statistics', escalationController.getEscalationStats);

// // Get upcoming escalations
// router.get('/upcoming', escalationController.getUpcomingEscalations);

// // Generate escalations (Admin only)
// router.post(
//   '/generate',
//   authorize('SUPERADMIN', 'ADMIN'),
//   escalationController.generateEscalations
// );

// // Get all escalations
// router.get('/', escalationController.getAllEscalations);

// // Get escalation by customer
// router.get(
//   '/customer/:customerId',
//   param('customerId').isUUID(),
//   handleValidationErrors,
//   escalationController.getEscalationByCustomer
// );

// // Get escalation timeline
// router.get(
//   '/timeline/:customerId',
//   param('customerId').isUUID(),
//   handleValidationErrors,
//   escalationController.getEscalationTimeline
// );

// // Create escalation (Admin only)
// router.post(
//   '/',
//   authorize('ADMIN'),
//   [
//     body('customerId').isUUID(),
//     body('escalationType').isIn(['FIRST', 'SECOND']),
//     body('escalationDate').isISO8601(),
//     body('currentRent').isFloat({ min: 0 }),
//     body('newRent').isFloat({ min: 0 }),
//     body('increaseAmount').isFloat({ min: 0 }),
//     body('increasePercentage').isFloat({ min: 0 })
//   ],
//   handleValidationErrors,
//   escalationController.createEscalation
// );

// // Apply escalation (Admin only)
// router.post(
//   '/:id/apply',
//   authorize('SUPERADMIN', 'ADMIN'),
//   param('id').isUUID(),
//   handleValidationErrors,
//   escalationController.applyEscalation
// );

// module.exports = router;


const express = require('express');
const router = express.Router();
const escalationController = require('../controllers/escalationController');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validator');

/**
 * @swagger
 * tags:
 *   name: Escalations
 *   description: Escalation management
 */

router.use(authenticate);

/**
 * @swagger
 * /api/escalations/statistics:
 *   get:
 *     summary: Get escalation statistics
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Escalation statistics
 */
router.get('/statistics', escalationController.getEscalationStats);

/**
 * @swagger
 * /api/escalations/upcoming:
 *   get:
 *     summary: Get upcoming escalations
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of upcoming escalations
 */
router.get('/upcoming', escalationController.getUpcomingEscalations);

/**
 * @swagger
 * /api/escalations/generate:
 *   post:
 *     summary: Generate escalations (SUPERADMIN/ADMIN only)
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Escalations generated
 *       403:
 *         description: Forbidden
 */
router.post('/generate', authorize('SUPERADMIN', 'ADMIN'), escalationController.generateEscalations);

/**
 * @swagger
 * /api/escalations:
 *   get:
 *     summary: Get all escalations
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of escalations
 */
router.get('/', escalationController.getAllEscalations);

/**
 * @swagger
 * /api/escalations/customer/{customerId}:
 *   get:
 *     summary: Get escalation by customer
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Escalation data for customer
 */
router.get('/customer/:customerId', param('customerId').isUUID(), handleValidationErrors, escalationController.getEscalationByCustomer);

/**
 * @swagger
 * /api/escalations/timeline/{customerId}:
 *   get:
 *     summary: Get escalation timeline for customer
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Escalation timeline
 */
router.get('/timeline/:customerId', param('customerId').isUUID(), handleValidationErrors, escalationController.getEscalationTimeline);

/**
 * @swagger
 * /api/escalations:
 *   post:
 *     summary: Create escalation (ADMIN only)
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, escalationType, escalationDate, currentRent, newRent, increaseAmount, increasePercentage]
 *             properties:
 *               customerId:
 *                 type: string
 *                 format: uuid
 *               escalationType:
 *                 type: string
 *                 enum: [FIRST, SECOND]
 *               escalationDate:
 *                 type: string
 *                 format: date
 *               currentRent:
 *                 type: number
 *               newRent:
 *                 type: number
 *               increaseAmount:
 *                 type: number
 *               increasePercentage:
 *                 type: number
 *     responses:
 *       201:
 *         description: Escalation created
 *       403:
 *         description: Forbidden
 */
router.post('/', authorize('ADMIN'), [
  body('customerId').isUUID(),
  body('escalationType').isIn(['FIRST', 'SECOND']),
  body('escalationDate').isISO8601(),
  body('currentRent').isFloat({ min: 0 }),
  body('newRent').isFloat({ min: 0 }),
  body('increaseAmount').isFloat({ min: 0 }),
  body('increasePercentage').isFloat({ min: 0 })
], handleValidationErrors, escalationController.createEscalation);

/**
 * @swagger
 * /api/escalations/{id}/apply:
 *   post:
 *     summary: Apply escalation (SUPERADMIN/ADMIN only)
 *     tags: [Escalations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Escalation applied
 *       403:
 *         description: Forbidden
 */
router.post('/:id/apply', authorize('SUPERADMIN', 'ADMIN'), param('id').isUUID(), handleValidationErrors, escalationController.applyEscalation);

module.exports = router;