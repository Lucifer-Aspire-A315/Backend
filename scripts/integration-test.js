require('dotenv').config();
const fetch = require('node-fetch');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/v1`;

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return { token: body.data.token, userId: body.data.user.id };
}

async function applyLoan(token, loanTypeId) {
  const res = await fetch(`${BASE}/loan/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loanTypeId: loanTypeId,
      amount: 10000,
      applicant: { type: 'merchant' },
      metadata: {
        businessGST: '27AAAAA1234A1Z5',
        monthlySales: 500000,
        yearsInBusiness: 5
      }
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Apply failed: ${JSON.stringify(body)}`);
  return body.data.id;
}

async function assignLoan(token, loanId, bankerId) {
  const res = await fetch(`${BASE}/loan/${loanId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bankerId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Assign failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function approveLoan(token, loanId) {
  const res = await fetch(`${BASE}/loan/${loanId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ notes: 'Integration test approval' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Approve failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function main() {
  try {
    console.log('Integration test starting against', BASE);

    // Login as merchant
    const { token: merchantToken } = await login('integration.merchant@example.com', 'Password123!');
    console.log('Merchant logged in');

    // Get a loanType id from server
    const ltRes = await fetch(`${BASE}/loan-types`, {
      headers: { Authorization: `Bearer ${merchantToken}` },
    });
    const ltBody = await ltRes.json();
    console.log('Loan Types Response:', JSON.stringify(ltBody, null, 2));
    if (!ltRes.ok) throw new Error('Failed to fetch loan types: ' + JSON.stringify(ltBody));
    const loanTypeId = ltBody.data && ltBody.data[0] && ltBody.data[0].id;
    if (!loanTypeId) throw new Error('No loan type available to create loan');

    // Apply for loan
    const loanId = await applyLoan(merchantToken, loanTypeId);
    console.log('Loan applied:', loanId);

    // Login as banker
    const { token: bankerToken, userId: bankerId } = await login('integration.banker@example.com', 'Password123!');
    console.log('Banker logged in');

    // Assign loan
    await assignLoan(bankerToken, loanId, bankerId);
    console.log('Loan assigned');

    // Approve loan
    const approved = await approveLoan(bankerToken, loanId);
    console.log('Loan approved:', approved.id, approved.status);

    console.log('Integration test completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed:', err);
    process.exit(1);
  }
}

main();
