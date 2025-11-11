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

async function sendEmail({ to, subject, html, text }) {
  // In development, optionally log the link and skip actual sending to avoid requiring
  // SMTP/Resend credentials during local testing. Set DEV_SEND_EMAIL=true to enable
  // dev-mode logging and skip network sends.
  if (!isProduction && process.env.DEV_SEND_EMAIL === 'true') {
    // Try to extract any http(s) URL from the HTML/text and log it for developer convenience
    // Avoid a faulty character class that truncates at dashes; only exclude whitespace and quotes
    const maybeUrl = (html || text || '').match(/https?:\/\/[^\s"']+/);
    if (maybeUrl) logger.info('[DEV] Email link', { to, url: maybeUrl[0] });
    logger.info('DEV mode - skipping actual email send', { to, subject });
    return Promise.resolve({ dev: true, to, subject });
  }

  // Prefer Resend if API key provided
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(to, subject, html, text);
    } catch (err) {
      logger.error('Resend send failed, falling back to SMTP', { to, error: err.message });
      // fallthrough to SMTP
    }
  }

  // SMTP fallback
  try {
    return await sendViaSmtp(to, subject, html, text);
  } catch (err) {
    logger.error('SMTP send failed', { to, error: err.message });
    throw err;
  }
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

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
