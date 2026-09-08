import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = "/tmp/virtual-net-ui-consistency";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const menu = async (name) => {
  await page.locator(".file-menu summary").click();
  await page.getByRole("button", { name, exact: true }).click();
};
const readyExport = async () =>
  page.waitForFunction(() => !document.querySelector(".export-dialog .btn-primary").disabled);
const style = async (locator) =>
  locator.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      height: el.getBoundingClientRect().height,
      radius: css.borderRadius,
      fontSize: css.fontSize,
      background: css.backgroundColor,
      padding: css.padding,
    };
  });
const checkDialog = async (name) => {
  const dialog = page.locator(".ui-dialog");
  assert.equal((await style(dialog)).radius, "6px");
  assert.equal((await style(dialog.locator("h2"))).fontSize, "16px");
  assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
  const close = dialog.locator(".ui-dialog-heading .icon-button");
  assert.equal((await style(close)).height, 32);
  assert.ok(await close.getAttribute("title"));
  await page.screenshot({ path: `${output}/${name}.png` });
};
try {
  await page.goto("http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.locator('[data-device-name="电脑1"]').click();
  await page.locator('[data-device-name="电脑2"]').click({ modifiers: ["Shift"] });
  const groupSelect = page.getByRole("combobox", { name: "加入分组" });
  assert.equal(await groupSelect.isEnabled(), false);
  assert.equal((await style(groupSelect)).height, 32);
  await page
    .getByRole("toolbar", { name: "分组操作" })
    .getByRole("button", { name: "成组", exact: true })
    .click();
  const groupName = page.getByRole("textbox", { name: "组名", exact: true });
  await groupName.fill("办公室网络分组");
  await groupName.press("Tab");
  assert.equal(await groupName.getAttribute("class"), "field-input");
  assert.equal((await style(groupName)).radius, "6px");
  assert.equal(await page.locator(".group-members .ui-checkbox:checked").count(), 2);
  await page.screenshot({ path: `${output}/desktop-group.png` });
  await page.locator('[data-device-name="电脑1"]').click();
  assert.equal(await page.getByRole("combobox", { name: "加入分组" }).isEnabled(), true);
  await page.locator('[data-device-name="电脑2"]').click({ modifiers: ["Shift"] });
  await page.locator('[data-device-name="电脑1"]').click({ button: "right" });
  const contextItem = page.getByRole("menuitem", { name: "拆分成组", exact: true });
  assert.equal((await style(contextItem)).height, 36);
  assert.equal((await style(contextItem)).fontSize, "13px");
  await page.screenshot({ path: `${output}/desktop-context.png` });
  await page.keyboard.press("Escape");
  const graph = await page.evaluate(() => JSON.stringify(window.__store.getState().topology));
  for (const mobile of [false, true]) {
    const prefix = mobile ? "mobile" : "desktop";
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await menu("配色");
    await page.getByRole("button", { name: "晴空配色", exact: true }).click();
    await checkDialog(`${prefix}-appearance`);
    await page.getByRole("button", { name: "应用配色", exact: true }).click();
    await menu("选择设备");
    await page.getByRole("checkbox", { name: /电脑1/ }).check();
    await checkDialog(`${prefix}-selection`);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await menu("导出图片或 PDF");
    await readyExport();
    const scale = page.getByRole("combobox", { name: "清晰度", exact: true });
    assert.equal((await style(scale)).height, 32);
    assert.equal((await style(scale)).radius, "6px");
    await scale.selectOption("1");
    await readyExport();
    await checkDialog(`${prefix}-export`);
    await page.getByRole("checkbox", { name: "透明背景", exact: true }).check();
    await readyExport();
    await page.getByRole("combobox", { name: "格式", exact: true }).selectOption("svg");
    await readyExport();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "保存文件", exact: true }).click();
    await (await download).saveAs(`${output}/${prefix}-network.svg`);
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "分享图片", exact: true }).click();
    await readyExport();
    const before = await page.locator(".export-preview").boundingBox();
    await page.getByRole("combobox", { name: "清晰度", exact: true }).selectOption("1");
    await readyExport();
    assert.deepEqual(await page.locator(".export-preview").boundingBox(), before);
    await checkDialog(`${prefix}-share`);
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await menu("导入文件");
    await page.locator('.import-dialog input[type="file"]').setInputFiles({
      name: "办公室网络分组.json",
      mimeType: "application/json",
      buffer: Buffer.from(graph),
    });
    await page.locator(".import-summary").waitFor();
    await checkDialog(`${prefix}-import`);
    await page.getByRole("button", { name: "取消", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shared fields/selects/icons, group rows, context menu, all five dialogs on desktop/mobile, real export, scale geometry, import checks.",
  );
} finally {
  await browser.close();
}
