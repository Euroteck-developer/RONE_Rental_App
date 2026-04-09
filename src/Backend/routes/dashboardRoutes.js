const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get('/stats', dashboardController.getDashboardStats);

// Get payment trends
router.get('/trends', dashboardController.getPaymentTrends);

// Get recent activity
router.get('/activity', dashboardController.getRecentActivity);

// Get monthly summary
router.get('/monthly-summary', dashboardController.getMonthlySummary);

module.exports = router;