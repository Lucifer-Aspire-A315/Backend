const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { logger } = require('../middleware/logger');
const prisma = require('../lib/prisma');

class TwoFactorService {
  constructor() {
    authenticator.options = { window: 1 }; // Allow 30s window drift
  }

  /**
   * Generate 2FA secret and QR code
   */
  async generateSecret(userId, email) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(email, 'RN_FinTech', secret);
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    return { secret, qrCodeUrl };
  }

  /**
   * Verify token and enable 2FA if valid
   */
  async verifyAndEnable(userId, token, secret) {
    const isValid = authenticator.verify({ token, secret });
    if (!isValid) return false;

    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: true,
        twoFactorSecret: secret,
      },
    });

    logger.info('2FA Enabled', { userId });
    return true;
  }

  /**
   * Verify token for login
   */
  verifyToken(token, secret) {
    return authenticator.verify({ token, secret });
  }

  /**
   * Disable 2FA
   */
  async disable(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });
    logger.info('2FA Disabled', { userId });
  }
}

module.exports = new TwoFactorService();
