import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

// Helper: find a sidebar item by text, drag it to canvas center
async function dropNode(labelText, dropX, dropY) {
  // Find the palette item
  const item = page.locator(`[draggable="true"]`).filter({ hasText: labelText }).first();
  await item.waitFor({ state: 'visible', timeout: 5000 });

  const box = await item.boundingBox();
  if (!box) throw new Error(`No bounding box for ${labelText}`);

  // Simulate drag via mouse events
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

// Click a node on the canvas to open its properties panel
async function clickCanvasNode(x, y) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(600);
}

async function screenshotPanel(filename) {
  const panel = page.locator('text=Node Properties').first();
  await panel.waitFor({ state: 'visible', timeout: 4000 });
  const container = page.locator('[class*="absolute"][class*="bottom"]').filter({ has: page.locator('text=Node Properties') }).first();
  const box = await container.boundingBox();
  if (!box) {
    // Fall back to full page
    await page.screenshot({ path: filename, fullPage: false });
    return;
  }
  writeFileSync(filename, await page.screenshot({
    clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 }
  }));
}

// Wait for canvas to load
await page.waitForTimeout(2000);

// --- Lambda node ---
await dropNode('Lambda', 700, 400);
await clickCanvasNode(700, 400);
await screenshotPanel('screenshot-lambda.png');

// Deselect
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- Cognito node ---
await dropNode('Cognito', 900, 400);
await clickCanvasNode(900, 400);
await screenshotPanel('screenshot-cognito.png');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- SNS node ---
await dropNode('SNS', 500, 400);
await clickCanvasNode(500, 400);
await screenshotPanel('screenshot-sns.png');

await browser.close();
console.log('Screenshots saved.');
