// const express = require('express');
// const router  = express.Router();

// const { authenticate, authorize } = require('../middleware/auth');

// const {
//   calculatePayment,
//   getPaymentSchedule,
//   getPaymentById,
//   createPaymentSchedule,
//   generateMonthlyPayments,
//   initiatePaymentBatch,
//   completePayment,
//   getPaymentHistory,
//   getPaymentStats,
//   createEasebuzzOrder,
//   verifyEasebuzzPayment,
//   handleEasebuzzFailure,
//   resetOrderCreated,
//   savePaymentWithAdjustment,
//   } = require('../controllers/paymentController');

// router.use(authenticate);

// router.get(
//   '/stats',
//   authorize('SUPERADMIN', 'ADMIN'),
//   getPaymentStats
// );

// router.get(
//   '/history',
//   authorize('SUPERADMIN', 'ADMIN'),
//   getPaymentHistory
// );

// router.get(
//   '/schedule',
//   authorize('SUPERADMIN', 'ADMIN'),
//   getPaymentSchedule
// );

// router.post(
//   '/schedule',
//   authorize('SUPERADMIN', 'ADMIN'),
//   createPaymentSchedule
// );

// router.post(
//   '/generate-monthly',
//   authorize('SUPERADMIN', 'ADMIN'),
//   generateMonthlyPayments
// );

// router.post(
//   '/batch/initiate',
//   authorize('SUPERADMIN', 'ADMIN'),
//   initiatePaymentBatch
// );

// // ── Easebuzz gateway ──────────────────────────────────────────────────────────
// router.post(
//   '/easebuzz/create-order',
//   authorize('SUPERADMIN', 'ADMIN'),
//   createEasebuzzOrder
// );

// router.post(
//   '/easebuzz/verify',
//   authorize('SUPERADMIN', 'ADMIN'),
//   verifyEasebuzzPayment
// );

// router.post(
//   '/easebuzz/failure',
//   authorize('SUPERADMIN', 'ADMIN'),
//   handleEasebuzzFailure
// );
// // ─────────────────────────────────────────────────────────────────────────────

// router.post(
//   '/calculate',
//   authorize('SUPERADMIN', 'ADMIN'),
//   calculatePayment
// );

// // Note: removed the erroneous '/payments/' prefix that was in the original
// router.post(
//   '/reset-order-created',
//   authorize('SUPERADMIN', 'ADMIN'),
//   resetOrderCreated
// );

// router.get(
//   '/:id',
//   authorize('SUPERADMIN', 'ADMIN'),
//   getPaymentById
// );

// router.post(
//   '/save-with-adjustment',
//   authorize('SUPERADMIN', 'ADMIN'),
//   savePaymentWithAdjustment
// );

// router.put(
//   '/:id/complete',
//   authorize('SUPERADMIN', 'ADMIN'),
//   completePayment
// );

// module.exports = router;

const express = require('express');
const router  = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  calculatePayment,
  getPaymentSchedule,
  getPaymentById,
  createPaymentSchedule,
  generateMonthlyPayments,
  initiatePaymentBatch,
  completePayment,
  getPaymentHistory,
  getPaymentStats,
  createEasebuzzOrder,
  verifyEasebuzzPayment,
  handleEasebuzzFailure,
  resetOrderCreated,
  savePaymentWithAdjustment,
  getPaymentByMonth,
  getSavedAdjustments,
} = require('../controllers/paymentController');

router.use(authenticate);

// ── Stats / History / Schedule (named GET routes — must come before /:id) ──
router.get('/stats',    authorize('SUPERADMIN', 'ADMIN'), getPaymentStats);
router.get('/history',  authorize('SUPERADMIN', 'ADMIN'), getPaymentHistory);
router.get('/schedule', authorize('SUPERADMIN', 'ADMIN'), getPaymentSchedule);

// ── Named GET routes for adjustment data — MUST be before /:id ─────────────
// GET /payments/by-month?customerId=X&rentMonth=YYYY-MM
router.get('/by-month',          authorize('SUPERADMIN', 'ADMIN'), getPaymentByMonth);
// GET /payments/saved-adjustments?customerId=X&month=YYYY-MM
router.get('/saved-adjustments', authorize('SUPERADMIN', 'ADMIN'), getSavedAdjustments);

// ── POST routes ─────────────────────────────────────────────────────────────
router.post('/schedule',          authorize('SUPERADMIN', 'ADMIN'), createPaymentSchedule);
router.post('/generate-monthly',  authorize('SUPERADMIN', 'ADMIN'), generateMonthlyPayments);
router.post('/batch/initiate',    authorize('SUPERADMIN', 'ADMIN'), initiatePaymentBatch);
router.post('/calculate',         authorize('SUPERADMIN', 'ADMIN'), calculatePayment);
router.post('/reset-order-created', authorize('SUPERADMIN', 'ADMIN'), resetOrderCreated);

// ── Save with adjustment — MUST be before /:id ─────────────────────────────
router.post('/save-with-adjustment', authorize('SUPERADMIN', 'ADMIN'), savePaymentWithAdjustment);

// ── Easebuzz gateway ────────────────────────────────────────────────────────
router.post('/easebuzz/create-order', authorize('SUPERADMIN', 'ADMIN'), createEasebuzzOrder);
router.post('/easebuzz/verify',       authorize('SUPERADMIN', 'ADMIN'), verifyEasebuzzPayment);
router.post('/easebuzz/failure',      authorize('SUPERADMIN', 'ADMIN'), handleEasebuzzFailure);

// ── Parameterised routes — MUST be last ─────────────────────────────────────
// Express matches routes top-to-bottom; putting /:id before named routes
// would cause GET /by-month to match /:id with id='by-month'.
router.get('/:id',        authorize('SUPERADMIN', 'ADMIN'), getPaymentById);
router.put('/:id/complete', authorize('SUPERADMIN', 'ADMIN'), completePayment);

module.exports = router;