(async () => {
  try {
    // ensure development mode so the module will log the verification link
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';
    const { sendVerificationEmail, sendPasswordResetEmail } = require('../src/utils/emailSender');

    console.log('Calling sendVerificationEmail (dry-run)');
    await sendVerificationEmail('dev+test@example.com', 'dryrun-token-123');
    console.log('sendVerificationEmail completed (check console for DEV link).');
  } catch (err) {
    console.error('Error during test-email run:', err && err.message ? err.message : err);
    process.exitCode = 1;
  }
})();
