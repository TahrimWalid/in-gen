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
  const tab = page.locator('button').filter({ hasText: tabLabel }).first();
  await tab.click();
  await page.waitForTimeout(300);
}

async function snap(filename) {
  await page.waitForSelector('text=Node Properties', { timeout: 5000 });
  const header = page.locator('text=Node Properties').first();
  const box = await header.boundingBox();
  const clip = { x: box.x - 8, y: box.y - 8, width: 336, height: 620 };
  clip.height = Math.min(clip.height, 900 - clip.y);
  writeFileSync(filename, await page.screenshot({ clip }));
  console.log('Saved', filename);
}

// ── Lambda: Basic tab ─────────────────────────────────────────
await dropNode('lambda', 'Lambda Function', 700, 400);
await clickNode('Lambda');
await snap('p2-lambda-basic.png');

// ── Lambda: Performance tab ───────────────────────────────────
await clickTab('Perf');
await snap('p2-lambda-perf.png');

// ── Lambda: Security tab ──────────────────────────────────────
await clickTab('Security');
await snap('p2-lambda-security.png');

// ── Lambda: Advanced tab (env vars) ──────────────────────────
await clickTab('Advanced');
await snap('p2-lambda-advanced.png');

// Deselect
await page.mouse.click(300, 650);
await page.waitForTimeout(400);

// ── DynamoDB: Provisioned → Performance shows capacity fields ─
await dropNode('dynamodb', 'DynamoDB', 400, 300);
await clickNode('DynamoDB');
// Switch billing to PROVISIONED to test conditional fields
await page.selectOption('select', 'PROVISIONED');
await page.waitForTimeout(300);
await clickTab('Perf');
await snap('p2-dynamodb-perf-provisioned.png');

await page.mouse.click(300, 650);
await page.waitForTimeout(400);

// ── Cognito: Security tab (password policy) ───────────────────
await dropNode('cognito', 'Cognito Auth', 600, 500);
await clickNode('Cognito');
await clickTab('Security');
await snap('p2-cognito-security.png');

await page.mouse.click(300, 650);
await page.waitForTimeout(400);

// ── SNS: Basic + verify no Advanced tab shown ─────────────────
await dropNode('sns', 'SNS Topic', 850, 300);
await clickNode('SNS');
await snap('p2-sns-basic.png');

// ── EventBridge: Perf — enable archive to show retention field ─
await page.mouse.click(300, 650);
await page.waitForTimeout(400);
await dropNode('eventbridge', 'EventBridge', 550, 550);
await clickNode('EventBridge');
await clickTab('Perf');
// Enable archive
const archiveToggle = page.locator('button[class*="rounded-full"]').first();
await archiveToggle.click();
await page.waitForTimeout(400);
await snap('p2-eventbridge-perf-archive.png');

// ── SQS: Security — enable DLQ to show maxReceiveCount ────────
await page.mouse.click(300, 650);
await page.waitForTimeout(400);
await dropNode('sqs', 'SQS Queue', 350, 500);
await clickNode('SQS');
await clickTab('Security');
await snap('p2-sqs-security-nodlq.png');
// Toggle DLQ on
const dlqToggle = page.locator('button[class*="rounded-full"]').nth(1);
await dlqToggle.click();
await page.waitForTimeout(400);
await snap('p2-sqs-security-dlq.png');

await browser.close();
console.log('All screenshots done.');
