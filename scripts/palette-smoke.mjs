import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = "/tmp/virtual-net-palettes";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const openPalette = async () => {
  await page.locator(".file-menu summary").click();
  await page.getByRole("button", { name: "配色", exact: true }).click();
};
try {
  await page.goto("http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.waitForSelector(".device-node");
  const presets = await page.evaluate(
    async () => (await import("/src/appearance/colors.ts")).COLOR_PRESETS,
  );
  for (const preset of presets) {
    await openPalette();
    await page.getByRole("button", { name: `${preset.name}配色`, exact: true }).click();
    await page.getByRole("button", { name: "应用配色", exact: true }).click();
    const actual = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return {
        accent: css.getPropertyValue("--accent").trim(),
        fill: css.getPropertyValue("--accent-fill").trim(),
        canvas: getComputedStyle(document.querySelector(".react-flow")).backgroundColor,
        nodes: [...document.querySelectorAll(".device-node")].map(
          (node) => getComputedStyle(node).backgroundColor,
        ),
      };
    });
    assert.equal(actual.accent, preset.accent);
    assert.equal(actual.fill, preset.fill);
    assert.equal(actual.canvas, "rgb(248, 248, 248)");
    assert.ok(actual.nodes.every((color) => color === "rgb(255, 255, 255)"));
  }
  await openPalette();
  await page.getByRole("button", { name: "樱花配色", exact: true }).click();
  await page.screenshot({ path: `${output}/desktop-picker.png` });
  await page.getByRole("button", { name: "应用配色", exact: true }).click();
  await page.waitForFunction(() => window.__store.getState().saveState === "saved");
  await page.reload();
  await page.waitForSelector(".device-node");
  assert.equal(
    await page.evaluate(() => window.__store.getState().topology.appearance.accent),
    "#c2298a",
  );
  await page.locator('[data-device-name="电脑1"]').click();
  await page.screenshot({ path: `${output}/desktop-workspace.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await openPalette();
  await page.getByRole("button", { name: "樱花配色", exact: true }).click();
  assert.ok(
    await page.locator(".appearance-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.screenshot({ path: `${output}/mobile-picker.png` });
  await page.getByRole("button", { name: "应用配色", exact: true }).click();
  await page.getByRole("button", { name: "分享图片", exact: true }).click();
  const save = page.getByRole("button", { name: "保存 PNG", exact: true });
  await save.waitFor();
  await page.waitForFunction(() => !document.querySelector(".export-dialog .btn-primary").disabled);
  await page.screenshot({ path: `${output}/mobile-share.png` });
  const pending = page.waitForEvent("download");
  await save.click();
  await (await pending).saveAs(`${output}/sakura-share.png`);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all six palettes, neutral canvas/nodes, reload, desktop/mobile picker, real share PNG; no page errors.",
  );
} finally {
  await browser.close();
}
