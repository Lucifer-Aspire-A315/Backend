const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log('\n$', cmd);
  try {
    const out = execSync(cmd, { stdio: 'inherit', env: process.env });
    return out;
  } catch (err) {
    console.error('Command failed:', cmd);
    process.exit(1);
  }
}

(async () => {
  try {
    console.log('E2E runner starting...');

    // Ensure env loaded
    const root = path.resolve(__dirname, '..');

    // 1) Mark integration users verified (dev-only helper)
    run(`node -r dotenv/config ${path.join(root, 'scripts', 'verify-users.js')}`);

    // 2) Run the existing integration test (login/apply/approve)
    run(`node -r dotenv/config ${path.join(root, 'scripts', 'integration-test.js')}`);

    console.log('E2E runner completed successfully');
  } catch (err) {
    console.error('E2E runner failed:', err && err.message);
    process.exit(1);
  }
})();
