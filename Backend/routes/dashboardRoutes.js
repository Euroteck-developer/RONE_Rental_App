// const express = require('express');
// const router = express.Router();
// const dashboardController = require('../controllers/dashboardController');
// const { authenticate } = require('../middleware/auth');

// // All routes require authentication
// router.use(authenticate);

// // Get dashboard statistics
// router.get('/stats', dashboardController.getDashboardStats);

// // Get payment trends
// router.get('/trends', dashboardController.getPaymentTrends);

// // Get recent activity
// router.get('/activity', dashboardController.getRecentActivity);

// // Get monthly summary
// router.get('/monthly-summary', dashboardController.getMonthlySummary);

// module.exports = router;

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard statistics and insights
 */

router.use(authenticate);

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats returned
 */
router.get('/stats', dashboardController.getDashboardStats);

/**
 * @swagger
 * /api/dashboard/trends:
 *   get:
 *     summary: Get payment trends
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment trends data
 */
router.get('/trends', dashboardController.getPaymentTrends);

/**
 * @swagger
 * /api/dashboard/activity:
 *   get:
 *     summary: Get recent activity
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent activity list
 */
router.get('/activity', dashboardController.getRecentActivity);

/**
 * @swagger
 * /api/dashboard/monthly-summary:
 *   get:
 *     summary: Get monthly summary
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monthly summary data
 */
router.get('/monthly-summary', dashboardController.getMonthlySummary);

module.exports = router;