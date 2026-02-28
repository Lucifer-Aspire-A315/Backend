// utils/emailSender.js
// Resend (primary) + SMTP fallback

const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const { logger } = require('../middleware/logger');

const isProduction = process.env.NODE_ENV === 'production';

/* ───────────────────────── Resend Client ───────────────────────── */

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/* ───────────────────────── SMTP Fallback ───────────────────────── */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

/* ───────────────────────── Core Sender ───────────────────────── */

async function sendEmail(to, subject, html, text) {
  try {
    // Prefer Resend
    if (resend) {
      await resend.emails.send({
        from:
          process.env.EMAIL_FROM ||
          'RN FinTech <onboarding@rnfintech.com>',
        to, // MUST be string
        subject,
        html,
        text,
      });

      logger.info('Email sent via Resend', { to, subject });
      return { success: true };
    }

    // SMTP fallback
    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM ||
        process.env.SMTP_FROM ||
        'RN FinTech <onboarding@rnfintech.com>',
      to,
      subject,
      html,
      text,
    });

    logger.info('Email sent via SMTP', { to, subject });
    return { success: true };
  } catch (error) {
    logger.error('Email sending failed', {
      to,
      subject,
      error: error.message,
    });

    if (isProduction) {
      return { success: false };
    }
    throw error;
  }
}

/* ───────────────────────── Auth Emails ───────────────────────── */

async function sendVerificationEmail(email, token) {
  if (!process.env.API_URL) {
    throw new Error('API_URL is not defined in environment variables');
  }

  const verifyUrl = `${process.env.API_URL}/api/v1/auth/verify-email?token=${token}`;

  return sendEmail(
    email,
    'Verify your email',
    `
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    `,
    `Click the following link to verify your email: ${verifyUrl}`
  );
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${
    process.env.FRONTEND_URL || 'http://localhost:3000'
  }/reset-password?token=${token}`;

  return sendEmail(
    email,
    'Reset your password',
    `
      <p>Reset your password by clicking the link below:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
    `,
    `Click the following link to reset your password: ${resetUrl}`
  );
}

/* ───────────────────────── Security Emails ───────────────────────── */

async function sendNewDeviceLoginEmail(
  email,
  userName,
  deviceInfo,
  ipAddress,
  time
) {
  return sendEmail(
    email,
    'Security Alert: New Login Detected',
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color:#FF9800;">New Login Detected</h2>
        <p>Hello ${userName},</p>
        <ul>
          <li><strong>Device:</strong> ${deviceInfo}</li>
          <li><strong>IP:</strong> ${ipAddress}</li>
          <li><strong>Time:</strong> ${time}</li>
        </ul>
        <p>If this was not you, please change your password immediately.</p>
      </div>
    `,
    `New login detected from ${deviceInfo} (${ipAddress}) at ${time}`
  );
}

/* ───────────────────────── KYC Emails ───────────────────────── */

async function sendKYCStatusEmail(to, userName, docType, status, notes) {
  const color = status === 'VERIFIED' ? '#4CAF50' : '#F44336';

  return sendEmail(
    to,
    `KYC Document ${status === 'VERIFIED' ? 'Approved' : 'Rejected'}`,
    `
      <div style="font-family: Arial, sans-serif;">
        <h2 style="color:${color};">KYC Update</h2>
        <p>Hello ${userName},</p>
        <p>Your ${docType} document has been <strong>${status}</strong>.</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      </div>
    `,
    `Your ${docType} document has been ${status}.`
  );
}

/* ───────────────────────── Exports ───────────────────────── */

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewDeviceLoginEmail,
  sendKYCStatusEmail,
};
