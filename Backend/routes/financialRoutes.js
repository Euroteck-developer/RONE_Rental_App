// const express = require('express');
// const router = express.Router();
// const financialController = require('../controllers/financialController');
// const { authenticate } = require('../middleware/auth');

// // All routes require authentication
// router.use(authenticate);

// // Create or Update Financial Record
// router.post('/', financialController.upsertFinancialRecord);

// // Get All Financial Records (with pagination & search)
// router.get('/', financialController.getAllFinancialRecords);

// // Get Financial Summary/Statistics
// router.get('/summary', financialController.getFinancialSummary);

// // Get Financial Record by Customer ID
// router.get('/customer/:customerId', financialController.getFinancialRecordByCustomer);

// // Delete Financial Record
// router.delete('/:id', financialController.deleteFinancialRecord);

// module.exports = router;

const express = require('express');
const router = express.Router();
const financialController = require('../controllers/financialController');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Financial
 *   description: Financial records management
 */

router.use(authenticate);

/**
 * @swagger
 * /api/financial:
 *   post:
 *     summary: Create or update financial record
 *     tags: [Financial]
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
 *         description: Financial record upserted
 */
router.post('/', financialController.upsertFinancialRecord);

/**
 * @swagger
 * /api/financial:
 *   get:
 *     summary: Get all financial records
 *     tags: [Financial]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of financial records
 */
router.get('/', financialController.getAllFinancialRecords);

/**
 * @swagger
 * /api/financial/summary:
 *   get:
 *     summary: Get financial summary and statistics
 *     tags: [Financial]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Financial summary
 */
router.get('/summary', financialController.getFinancialSummary);

/**
 * @swagger
 * /api/financial/customer/{customerId}:
 *   get:
 *     summary: Get financial record by customer ID
 *     tags: [Financial]
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
 *         description: Financial record for customer
 *       404:
 *         description: Not found
 */
router.get('/customer/:customerId', financialController.getFinancialRecordByCustomer);

/**
 * @swagger
 * /api/financial/{id}:
 *   delete:
 *     summary: Delete financial record
 *     tags: [Financial]
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
 *         description: Record deleted
 *       404:
 *         description: Not found
 */
router.delete('/:id', financialController.deleteFinancialRecord);

module.exports = router;