import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const out = "/tmp/virtual-net-shortcuts-privacy";
const state = () =>
  page.evaluate(() => {
    const s = window.__store.getState();
    return { selection: s.selection, graph: s.topology, history: s.past.length };
  });
const node = (name) => page.locator(`[data-device-name="${name}"]`);
const blur = () => page.evaluate(() => document.activeElement?.blur());
const drag = async (x, y, dx, dy) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
};
try {
  await mkdir(out, { recursive: true });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await node("电脑1").waitFor();
  await page.evaluate(async () => {
    window.__store = (await import("/src/store/index.ts")).useTopologyStore;
  });
  const original = (await state()).graph;

  for (const key of ["Meta", "Control"]) {
    await node("电脑1").click();
    await node("电脑2").click({ modifiers: ["Shift"] });
    await page.keyboard.press(`${key}+g`);
    assert.equal((await state()).graph.groups.length, 1, `${key} group`);
    assert.equal((await state()).graph.groups[0].deviceIds.length, 2);
    await page.keyboard.press(`${key}+Shift+g`);
    assert.equal((await state()).graph.groups.length, 0, `${key} ungroup`);
    assert.deepEqual((await state()).graph.devices, original.devices);
    assert.deepEqual((await state()).graph.links, original.links);
    await page.keyboard.press(`${key}+z`);
    assert.equal((await state()).graph.groups.length, 1, "undo ungroup");
    await page.keyboard.press(`${key}+Shift+z`);
    assert.equal((await state()).graph.groups.length, 0, "redo ungroup");
  }

  const nameInput = page.getByRole("textbox", { name: "网络名称", exact: true });
  await nameInput.focus();
  const history = (await state()).history;
  await page.keyboard.press("Meta+g");
  await page.keyboard.down("Space");
  assert.equal(await page.locator(".canvas-space-pan").count(), 0, "typing does not pan");
  await page.keyboard.up("Space");
  assert.equal((await state()).history, history, "typing does not group");
  await nameInput.fill(original.name);
  await blur();

  let before = await state();
  const pane = await page.locator(".react-flow__pane").boundingBox();
  await page.keyboard.down("Space");
  await page.locator(".canvas-space-pan").waitFor();
  await drag(pane.x + 50, pane.y + 100, 60, 60);
  await page.keyboard.up("Space");
  assert.notDeepEqual((await state()).graph.viewport, before.graph.viewport, "space pans");
  assert.deepEqual((await state()).selection, before.selection, "pan preserves selection");
  assert.deepEqual(
    (await state()).graph.devices,
    before.graph.devices,
    "pan does not move devices",
  );
  assert.equal(await page.locator(".canvas-space-pan").count(), 0);

  before = await state();
  const box = await node("电脑1").boundingBox();
  await page.keyboard.down("Space");
  await page.locator(".canvas-space-pan").waitFor();
  await drag(box.x + box.width / 2, box.y + box.height / 2, 35, 25);
  await page.keyboard.up("Space");
  assert.notDeepEqual((await state()).graph.viewport, before.graph.viewport, "pan over a device");
  assert.deepEqual((await state()).graph.devices, before.graph.devices);
  assert.deepEqual((await state()).selection, before.selection);

  // Selection mode is restored without pressing its toolbar button.
  const a = await node("电脑1").boundingBox();
  const b = await node("电脑2").boundingBox();
  await drag(
    Math.min(a.x, b.x) - 15,
    Math.min(a.y, b.y) - 15,
    Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x) + 30,
    Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) + 30,
  );
  assert.equal((await state()).selection.ids.length, 2, "box selection restored");

  await page.keyboard.down("Space");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.locator(".canvas-space-pan").count(), 0, "lost focus resets pan");
  await page.keyboard.up("Space");

  await page.evaluate(async () => {
    const { useTraceStore } = await import("/src/store/index.ts");
    const s = window.__store.getState();
    const pc = s.topology.devices.find((d) => d.type === "pc");
    s.runProbe({ kind: "ping", sourceDeviceId: pc.id, targetIp: "8.8.8.8" });
    useTraceStore.getState().pause();
    window.__trace = useTraceStore;
  });
  await page.getByRole("slider", { name: "进度", exact: true }).waitFor();
  await blur();
  await page.keyboard.down("Space");
  assert.equal(
    await page.evaluate(() => window.__trace.getState().playing),
    false,
    "space on canvas does not play",
  );
  await page.keyboard.up("Space");
  await page.getByRole("slider", { name: "进度", exact: true }).focus();
  await page.keyboard.press("Space");
  assert.equal(
    await page.evaluate(() => window.__trace.getState().playing),
    true,
    "space on playback slider plays",
  );
  assert.equal(await page.locator(".canvas-space-pan").count(), 0);
  await page.keyboard.press("Space");
  assert.equal(
    await page.evaluate(() => window.__trace.getState().playing),
    false,
    "space on playback slider pauses",
  );
  await page.evaluate(() => window.__trace.getState().clear());
  await blur();

  // Deliberately place addresses in names, zones and ports as well as configuration.
  await page.evaluate(() => {
    const s = window.__store.getState();
    const graph = structuredClone(s.topology);
    graph.name = "网络 203.0.113.77";
    graph.devices[0].name = "设备 203.0.113.77";
    graph.devices[0].zone = "区域 203.0.113.77";
    graph.devices[0].ports[0].name = "口 203.0.113.77";
    s.replaceTopology(graph);
    s.createGroup(
      graph.devices.slice(0, 2).map((d) => d.id),
      "分组 203.0.113.77",
    );
  });
  await page.waitForTimeout(200);
  const realGraph = (await state()).graph;
  await page.getByRole("button", { name: "隐藏 IP", exact: true }).click();
  await page.getByRole("button", { name: "显示 IP", exact: true }).waitFor();
  assert.equal(await page.locator(".side-panel").count(), 0, "configuration is not rendered");
  assert.equal(
    await page.getByRole("button", { name: "选择起点验证", exact: true }).isDisabled(),
    true,
  );
  const visible = await page.evaluate(
    () =>
      document.body.innerText +
      [
        ...document.querySelectorAll(
          "[title], input, [aria-label], [data-device-name], [data-port-name]",
        ),
      ]
        .map((el) =>
          [
            el.getAttribute("title"),
            el.getAttribute("aria-label"),
            el.getAttribute("data-device-name"),
            el.getAttribute("data-port-name"),
            el.value,
          ].join(" "),
        )
        .join(" "),
  );
  assert.equal(
    /(?:\d{1,3}\.){3}\d{1,3}/.test(visible),
    false,
    "no real IP in visible text, values or tooltips",
  );
  assert.match(visible, /地址 \d+/);
  assert.deepEqual((await state()).graph, realGraph, "privacy preserves original data");
  await page.screenshot({ path: `${out}/privacy-desktop.png` });

  const capture = await page.evaluate(async () =>
    (await import("/src/export/capture.ts")).captureCanvas(),
  );
  assert.equal(capture.svg.includes("203.0.113.77"), false, "SVG names are redacted");
  const addresses = JSON.stringify(realGraph).match(/(?:\d{1,3}\.){3}\d{1,3}/g) ?? [];
  for (const ip of addresses)
    assert.equal(capture.svg.includes(ip), false, `export must not contain ${ip}`);
  assert.match(capture.svg, /地址/);

  await page.getByRole("button", { name: "分享图片", exact: true }).click();
  const save = page.getByRole("button", { name: "保存 PNG", exact: true });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.includes("保存 PNG") && !b.disabled,
    ),
  );
  const pixels = await page.locator(".export-preview img").evaluate(async (img) => {
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150 && data[i + 3]) dark++;
    return dark;
  });
  assert.ok(pixels > 1000, "share preview contains rendered content");
  const downloaded = page.waitForEvent("download");
  await save.click();
  const download = await downloaded;
  await download.saveAs(`${out}/private-share.png`);
  const png = await readFile(`${out}/private-share.png`);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await page.locator(".file-menu summary").click();
  const confirm = page.waitForEvent("dialog").then(async (warning) => {
    assert.match(warning.message(), /真实 IP/);
    await warning.dismiss();
  });
  await page.getByRole("button", { name: "导出文件", exact: true }).click();
  await confirm;
  assert.deepEqual((await state()).graph, realGraph);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/privacy-mobile-${width}.png` });
    assert.ok(
      await page.locator(".toolbar").evaluate((el) => el.scrollWidth <= el.clientWidth),
      `toolbar fits ${width}px`,
    );
    const toggle = await page.getByRole("button", { name: "显示 IP", exact: true }).boundingBox();
    assert.ok(toggle.x >= 0 && toggle.x + toggle.width <= width);
  }
  await page.getByRole("button", { name: "显示 IP", exact: true }).click();
  assert.ok((await page.locator(".toolbar-name").inputValue()).includes("203.0.113.77"));
  assert.deepEqual((await state()).graph.devices, realGraph.devices);
  assert.deepEqual((await state()).graph.links, realGraph.links);
  assert.deepEqual(errors, []);
  console.log(
    "PASS macOS/Windows grouping, undo/redo, typing guards, space pan over pane/devices, selection preservation/restoration, lost focus, privacy UI/tooltips/SVG/PNG, original data, raw-file warning, 390/320px layouts.",
  );
} finally {
  await browser.close();
}
