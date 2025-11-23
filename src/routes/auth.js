const express = require('express');
const authController = require('../controllers/authController');
const { authLimiter, loginLimiter } = require('../middleware/rateLimiter');
const { accountRateLimiter } = require('../middleware/accountRateLimiter');
const router = express.Router();
const auth = require('../middleware/auth');

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
router.post('/login', loginLimiter, authController.login);

// POST /api/v1/auth/refresh-token - Refresh access token
router.post('/refresh-token', authLimiter, authController.refreshToken);

// POST /api/v1/auth/logout - Logout user
router.post('/logout', authLimiter, authController.logout);

// POST /api/v1/auth/change-password - Change password
router.post('/change-password', auth.authenticate, authController.changePassword);

// GET /api/v1/auth/sessions - List active sessions
router.get('/sessions', auth.authenticate, authController.listSessions);

// DELETE /api/v1/auth/sessions/:id - Revoke session
router.delete('/sessions/:id', auth.authenticate, authController.revokeSession);

// POST /api/v1/auth/2fa/setup - Setup 2FA
router.post('/2fa/setup', auth.authenticate, authController.setup2fa);

// POST /api/v1/auth/2fa/verify - Verify and enable 2FA
router.post('/2fa/verify', auth.authenticate, authController.verify2fa);

// POST /api/v1/auth/2fa/disable - Disable 2FA
router.post('/2fa/disable', auth.authenticate, authController.disable2fa);

// POST /api/v1/auth/2fa/login - Complete 2FA login
router.post('/2fa/login', loginLimiter, authController.login2fa);

module.exports = router;
