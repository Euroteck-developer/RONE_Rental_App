const express = require('express');
const router = express.Router();
const authController = require('../controllers/authContoller');
const { authenticate } = require('../middleware/auth');
const { strictRateLimit } = require('../middleware/rateLimiter');
const { validationRules, handleValidationErrors } = require('../middleware/validator');

router.post('/register', strictRateLimit, validationRules.register, handleValidationErrors, authController.register);
router.post('/login', strictRateLimit, validationRules.login, handleValidationErrors, authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp',      authController.verifyOTP);
router.post('/reset-password',  authController.resetPassword);
router.post('/refresh', authController.refreshAccessToken);
router.post('/logout', authController.logout);
router.post('/change-password', authenticate, validationRules.changePassword, handleValidationErrors, authController.changePassword);

module.exports = router;