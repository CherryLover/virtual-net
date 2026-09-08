import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.QA_OUTPUT || "/tmp/virtual-net-ux-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const graph = () => page.evaluate(() => window.__store.getState().topology);
const state = () =>
  page.evaluate(() => {
    const s = window.__store.getState();
    return { past: s.past.length, revision: s.topologyRevision, selection: s.selection };
  });
const menu = async (name) => {
  await page.locator(".file-menu summary").click();
  await page.getByRole("button", { name, exact: true }).click();
};
const saved = () => page.waitForFunction(() => window.__store.getState().saveState === "saved");
const assertAccent = async (color = "rgb(0, 116, 158)") => {
  await page.locator('[data-device-name="电脑1"]').click();
  for (const [region, selector] of [
    ["toolbar", '.toolbar button[aria-label="选择起点验证"] svg'],
    ["device library", ".device-bar .device-card .device-icon"],
    ["canvas node", ".device-node .device-icon"],
    ["inspector device", ".device-inspector-head .device-icon"],
    ["inspector active tab", '.inspector-tabs button[aria-selected="true"] svg'],
  ]) {
    const icon = page.locator(selector).first();
    await icon.waitFor({ state: "visible" });
    assert.equal(
      await icon.evaluate((el) => getComputedStyle(el).color),
      color,
      `${region} accent`,
    );
  }
  assert.equal(
    await page.locator(".react-flow").evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(248, 248, 248)",
    "canvas background stays fixed",
  );
  assert.ok(
    await page
      .locator(".device-node")
      .evaluateAll(
        (nodes) =>
          nodes.length > 0 &&
          nodes.every((node) => getComputedStyle(node).backgroundColor === "rgb(255, 255, 255)"),
      ),
    "all node surfaces stay white",
  );
};
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.waitForSelector(".device-node");
  await saved();
  const original = await graph();
  await page.locator(".react-flow__pane").click({ position: { x: 15, y: 90 } });
  await page.keyboard.press("Meta+a");
  await page.getByRole("button", { name: "建立分组", exact: true }).click();
  await page.getByRole("textbox", { name: "组名", exact: true }).fill("办公室网络");
  await page.getByRole("textbox", { name: "组名", exact: true }).press("Tab");
  assert.equal((await graph()).groups[0].name, "办公室网络");
  await page.getByRole("checkbox", { name: "互联网", exact: true }).uncheck();
  assert.equal((await graph()).groups[0].deviceIds.length, 3);
  const beforeDrag = await graph();
  const historyBeforeDrag = (await state()).past;
  const title = page.getByRole("button", { name: "选择分组 办公室网络", exact: true });
  const box = await title.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + 35, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 58, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterDrag = await graph();
  assert.equal((await state()).past, historyBeforeDrag + 1);
  const ids = afterDrag.groups[0].deviceIds;
  const deltas = ids.map((id) => {
    const a = beforeDrag.devices.find((d) => d.id === id).position;
    const b = afterDrag.devices.find((d) => d.id === id).position;
    return [b.x - a.x, b.y - a.y];
  });
  assert.ok(deltas[0].some((v) => v !== 0));
  assert.ok(deltas.every((d) => JSON.stringify(d) === JSON.stringify(deltas[0])));
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.deepEqual(
    (await graph()).devices.map((d) => d.position),
    beforeDrag.devices.map((d) => d.position),
  );
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await title.click();
  await page.getByRole("button", { name: "复制分组", exact: true }).click();
  const copied = await graph();
  assert.equal(copied.devices.length, original.devices.length + 3);
  assert.equal(copied.groups.length, 2);
  assert.equal(
    new Set(copied.devices.flatMap((d) => d.ports.map((p) => p.mac))).size,
    copied.devices.flatMap((d) => d.ports).length,
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal((await graph()).devices.length, original.devices.length);

  await menu("配色");
  await page.getByRole("button", { name: "晴空配色", exact: true }).click();
  assert.equal((await graph()).appearance, undefined);
  await page.getByRole("button", { name: "应用配色", exact: true }).click();
  assert.equal((await graph()).appearance.accent, "#00749e");
  await assertAccent();
  const beforeCancel = await graph();
  await menu("配色");
  await page.getByRole("button", { name: "樱花配色", exact: true }).click();
  await page.getByLabel("自定义强调色", { exact: true }).fill("#743a9f");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(await graph(), beforeCancel);
  await assertAccent();
  await menu("配色");
  await page.getByLabel("自定义强调色", { exact: true }).fill("#743a9f");
  await page.getByRole("button", { name: "应用配色", exact: true }).click();
  assert.equal((await graph()).appearance.accent, "#743a9f");
  await assertAccent("rgb(116, 58, 159)");
  await menu("配色");
  await page.getByRole("button", { name: "晴空配色", exact: true }).click();
  await page.getByRole("button", { name: "应用配色", exact: true }).click();
  await assertAccent();

  const legacy = await graph();
  const pcId = legacy.devices.find((d) => d.name === "电脑1").id;
  legacy.appearance = {
    ...legacy.appearance,
    background: "#000000",
    nodeColor: "#111111",
    linkColor: "#abcdef",
    devices: { [pcId]: "#990000" },
  };
  await menu("导入文件");
  await page.locator('.import-dialog input[type="file"]').setInputFiles({
    name: "legacy-colors.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page.locator(".import-summary").waitFor();
  await page.getByRole("button", { name: /^(确认导入|仍然导入)$/ }).click();
  await page.locator(".import-dialog").waitFor({ state: "hidden" });
  assert.deepEqual((await graph()).appearance, legacy.appearance);
  await assertAccent();
  await menu("配色");
  await page.screenshot({ path: `${output}/desktop-appearance.png` });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await saved();
  await page.reload();
  await page.waitForSelector(".topology-group");
  assert.deepEqual((await graph()).appearance, legacy.appearance);
  await assertAccent();
  assert.equal((await graph()).groups[0].name, "办公室网络");

  const downloadPromise = page.waitForEvent("download");
  await menu("导出文件");
  const download = await downloadPromise;
  await download.saveAs(`${output}/roundtrip.json`);
  const exported = JSON.parse(await readFile(`${output}/roundtrip.json`, "utf8"));
  assert.equal(exported.groups[0].name, "办公室网络");
  await menu("导入文件");
  await page.locator('.import-dialog input[type="file"]').setInputFiles(`${output}/roundtrip.json`);
  await page.locator(".import-summary").waitFor();
  await page.getByRole("button", { name: /^(确认导入|仍然导入)$/ }).click();
  await page.locator(".import-dialog").waitFor({ state: "hidden" });
  await saved();
  assert.deepEqual((await graph()).appearance, exported.appearance);
  assert.deepEqual((await graph()).groups, exported.groups);
  await menu("导入文件");
  await page.locator('.import-dialog input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await page.getByText("内容不是有效 JSON", { exact: false }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "确认导入", exact: true }).isEnabled(),
    false,
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await menu("选择设备");
  const historyBeforeSelection = (await state()).past;
  await page.getByRole("checkbox", { name: /电脑1/ }).check();
  await page.getByRole("checkbox", { name: /电脑2/ }).check();
  await page.keyboard.press("Meta+z");
  assert.equal((await state()).past, historyBeforeSelection);
  await page.screenshot({ path: `${output}/mobile-selection.png` });
  await page.getByRole("button", { name: "确认选择", exact: true }).click();
  await page.getByRole("button", { name: "建立分组", exact: true }).click();
  await page.getByRole("textbox", { name: "组名", exact: true }).fill("手机勾选建组");
  await page.getByRole("textbox", { name: "组名", exact: true }).press("Tab");
  assert.equal((await graph()).groups.at(-1).name, "手机勾选建组");
  await page.getByRole("button", { name: "关闭操作面板", exact: true }).click();
  await menu("配色");
  await page.screenshot({ path: `${output}/mobile-appearance.png` });
  assert.ok(
    await page.locator(".appearance-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.getByRole("button", { name: "应用配色", exact: true }).click();
  await menu("导入文件");
  await page.locator('.import-dialog input[type="file"]').setInputFiles(`${output}/roundtrip.json`);
  await page.locator(".import-summary").waitFor();
  await page.screenshot({ path: `${output}/mobile-import.png` });
  assert.ok(
    await page.locator(".import-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.getByRole("button", { name: /^(确认导入|仍然导入)$/ }).click();
  await page.locator(".import-dialog").waitFor({ state: "hidden" });
  await saved();
  assert.ok(await page.locator("body").evaluate((el) => el.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "展开设备库", exact: true }).click();
  await page.screenshot({ path: `${output}/desktop-final.png` });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: group creation/member editing/drag/copy/undo, accent apply/cancel/custom/reload across toolbar/library/nodes/inspector, fixed surfaces despite legacy fills, actual JSON download/import, bad file protection, desktop/mobile dialogs; no page errors.",
  );
} finally {
  await browser.close();
}
