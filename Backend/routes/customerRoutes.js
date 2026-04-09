const express = require('express');
const router  = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/auth');
const { body, param }             = require('express-validator');
const { handleValidationErrors }  = require('../middleware/validator');

// All routes require authentication
router.use(authenticate);

// ─── Validation rules ──────────────────────────────────────────────────────────
// KEY RULES:
//  1. Sanitise FIRST (.trim / .toUpperCase / .toLowerCase) then validate
//  2. Never use normalizeEmail() — it mutates the value unexpectedly
//  3. Keep express-validator loose; deep regex lives in the controller
// ──────────────────────────────────────────────────────────────────────────────
const customerValidation = [
  // ── Personal
  body('customerName')
    .trim()
    .notEmpty().withMessage('Customer name is required')
    .isLength({ min: 2, max: 255 }).withMessage('Name must be 2–255 characters'),

  body('panNumber')
    .trim()
    .notEmpty().withMessage('PAN is required')
    .customSanitizer((v) => (v ? v.toUpperCase() : v))  // uppercase BEFORE length check
    .isLength({ min: 10, max: 10 }).withMessage('PAN must be exactly 10 characters')
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format (e.g. ABCDE1234F)'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .customSanitizer((v) => (v ? v.toLowerCase() : v))  // lowercase WITHOUT normalizeEmail
    .isEmail().withMessage('Invalid email address'),

  // Phone: allow 10–15 digits (covers Indian 10-digit + NRI international up to 15)
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required')
    .customSanitizer((v) => (v ? v.replace(/[\s\-().+]/g, '') : v)) // strip spaces/dashes/parens
    .isLength({ min: 7, max: 15 }).withMessage('Phone must be 7–15 digits')
    .matches(/^\d{7,15}$/).withMessage('Phone must contain only digits'),

  body('bankAccountNumber')
    .trim()
    .notEmpty().withMessage('Bank account number is required'),

  body('ifscCode')
    .trim()
    .notEmpty().withMessage('IFSC code is required')
    .customSanitizer((v) => (v ? v.toUpperCase().replace(/\s/g, '') : v)) // uppercase + strip spaces
    .isLength({ min: 11, max: 11 }).withMessage('IFSC must be exactly 11 characters')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC format (e.g. SBIN0001234)'),

  body('propertyName')
    .trim()
    .notEmpty().withMessage('Property name is required'),

  body('agreementType')
    .isIn(['Construction', '9-Year']).withMessage('Agreement type must be Construction or 9-Year'),

  // ── Optional GST fields — only validate format when present
  body('gstNo')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((v) => (v ? v.toUpperCase().replace(/\s/g, '') : v))
    .isLength({ min: 15, max: 15 }).withMessage('GST number must be exactly 15 characters')
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST format (e.g. 29ABCDE1234F1Z5)'),

  body('cgst')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('CGST must be between 0 and 100'),

  body('sgst')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('SGST must be between 0 and 100'),

  // ── Optional flags
  body('tdsApplicable')
    .optional()
    .isIn(['Y', 'N']).withMessage('TDS applicable must be Y or N'),

  body('status')
    .optional()
    .isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive'),

  body('nriStatus')
    .optional()
    .isIn(['Yes', 'No']).withMessage('NRI status must be Yes or No'),

  body('dateOfBooking')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Invalid date of booking'),

  body('sqft')
    .optional({ checkFalsy: true })
    .isFloat({ min: 1 }).withMessage('sqft must be a positive number'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// Stats (must be before /:id to avoid UUID mismatch on "stats")
router.get('/stats', customerController.getCustomerStats);

// Create
router.post(
  '/',
  customerValidation,
  handleValidationErrors,
  customerController.createCustomer
);

// List
router.get('/', customerController.getAllCustomers);

// Get by ID
router.get(
  '/:id',
  param('id').isUUID().withMessage('Invalid customer ID'),
  handleValidationErrors,
  customerController.getCustomerById
);

// Update (validations are all optional — only validate fields that are sent)
router.put(
  '/:id',
  param('id').isUUID().withMessage('Invalid customer ID'),
  handleValidationErrors,
  customerController.updateCustomer
);

// Delete preview (SUPERADMIN only)
router.get(
  '/:id/delete-preview',
  authorize('SUPERADMIN'),
  param('id').isUUID().withMessage('Invalid customer ID'),
  handleValidationErrors,
  customerController.getCustomerDeletePreview
);

// Hard delete (SUPERADMIN only)
router.delete(
  '/:id',
  authorize('SUPERADMIN'),
  param('id').isUUID().withMessage('Invalid customer ID'),
  handleValidationErrors,
  customerController.deleteCustomer
);

module.exports = router;