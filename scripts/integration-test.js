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
  return body.data.token;
}

async function applyLoan(token, loanTypeId) {
  const res = await fetch(`${BASE}/loan/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ typeId: loanTypeId, amount: 10000 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Apply failed: ${JSON.stringify(body)}`);
  return body.data.loan.id;
}

async function approveLoan(token, loanId) {
  const res = await fetch(`${BASE}/loan/${loanId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ notes: 'Integration test approval' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Approve failed: ${JSON.stringify(body)}`);
  return body.data.loan;
}

async function main() {
  try {
    console.log('Integration test starting against', BASE);

    // Login as customer
    const customerToken = await login('integration.customer@example.com', 'Password123!');
    console.log('Customer logged in');

    // Get a loanType id from server
    const ltRes = await fetch(`${BASE}/loan-types`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const ltBody = await ltRes.json();
    if (!ltRes.ok) throw new Error('Failed to fetch loan types: ' + JSON.stringify(ltBody));
    const loanTypeId = ltBody.data && ltBody.data[0] && ltBody.data[0].id;
    if (!loanTypeId) throw new Error('No loan type available to create loan');

    // Apply for loan
    const loanId = await applyLoan(customerToken, loanTypeId);
    console.log('Loan applied:', loanId);

    // Login as banker
    const bankerToken = await login('integration.banker@example.com', 'Password123!');
    console.log('Banker logged in');

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
