// Email sender supporting Resend API (preferred) with SMTP fallback via Nodemailer
const nodemailer = require('nodemailer');
const { logger } = require('../middleware/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

const isProduction = process.env.NODE_ENV === 'production';

async function sendViaResend(to, subject, html, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  // Use native fetch (Node 18+) to call Resend HTTP API
  const payload = {
    from: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject,
    html,
    text,
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }

  const result = await res.json();
  return result;
}

async function sendViaSmtp(to, subject, html, text) {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject,
    text,
    html,
  };
  return transporter.sendMail(mailOptions);
}

async function sendEmail(to, subject, html, text) {
  try {
    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(to, subject, html, text);
    } else {
      return await sendViaSmtp(to, subject, html, text);
    }
  } catch (error) {
    logger.error('Email sending failed', { error: error.message, to, subject });
    // Don't throw in production to avoid breaking the flow, but log it
    if (isProduction) return { success: false, error: error.message };
    throw error;
  }
}

/**
 * Send KYC Status Update Email
 */
async function sendKYCStatusEmail(to, userName, docType, status, notes) {
  const subject = `KYC Document ${status === 'VERIFIED' ? 'Approved' : 'Rejected'} - RN FinTech`;
  const color = status === 'VERIFIED' ? '#4CAF50' : '#F44336';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${color};">KYC Document Update</h2>
      <p>Hello ${userName},</p>
      <p>Your <strong>${docType}</strong> document has been <strong>${status}</strong>.</p>
      ${notes ? `<p><strong>Banker Notes:</strong> ${notes}</p>` : ''}
      <p>Please log in to the app to view more details.</p>
    </div>
  `;
  
  const text = `Hello ${userName},\n\nYour ${docType} document has been ${status}.\n${notes ? `Notes: ${notes}\n` : ''}\nPlease log in to check details.`;

  return sendEmail(to, subject, html, text);
}

/**
 * Send New Device Login Alert
 */
async function sendNewDeviceLoginEmail(to, userName, deviceInfo, ipAddress, time) {
  const subject = 'Security Alert: New Login Detected';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FF9800;">New Login Detected</h2>
      <p>Hello ${userName},</p>
      <p>We detected a login to your account from a new device.</p>
      <ul>
        <li><strong>Device:</strong> ${deviceInfo}</li>
        <li><strong>IP Address:</strong> ${ipAddress}</li>
        <li><strong>Time:</strong> ${time}</li>
      </ul>
      <p>If this was you, you can ignore this email.</p>
      <p style="color: red;">If you did not authorize this login, please contact support immediately and change your password.</p>
    </div>
  `;

  const text = `Hello ${userName},\n\nNew login detected from ${deviceInfo} (${ipAddress}) at ${time}.\nIf this wasn't you, please contact support immediately.`;

  return sendEmail(to, subject, html, text);
}

function buildVerificationEmail(verificationUrl) {
  const subject = 'Verify your email';
  const text = `Click the following link to verify your email: ${verificationUrl}`;
  const html = `<p>Please verify your email by clicking the link below:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p>`;
  return { subject, html, text };
}

function buildResetEmail(resetUrl) {
  const subject = 'Reset your password';
  const text = `Click the following link to reset your password: ${resetUrl}`;
  const html = `<p>Reset your password by clicking the link below:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;
  return { subject, html, text };
}

async function sendVerificationEmail(to, token) {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/v1/auth/verify-email?token=${token}`;
  const { subject, html, text } = buildVerificationEmail(verificationUrl);
  return sendEmail({ to, subject, html, text });
}

async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  const { subject, html, text } = buildResetEmail(resetUrl);
  return sendEmail({ to, subject, html, text });
}

module.exports = {
  sendEmail,
  sendKYCStatusEmail,
  sendNewDeviceLoginEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
