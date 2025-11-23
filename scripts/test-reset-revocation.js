require('dotenv').config();
const prisma = require('../src/lib/prisma');
const userService = require('../src/services/userService');
const { v4: uuidv4 } = require('uuid');

async function run() {
  console.log('--- Testing Token Revocation on Password Reset ---');
  
  // 1. Create a dummy user
  const email = `reset-test-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'hash',
      name: 'Reset Test',
      role: 'CUSTOMER',
      phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
      isEmailVerified: true,
    },
  });

  // 2. Create a refresh token
  const token = uuidv4();
  await userService.storeRefreshToken(user.id, token, new Date(Date.now() + 100000));
  console.log('Created refresh token.');

  // 3. Verify token is valid
  let stored = await userService.validateRefreshToken(token);
  if (!stored) throw new Error('Token should be valid');
  console.log('Token is initially valid.');

  // 4. Simulate Password Reset
  // We need to manually set the reset token first to bypass the email sending part of requestPasswordReset
  const resetToken = 'reset-token-123';
  const { hashToken, getTokenExpiry } = require('../src/utils/emailVerification');
  const resetTokenHash = hashToken(resetToken);
  
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetTokenHash,
      passwordResetTokenExpires: getTokenExpiry(1),
    },
  });

  console.log('Resetting password...');
  await userService.resetPassword(resetToken, 'NewPassword1!');

  // 5. Verify token is revoked
  stored = await userService.validateRefreshToken(token);
  if (stored) {
    console.error('[FAIL] Refresh token was NOT revoked!');
  } else {
    console.log('[PASS] Refresh token was revoked.');
  }

  // Cleanup
  await prisma.user.delete({ where: { id: user.id } });
}

run();
