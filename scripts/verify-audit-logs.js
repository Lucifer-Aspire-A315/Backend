require('dotenv').config();
const prisma = require('../src/lib/prisma');

async function main() {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    console.log('Audit Logs:');
    logs.forEach(log => {
      console.log(`[${log.action}] Entity: ${log.entityType} ${log.entityId} (LoanId: ${log.loanId})`);
    });

    // Verify we have logs for LOAN_APPLIED, BANKER_ASSIGNED, LOAN_APPROVED
    const actions = logs.map(l => l.action);
    if (!actions.includes('LOAN_APPLIED')) throw new Error('Missing LOAN_APPLIED log');
    if (!actions.includes('BANKER_ASSIGNED')) throw new Error('Missing BANKER_ASSIGNED log');
    if (!actions.includes('LOAN_APPROVED')) throw new Error('Missing LOAN_APPROVED log');

    // Verify entityType is LOAN
    const invalidType = logs.find(l => l.entityType !== 'LOAN');
    if (invalidType) throw new Error(`Invalid entityType: ${invalidType.entityType}`);

    console.log('Verification successful');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
