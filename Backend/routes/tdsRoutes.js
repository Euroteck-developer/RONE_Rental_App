// const express = require('express');
// const router = express.Router();
// const tdsController = require('../controllers/tdsController');
// const { authenticate, authorize } = require('../middleware/auth');

// // All routes require authentication
// router.use(authenticate);

// // Get all TDS records (with filters)
// router.get('/', tdsController.getAllTDS);

// // Get monthly TDS records
// router.get('/monthly', tdsController.getMonthlyTDS);

// // Get quarterly TDS summary
// router.get('/quarterly', tdsController.getQuarterlyTDS);

// // Get TDS statistics
// router.get('/statistics', tdsController.getTDSStats);

// // Generate TDS certificate
// router.post('/certificate/generate', 
// //   authorize(['Admin', 'Manager', 'Accountant']),
//   tdsController.generateCertificate
// );

// // Get TDS certificates
// router.get('/certificates', tdsController.getCertificates);

// router.get('/summary', authenticate, tdsController.getTDSSummary);

// // Download TDS certificate
// router.get('/certificate/:certificateId/download', tdsController.downloadCertificate);

// // Update certificate status
// router.put('/certificate/:certificateId/status',
// //   authorize(['Admin', 'Manager']),
//   tdsController.updateCertificateStatus
// );

// module.exports = router;

const express = require('express');
const router = express.Router();
const tdsController = require('../controllers/tdsController');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: TDS
 *   description: TDS records and certificate management
 */

router.use(authenticate);

/**
 * @swagger
 * /api/tds:
 *   get:
 *     summary: Get all TDS records
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: TDS records list
 */
router.get('/', tdsController.getAllTDS);

/**
 * @swagger
 * /api/tds/monthly:
 *   get:
 *     summary: Get monthly TDS records
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monthly TDS data
 */
router.get('/monthly', tdsController.getMonthlyTDS);

/**
 * @swagger
 * /api/tds/quarterly:
 *   get:
 *     summary: Get quarterly TDS summary
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quarterly TDS summary
 */
router.get('/quarterly', tdsController.getQuarterlyTDS);

/**
 * @swagger
 * /api/tds/statistics:
 *   get:
 *     summary: Get TDS statistics
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TDS statistics
 */
router.get('/statistics', tdsController.getTDSStats);

/**
 * @swagger
 * /api/tds/summary:
 *   get:
 *     summary: Get TDS summary
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TDS summary
 */
router.get('/summary', tdsController.getTDSSummary);

/**
 * @swagger
 * /api/tds/certificates:
 *   get:
 *     summary: Get all TDS certificates
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of certificates
 */
router.get('/certificates', tdsController.getCertificates);

/**
 * @swagger
 * /api/tds/certificate/generate:
 *   post:
 *     summary: Generate TDS certificate
 *     tags: [TDS]
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
 *         description: Certificate generated
 */
router.post('/certificate/generate', tdsController.generateCertificate);

/**
 * @swagger
 * /api/tds/certificate/{certificateId}/download:
 *   get:
 *     summary: Download TDS certificate
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate file
 */
router.get('/certificate/:certificateId/download', tdsController.downloadCertificate);

/**
 * @swagger
 * /api/tds/certificate/{certificateId}/status:
 *   put:
 *     summary: Update certificate status
 *     tags: [TDS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/certificate/:certificateId/status', tdsController.updateCertificateStatus);

module.exports = router;