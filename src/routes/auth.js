const express = require('express');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');
const { accountRateLimiter } = require('../middleware/accountRateLimiter');
const router = express.Router();

// POST /api/v1/auth/resend-verification - Resend email verification
router.post(
  '/resend-verification',
  authLimiter,
  accountRateLimiter({ keyPrefix: 'resend', windowSec: 60 * 60, max: 3 }),
  authController.resendVerificationEmail,
);

// POST /api/v1/auth/request-password-reset - Request password reset
router.post(
  '/request-password-reset',
  authLimiter,
  accountRateLimiter({ keyPrefix: 'pwreset', windowSec: 60 * 60, max: 3 }),
  authController.requestPasswordReset,
);

// POST /api/v1/auth/reset-password - Reset password
router.post('/reset-password', authLimiter, authController.resetPassword);

// GET /api/v1/auth/verify-email - Email verification
router.get('/verify-email', authLimiter, authController.verifyEmail);

// POST /api/v1/auth/signup - Register new user
router.post('/signup', authLimiter, authController.signup);

// POST /api/v1/auth/login - User login
router.post('/login', authLimiter, authController.login);

module.exports = router;
