const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { calculatePayment, getPaymentSchedule, getPaymentById, createPaymentSchedule, generateMonthlyPayments, initiatePaymentBatch, completePayment, getPaymentHistory, getPaymentStats,  resetOrderCreated, savePaymentWithAdjustment, getPaymentByMonth, getSavedAdjustments } = require('../controllers/paymentController');

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment management and gateway integration
 */

router.use(authenticate);

/**
 * @swagger
 * /api/payments/stats:
 *   get:
 *     summary: Get payment statistics (SUPERADMIN/ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment statistics
 */
router.get('/stats', authorize('SUPERADMIN', 'ADMIN'), getPaymentStats);

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Get payment history (SUPERADMIN/ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment history list
 */
router.get('/history', authorize('SUPERADMIN', 'ADMIN'), getPaymentHistory);

/**
 * @swagger
 * /api/payments/schedule:
 *   get:
 *     summary: Get payment schedule (SUPERADMIN/ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment schedule
 */
router.get('/schedule', authorize('SUPERADMIN', 'ADMIN'), getPaymentSchedule);

/**
 * @swagger
 * /api/payments/by-month:
 *   get:
 *     summary: Get payment by month
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: rentMonth
 *         required: true
 *         schema:
 *           type: string
 *           example: "2024-01"
 *     responses:
 *       200:
 *         description: Payment data for month
 */
router.get('/by-month', authorize('SUPERADMIN', 'ADMIN'), getPaymentByMonth);

/**
 * @swagger
 * /api/payments/saved-adjustments:
 *   get:
 *     summary: Get saved payment adjustments
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2024-01"
 *     responses:
 *       200:
 *         description: Saved adjustments
 */
router.get('/saved-adjustments', authorize('SUPERADMIN', 'ADMIN'), getSavedAdjustments);

/**
 * @swagger
 * /api/payments/schedule:
 *   post:
 *     summary: Create payment schedule (SUPERADMIN/ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Schedule created
 */
router.post('/schedule', authorize('SUPERADMIN', 'ADMIN'), createPaymentSchedule);

/**
 * @swagger
 * /api/payments/generate-monthly:
 *   post:
 *     summary: Generate monthly payments (SUPERADMIN/ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monthly payments generated
 */
router.post('/generate-monthly', authorize('SUPERADMIN', 'ADMIN'), generateMonthlyPayments);

/**
 * @swagger
 * /api/payments/batch/initiate:
 *   post:
 *     summary: Initiate payment batch (SUPERADMIN/ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Batch initiated
 */
router.post('/batch/initiate', authorize('SUPERADMIN', 'ADMIN'), initiatePaymentBatch);

/**
 * @swagger
 * /api/payments/calculate:
 *   post:
 *     summary: Calculate payment amount
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Calculated payment
 */
router.post('/calculate', authorize('SUPERADMIN', 'ADMIN'), calculatePayment);

/**
 * @swagger
 * /api/payments/reset-order-created:
 *   post:
 *     summary: Reset order created flag
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order reset successful
 */
router.post('/reset-order-created', authorize('SUPERADMIN', 'ADMIN'), resetOrderCreated);

/**
 * @swagger
 * /api/payments/save-with-adjustment:
 *   post:
 *     summary: Save payment with adjustment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Payment saved with adjustment
 */
router.post('/save-with-adjustment', authorize('SUPERADMIN', 'ADMIN'), savePaymentWithAdjustment);

/**
 * @swagger
 * /api/payments/easebuzz/create-order:
 *   post:
 *     summary: Create Easebuzz payment order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Order created
 */
// router.post('/easebuzz/create-order', authorize('SUPERADMIN', 'ADMIN'), createEasebuzzOrder);

/**
 * @swagger
 * /api/payments/easebuzz/verify:
 *   post:
 *     summary: Verify Easebuzz payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment verified
 */
// router.post('/easebuzz/verify', authorize('SUPERADMIN', 'ADMIN'), verifyEasebuzzPayment);

/**
 * @swagger
 * /api/payments/easebuzz/failure:
 *   post:
 *     summary: Handle Easebuzz payment failure
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Failure handled
 */
// router.post('/easebuzz/failure', authorize('SUPERADMIN', 'ADMIN'), handleEasebuzzFailure);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Payments]
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
 *         description: Payment found
 *       404:
 *         description: Not found
 */
router.get('/:id', authorize('SUPERADMIN', 'ADMIN'), getPaymentById);

/**
 * @swagger
 * /api/payments/{id}/complete:
 *   put:
 *     summary: Complete a payment
 *     tags: [Payments]
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
 *         description: Payment completed
 */
router.put('/:id/complete', authorize('SUPERADMIN', 'ADMIN'), completePayment);

module.exports = router;