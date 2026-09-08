import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const state = () =>
  page.evaluate(() => {
    const s = window.__store.getState();
    return { selection: s.selection, graph: s.topology, history: s.past.length };
  });
const node = (name) => page.locator(`[data-device-name="${name}"]`);
const menu = () => page.getByRole("menu", { name: "画布右键菜单" });
try {
  await mkdir("/tmp/virtual-net-selection", { recursive: true });
  await page.goto("http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await node("电脑1").waitFor();
  const original = (await state()).graph;
  // macOS reserves Control-click for its native context menu.
  for (const modifier of ["Shift", "Meta"]) {
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 90 } });
    await node("电脑1").click();
    await node("电脑2").click({ modifiers: [modifier] });
    await page.waitForTimeout(150);
    assert.equal((await state()).selection.kind, "devices", modifier);
    assert.equal((await state()).selection.ids.length, 2, modifier);
    await node("电脑2").click({ modifiers: [modifier] });
    assert.equal((await state()).selection.kind, "device", `${modifier} toggle off`);
  }
  await node("电脑2").click({ modifiers: ["Shift"] });
  await node("电脑1").click({ button: "right" });
  assert.equal((await state()).selection.ids.length, 2, "right click preserves selection");
  await page.screenshot({ path: "/tmp/virtual-net-selection/context-menu.png" });
  const history = (await state()).history;
  await menu().getByRole("menuitem", { name: "成组", exact: true }).click();
  assert.equal((await state()).graph.groups[0].deviceIds.length, 2);
  assert.equal((await state()).history, history + 1);
  await page
    .getByRole("button", { name: "选择分组 新分组", exact: true })
    .click({ button: "right" });
  await menu().getByRole("menuitem", { name: "拆分成组", exact: true }).click();
  assert.equal((await state()).graph.groups.length, 0);
  assert.deepEqual((await state()).graph.devices, original.devices);
  assert.deepEqual((await state()).graph.links, original.links);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal((await state()).graph.groups.length, 1);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 90 } });
  const a = await node("电脑1").boundingBox();
  const b = await node("电脑2").boundingBox();
  const start = { x: Math.min(a.x, b.x) - 20, y: Math.min(a.y, b.y) - 15 };
  const end = {
    x: Math.max(a.x + a.width, b.x + b.width) + 20,
    y: Math.max(a.y + a.height, b.y + b.height) + 15,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.screenshot({ path: "/tmp/virtual-net-selection/box-selection.png" });
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal((await state()).selection.ids.length, 2, "plain drag box");
  await page
    .getByRole("toolbar", { name: "分组操作" })
    .getByRole("button", { name: "成组", exact: true })
    .click();
  assert.equal((await state()).graph.groups[0].deviceIds.length, 2);
  await page.getByRole("button", { name: "平移画布", exact: true }).click();
  const viewport = (await state()).graph.viewport;
  const pane = await page.locator(".react-flow__pane").boundingBox();
  await page.mouse.move(pane.x + 80, pane.y + 160);
  await page.mouse.down();
  await page.mouse.move(pane.x + 140, pane.y + 220, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.notDeepEqual((await state()).graph.viewport, viewport, "pan mode");
  await page
    .locator(".react-flow__pane")
    .click({ button: "right", position: { x: pane.width - 8, y: pane.height - 40 } });
  const bounds = await menu().boundingBox();
  assert.ok(bounds.x + bounds.width <= 1440 && bounds.y + bounds.height <= 900);
  await page.keyboard.press("Escape");
  assert.equal(await menu().count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/virtual-net-selection/mobile-toolbar.png" });
  assert.ok(await page.locator(".canvas-tools").evaluate((el) => el.scrollWidth <= el.clientWidth));
  assert.deepEqual(errors, []);
  console.log(
    "PASS Shift/Command toggle, right-click group/ungroup, undo/redo, plain box selection, toolbar grouping, pan mode, menu boundary/Escape, mobile toolbar.",
  );
} finally {
  await browser.close();
}
