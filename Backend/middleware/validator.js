const { body, validationResult } = require('express-validator');
const validator = require('validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({ field: err.path, message: err.msg }))
    });
  }
  next();
};

const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  return validator.escape(value.replace(/<[^>]*>/g, '').trim());
};

const validationRules = {
  login: [
    body('email').trim().isEmail().normalizeEmail().customSanitizer(sanitizeString),
    body('password').trim().notEmpty()
  ],
  
  register: [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').trim().isLength({ min: 12 }),
    body('name').trim().isLength({ min: 2, max: 255 }).customSanitizer(sanitizeString),
    body('role').optional().isIn(['ADMIN', 'LANDLORD', 'TENANT'])
  ],
  
  changePassword: [
    body('currentPassword').trim().notEmpty(),
    body('newPassword').trim().isLength({ min: 12 }),
    body('confirmPassword').custom((value, { req }) => value === req.body.newPassword)
  ]
};

const preventInjection = (req, res, next) => {
  const checkValue = (value) => {
    if (typeof value !== 'string') return false;
    const dangerous = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i,
      /(--|\|\||;)/,
      /(\bOR\b.*=.*)/i
    ];
    return dangerous.some(pattern => pattern.test(value));
  };

  const allInputs = [
    ...Object.values(req.query || {}),
    ...Object.values(req.body || {}),
    ...Object.values(req.params || {})
  ];

  if (allInputs.some(checkValue)) {
    return res.status(400).json({ success: false, error: 'Invalid input detected' });
  }
  next();
};

module.exports = { validationRules, handleValidationErrors, preventInjection };