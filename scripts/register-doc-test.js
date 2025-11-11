(async () => {
  try {
    console.log('Starting register-doc-test...');
    const fetch = require('node-fetch');
    const base = process.env.BASE_URL || 'http://localhost:3000/api/v1';
    const token = process.env.TEST_JWT;
    if (!token) return console.error('Please provide TEST_JWT in env');

    const res = await fetch(`${base}/uploads/loan/${process.env.TEST_LOAN_ID}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        publicId: 'rnfintech/loans/loan-1/inv1',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/inv1.pdf',
        filename: 'inv1.pdf',
        fileType: 'pdf',
        bytes: 12345,
        type: 'invoice',
      }),
    });
    const data = await res.json();
    console.log('Response:', data);
  } catch (err) {
    console.error('Failed:', err && err.message);
  }
})();
