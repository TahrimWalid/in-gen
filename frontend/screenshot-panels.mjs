import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

async function dropNode(service, label, dropX, dropY) {
  await page.evaluate(({ service, label, dropX, dropY }) => {
    const canvas = document.querySelector('.react-flow__renderer');
    if (!canvas) return;
    const dt = { getData: (k) => k === 'application/reactflow/service' ? service : k === 'application/reactflow/label' ? label : '' };
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: dropX, clientY: dropY });
    Object.defineProperty(over, 'dataTransfer', { value: { ...dt, dropEffect: 'none', setData: () => {} } });
    canvas.dispatchEvent(over);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, clientX: dropX, clientY: dropY });
    Object.defineProperty(drop, 'dataTransfer', { value: dt });
    canvas.dispatchEvent(drop);
  }, { service, label, dropX, dropY });
  await page.waitForTimeout(700);
}

async function clickNode(labelText) {
  const node = page.locator('.react-flow__node').filter({ hasText: labelText }).first();
  await node.waitFor({ state: 'visible', timeout: 5000 });
  await node.click();
  await page.waitForTimeout(600);
}

async function clickTab(tabLabel) {
  const tab = page.locator('button').filter({ hasText: new RegExp(`^${tabLabel}$`) }).first();
  await tab.click();
  await page.waitForTimeout(400);
}

function snap(filename) {
  return page.screenshot().then(buf => { writeFileSync(filename, buf); console.log('Saved', filename); });
}

// ── Test 1: Lambda nodejs16.x (EOL) → error badge ────────────
await dropNode('lambda', 'Lambda Function', 600, 350);
await clickNode('Lambda');
// Basic tab is active — Runtime select is first select on page
const runtimeSelect = page.locator('select').first();
await runtimeSelect.selectOption('nodejs16.x');
await page.waitForTimeout(600);
await snap('p3-lambda-eol-runtime.png');

// ── Test 2: S3 encryptionType = None → error ──────────────────
await page.mouse.click(300, 650);
await page.waitForTimeout(300);
await dropNode('s3', 'S3 Bucket', 850, 350);
await clickNode('S3');
await clickTab('Security');
await page.waitForTimeout(300);
// Encryption Type is the only select in S3 Security tab
const encSelect = page.locator('select').first();
await encSelect.selectOption('None');
await page.waitForTimeout(600);
await snap('p3-s3-no-encryption.png');

// ── Test 3: SNS accessPolicy = Open → error ───────────────────
await page.mouse.click(300, 650);
await page.waitForTimeout(300);
await dropNode('sns', 'SNS Topic', 600, 500);
await clickNode('SNS');
await clickTab('Security');
await page.waitForTimeout(300);
const policySelect = page.locator('select').first();
await policySelect.selectOption('Open');
await page.waitForTimeout(600);
await snap('p3-sns-open-policy.png');

// ── Test 4: Cognito mfaMode = OFF (default) → warning already fires
await page.mouse.click(300, 650);
await page.waitForTimeout(300);
await dropNode('cognito', 'Cognito Auth', 400, 500);
await clickNode('Cognito');
// MFA is OFF by default — cognito-no-mfa fires immediately
await page.waitForTimeout(600);
await snap('p3-cognito-mfa-off.png');

// ── Test 5: DynamoDB PROVISIONED → warning ────────────────────
await page.mouse.click(300, 650);
await page.waitForTimeout(300);
await dropNode('dynamodb', 'DynamoDB', 750, 500);
await clickNode('DynamoDB');
const billingSelect = page.locator('select').first();
await billingSelect.selectOption('PROVISIONED');
await page.waitForTimeout(600);
await snap('p3-dynamodb-provisioned.png');

// ── Final: deselect and show full issues panel ────────────────
await page.mouse.click(300, 650);
await page.waitForTimeout(500);
await snap('p3-issues-panel.png');

await browser.close();
console.log('Done.');
