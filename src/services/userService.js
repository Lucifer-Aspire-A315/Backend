const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const { logger } = require('../middleware/logger');
const { generateToken, getTokenExpiry, hashToken } = require('../utils/emailVerification');
const { sendVerificationEmail } = require('../utils/emailSender');

class UserService {
  /**
   * Resend email verification token if user is not verified
   */
  async resendVerificationEmail(email) {
    try {
      const normalizedEmail = email && String(email).trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        // For security, do not reveal if user exists
        return;
      }
      if (user.isEmailVerified) {
        // Already verified, do nothing
        return;
      }
      const { generateToken, getTokenExpiry } = require('../utils/emailVerification');
      const { sendVerificationEmail } = require('../utils/emailSender');
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expires = getTokenExpiry(1); // 1 hour expiry
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: tokenHash,
          emailVerificationTokenExpires: expires,
        },
      });
      await sendVerificationEmail(normalizedEmail, token);
      logger.info('Resent verification email', { email });
    } catch (error) {
      logger.error('Resend verification email failed', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Request password reset: generate token, store, and send email
   */
  async requestPasswordReset(email) {
    const { generateToken, getTokenExpiry } = require('../utils/emailVerification');
    const { sendPasswordResetEmail } = require('../utils/emailSender');
    try {
      const normalizedEmail = email && String(email).trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        // For security, do not reveal if user exists
        return;
      }
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expires = getTokenExpiry(1); // 1 hour expiry
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: tokenHash,
          passwordResetTokenExpires: expires,
        },
      });
      await sendPasswordResetEmail(normalizedEmail, token);
      logger.info('Password reset requested', { email });
    } catch (error) {
      logger.error('Password reset request failed', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token, newPassword) {
    try {
      const tokenHash = hashToken(token);
      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: tokenHash,
          passwordResetTokenExpires: {
            gte: new Date(),
          },
        },
      });
      if (!user) {
        const error = new Error('Invalid or expired password reset token');
        error.status = 400;
        throw error;
      }
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          passwordResetToken: null,
          passwordResetTokenExpires: null,
        },
      });
      logger.info('Password reset successful', { userId: user.id, email: user.email });
    } catch (error) {
      logger.error('Password reset failed', { token, error: error.message });
      throw error;
    }
  }
  /**
   * Verify user email using token
   */
  async verifyEmailToken(token) {
    try {
      const tokenHash = hashToken(token);
      const user = await prisma.user.findFirst({
        where: {
          emailVerificationToken: tokenHash,
          emailVerificationTokenExpires: {
            gte: new Date(),
          },
        },
      });
      if (!user) return null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationTokenExpires: null,
        },
      });
      logger.info('Email verified', { userId: user.id, email: user.email });
      return user;
    } catch (error) {
      logger.error('Email verification failed', { token, error: error.message });
      throw error;
    }
  }
  /**
   * Create a new user and the correct profile for their role
   */
  async createUserWithProfile(userData) {
    const { name, email, phone, password, role } = userData;
    try {
      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Normalize email to lower-case for storage and lookups
      const normalizedEmail = email && String(email).trim().toLowerCase();

      // Generate email verification token (plain for email) and store only the hash in DB
      const plainEmailVerificationToken = generateToken();
      const emailVerificationToken = hashToken(plainEmailVerificationToken);
      const emailVerificationTokenExpires = getTokenExpiry(1); // 1 hour expiry

      // Create user with verification fields
      const user = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          phone,
          passwordHash: hashedPassword,
          role,
          isEmailVerified: false,
          emailVerificationToken,
          emailVerificationTokenExpires,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      let profile = null;
      if (role === 'CUSTOMER') {
        profile = await prisma.customerProfile.create({
          data: {
            userId: user.id,
            address: userData.address || null,
            pincode: userData.pincode || null,
          },
        });
      } else if (role === 'MERCHANT') {
        profile = await prisma.merchantProfile.create({
          data: {
            userId: user.id,
            businessName: userData.businessName,
            gstNumber: userData.gstNumber || null,
            address: userData.address || null,
            pincode: userData.pincode || null,
          },
        });
      } else if (role === 'BANKER') {
        // Check bank exists
        const bank = await prisma.bank.findUnique({ where: { id: userData.bankId } });
        if (!bank) {
          const error = new Error('Bank not found');
          error.status = 400;
          throw error;
        }
        profile = await prisma.bankerProfile.create({
          data: {
            userId: user.id,
            bankId: userData.bankId,
            branch: userData.branch,
            pincode: userData.pincode,
            employeeId: userData.employeeId || null,
          },
        });
      }

      // Send verification email (non-blocking)
      // Send the plain token in the email; the DB contains only the hashed token
      sendVerificationEmail(user.email, plainEmailVerificationToken).catch((err) => {
        logger.error('Failed to send verification email after signup', {
          email: user.email,
          error: err.message,
        });
      });

      logger.info('User and Profile Created', { userId: user.id, role });
      return { user, profile };
    } catch (error) {
      logger.error('User Creation Failed', { email, error: error.message });
      // Handle unique constraint violations
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0] || 'unknown';
        const message =
          field === 'email'
            ? 'Email already exists'
            : field === 'phone'
              ? 'Phone number already exists'
              : 'User already exists';
        const errorWithStatus = new Error(message);
        errorWithStatus.status = 409;
        throw errorWithStatus;
      }
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    try {
      const normalizedEmail = email && String(email).trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          role: true,
          name: true,
          isEmailVerified: true,
          bankerProfile: {
            select: { status: true },
          },
        },
      });

      return user;
    } catch (error) {
      logger.error('Find User By Email Failed', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Validate user password
   */
  async validatePassword(email, password) {
    try {
      const normalizedEmail = email && String(email).trim().toLowerCase();
      const user = await this.findUserByEmail(normalizedEmail);
      if (!user) {
        return null;
      }

      // Account lockout via kv store
      const kv = require('../lib/kvstore');
      const lockKey = `lock:login:${normalizedEmail}`;
      const failKey = `fail:login:${normalizedEmail}`;
      const LOCK_THRESHOLD = parseInt(process.env.LOCK_THRESHOLD || '5', 10);
      const LOCK_TTL = parseInt(process.env.LOCK_TTL_SECONDS || String(15 * 60), 10); // 15 min
      const FAIL_WINDOW = parseInt(process.env.FAIL_WINDOW_SECONDS || String(60 * 60), 10); // 1 hour

      const isLocked = await kv.get(lockKey);
      if (isLocked) {
        const err = new Error('Account temporarily locked due to repeated failed login attempts');
        err.status = 423; // locked
        throw err;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (isValid) {
        // On success clear fail counters
        await kv.del(failKey);
        await kv.del(lockKey);
        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }

      // On failure increment counter and possibly set lock
      const fails = await kv.incr(failKey, FAIL_WINDOW);
      if (fails >= LOCK_THRESHOLD) {
        await kv.set(lockKey, '1', LOCK_TTL);
      }

      return null;
    } catch (error) {
      logger.error('Password Validation Failed', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Get user profile by ID (for authenticated users)
   */
  async getUserProfile(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        const error = new Error('User not found');
        error.status = 404;
        throw error;
      }

      logger.info('User Profile Retrieved', { userId: user.id, role: user.role });
      return user;
    } catch (error) {
      logger.error('Get User Profile Failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId, updateData) {
    try {
      // Only allow updating name, phone (not email or role)
      const allowedUpdates = ['name', 'phone'];
      const updates = Object.keys(updateData)
        .filter((key) => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {});

      if (Object.keys(updates).length === 0) {
        return { message: 'No valid fields to update' };
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updates,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          updatedAt: true,
        },
      });

      logger.info('User Profile Updated', {
        userId: user.id,
        updatedFields: Object.keys(updates),
      });

      return user;
    } catch (error) {
      logger.error('Update User Profile Failed', { userId, error: error.message });
      throw error;
    }
  }
}

module.exports = new UserService();
