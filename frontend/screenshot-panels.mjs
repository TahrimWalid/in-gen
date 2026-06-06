import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Drop a node by injecting drag events with proper dataTransfer
async function dropNode(service, label, dropX, dropY) {
  // Find the canvas (ReactFlow wrapper)
  const canvas = page.locator('.react-flow__renderer').first();
  await canvas.waitFor({ state: 'visible', timeout: 5000 });

  // Find the sidebar item to start drag from
  const item = page.locator('[draggable="true"]').filter({ hasText: label }).first();
  const itemBox = await item.boundingBox();

  // Use Playwright's dragAndDrop approach via evaluate + custom events
  await page.evaluate(({ service, label, dropX, dropY }) => {
    const canvas = document.querySelector('.react-flow__renderer');
    if (!canvas) { console.error('no canvas'); return; }

    // Create and dispatch dragover first
    const dragover = new DragEvent('dragover', {
      bubbles: true, cancelable: true,
      clientX: dropX, clientY: dropY,
    });
    Object.defineProperty(dragover, 'dataTransfer', {
      value: { dropEffect: 'none', setData: () => {}, getData: (k) => {
        if (k === 'application/reactflow/service') return service;
        if (k === 'application/reactflow/label') return label;
        return '';
      }, effectAllowed: 'move' }
    });
    canvas.dispatchEvent(dragover);

    // Then drop
    const drop = new DragEvent('drop', {
      bubbles: true, cancelable: true,
      clientX: dropX, clientY: dropY,
    });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: (k) => {
        if (k === 'application/reactflow/service') return service;
        if (k === 'application/reactflow/label') return label;
        return '';
      }}
    });
    canvas.dispatchEvent(drop);
  }, { service, label, dropX, dropY });

  await page.waitForTimeout(800);
}

// Find a node on canvas by service type and click it
async function clickNode(service) {
  // Nodes render as .react-flow__node
  const node = page.locator(`.react-flow__node`).filter({ hasText: new RegExp(service, 'i') }).first();
  await node.waitFor({ state: 'visible', timeout: 5000 });
  await node.click();
  await page.waitForTimeout(800);
}

async function screenshotPanel(filename) {
  // Wait for Node Properties panel
  await page.waitForSelector('text=Node Properties', { timeout: 5000 });
  // Screenshot the right side of the screen where the panel lives
  const panelEl = page.locator('text=Node Properties').first();
  const box = await panelEl.boundingBox();
  if (!box) {
    await page.screenshot({ path: filename });
    return;
  }
  // Expand capture area to cover full panel
  const clip = { x: box.x - 8, y: box.y - 8, width: 340, height: 700 };
  // Cap to viewport
  clip.height = Math.min(clip.height, 900 - clip.y);
  writeFileSync(filename, await page.screenshot({ clip }));
  console.log('Saved', filename);
}

// ── Lambda ────────────────────────────────────────────
await dropNode('lambda', 'Lambda Function', 700, 400);
await clickNode('Lambda');
await screenshotPanel('screenshot-lambda.png');

// Click canvas empty area to deselect
await page.mouse.click(500, 600);
await page.waitForTimeout(400);

// ── Cognito ───────────────────────────────────────────
await dropNode('cognito', 'Cognito Auth', 900, 400);
await clickNode('Cognito');
await screenshotPanel('screenshot-cognito.png');

await page.mouse.click(500, 600);
await page.waitForTimeout(400);

// ── SNS ───────────────────────────────────────────────
await dropNode('sns', 'SNS Topic', 600, 500);
await clickNode('SNS');
await screenshotPanel('screenshot-sns.png');

await browser.close();
console.log('All done.');
