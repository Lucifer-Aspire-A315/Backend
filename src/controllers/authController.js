const userService = require('../services/userService');
const jwtUtil = require('../utils/jwt');
const { validationSchemas, validate } = require('../utils/validation');
const { logger } = require('../middleware/logger');

class AuthController {
  /**
   * POST /api/v1/auth/resend-verification
   * Resend email verification link
   */
  async resendVerificationEmail(req, res, next) {
    try {
      const { email } = req.body;
      if (!email) {
        const error = new Error('Email is required');
        error.status = 400;
        return next(error);
      }
      await userService.resendVerificationEmail(email);
      res.json({
        success: true,
        message: 'If the email exists and is not verified, a new verification link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/request-password-reset
   * Request password reset (send email)
   */
  async requestPasswordReset(req, res, next) {
    try {
      const { email } = req.body;
      if (!email) {
        const error = new Error('Email is required');
        error.status = 400;
        return next(error);
      }
      await userService.requestPasswordReset(email);
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/reset-password
   * Reset password using token
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = validate(validationSchemas.resetPassword, req.body);
      await userService.resetPassword(token, newPassword);
      res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
      next(error);
    }
  }
  /**
   * GET /api/v1/auth/verify-email?token=...
   * Verify user email using token
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.query;
      if (!token) {
        const error = new Error('Verification token is required');
        error.status = 400;
        return next(error);
      }
      const user = await userService.verifyEmailToken(token);
      if (!user) {
        const error = new Error('Invalid or expired verification token');
        error.status = 400;
        return next(error);
      }
      res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
      next(error);
    }
  }
  /**
   * POST /api/v1/auth/signup
   * Register new user
   */
  async signup(req, res, next) {
    try {
      // Pick schema based on role
      const role = req.body.role;
      let schema;
      if (role === 'CUSTOMER') schema = require('../utils/validation').signupCustomerSchema;
      else if (role === 'MERCHANT') schema = require('../utils/validation').signupMerchantSchema;
      else if (role === 'BANKER') schema = require('../utils/validation').signupBankerSchema;
      else {
        const error = new Error('Invalid role');
        error.status = 400;
        return next(error);
      }

      // Validate input
      const userData = validate(schema, req.body);
      // Normalize email to lowercase for consistency
      if (userData.email) userData.email = String(userData.email).trim().toLowerCase();

      // Check if user already exists
      const existingUser = await userService.findUserByEmail(userData.email);
      if (existingUser) {
        const error = new Error('User already exists');
        error.status = 409;
        return next(error);
      }

      // Create user and profile
      const { user, profile } = await userService.createUserWithProfile(userData);

      // Response (don't return password). Do NOT issue a full access token on signup — require email verification + login.
      const response = {
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            createdAt: user.createdAt,
          },
          profile,
        },
      };

      logger.info('Signup Successful', {
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/login
   * User login with JWT
   */
  async login(req, res, next) {
    try {
      // Validate input
      const loginData = validate(validationSchemas.login, req.body);

      // Validate credentials
      const user = await userService.validatePassword(loginData.email, loginData.password);

      if (!user) {
        const error = new Error('Invalid email or password');
        error.status = 401;
        return next(error);
      }

      // Block login if email not verified
      const userFull = await userService.findUserByEmail(user.email);
      if (!userFull.isEmailVerified) {
        const error = new Error('Email not verified. Please check your inbox.');
        error.status = 403;
        return next(error);
      }

      // Block login if user is suspended/rejected
      if (userFull.status === 'SUSPENDED' || userFull.status === 'REJECTED') {
        const error = new Error('Account is suspended or rejected');
        error.status = 403;
        return next(error);
      }

      // Block login if banker is not ACTIVE
      if (userFull.role === 'BANKER' && userFull.bankerProfile?.status !== 'ACTIVE') {
        const error = new Error('Your banker account is pending approval or suspended.');
        error.status = 403;
        return next(error);
      }

      // Generate JWT token
      const accessToken = jwtUtil.generateAccessToken(user);
      const refreshToken = jwtUtil.generateRefreshToken(user);

      // Store refresh token
      const refreshExpiresAt = new Date();
      refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7); // 7 days
      await userService.storeRefreshToken(user.id, refreshToken, refreshExpiresAt);

      // Response
      const response = {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          token: accessToken,
          refreshToken,
        },
      };

      logger.info('Login Successful', {
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh-token
   * Refresh access token using refresh token
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        const error = new Error('Refresh token is required');
        error.status = 400;
        throw error;
      }

      // Verify signature
      try {
        jwtUtil.verifyRefreshToken(refreshToken);
      } catch (err) {
        const error = new Error('Invalid refresh token');
        error.status = 401;
        throw error;
      }

      // Verify in DB (check revocation)
      const storedToken = await userService.validateRefreshToken(refreshToken);
      if (!storedToken) {
        const error = new Error('Invalid or revoked refresh token');
        error.status = 401;
        throw error;
      }

      // Generate new tokens (Rotation)
      const user = storedToken.user;
      const newAccessToken = jwtUtil.generateAccessToken(user);
      const newRefreshToken = jwtUtil.generateRefreshToken(user);

      // Revoke old token
      await userService.revokeRefreshToken(refreshToken);

      // Store new token
      const refreshExpiresAt = new Date();
      refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);
      await userService.storeRefreshToken(user.id, newRefreshToken, refreshExpiresAt);

      res.json({
        success: true,
        data: {
          token: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Logout user (revoke refresh token)
   */
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await userService.revokeRefreshToken(refreshToken);
      }
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
