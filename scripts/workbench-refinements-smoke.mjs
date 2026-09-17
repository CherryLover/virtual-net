import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = "/tmp/virtual-net-refinements";
const button = (name) => page.getByRole("button", { name, exact: true });
const graph = () => page.evaluate(() => window.__store.getState().topology);
const selected = () => page.evaluate(() => window.__store.getState().selection);
const search = () => button("查找画布设备").click();
const query = () => page.getByRole("searchbox", { name: "查找画布设备", exact: true });
const results = () => page.locator(".device-search-result");
const noVisibleIps = async () => {
  const text = await page.evaluate(
    () =>
      document.body.innerText +
      [...document.querySelectorAll("[title], [aria-label], input, textarea, option")]
        .map(
          (el) =>
            `${el.getAttribute("title") ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.value ?? ""}`,
        )
        .join(" "),
  );
  assert.equal(
    /(?:\d{1,3}\.){3}\d{1,3}/.test(text),
    false,
    "no raw IP in displayed content/fields/tooltips",
  );
};
try {
  await mkdir(output, { recursive: true });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5180/");
  await button("开始").click();
  await page.locator(".device-node").first().waitFor();
  const original = await graph();
  const pcs = original.devices.filter((d) => d.type === "pc");
  const ids = pcs.map((d) => d.id);
  await page.evaluate((ids) => {
    const s = window.__store.getState();
    s.createGroup(ids, "办公室 203.0.113.77");
    s.updateDevice(ids[0], (d) => ({
      ...d,
      name: "主机 203.0.113.88",
      position: { x: 1800, y: 1500 },
    }));
    s.select({ kind: "group", id: window.__store.getState().topology.groups[0].id });
  }, ids);
  const grouped = await graph();
  await page.locator(".side-panel").getByRole("button", { name: "取消成组", exact: true }).click();
  assert.equal((await graph()).groups.length, 0);
  assert.deepEqual((await graph()).devices, grouped.devices);
  assert.deepEqual((await graph()).links, grouped.links);
  assert.equal((await selected()).kind, "devices");
  await button("撤销").click();
  await page.evaluate(() =>
    window.__store
      .getState()
      .select({ kind: "group", id: window.__store.getState().topology.groups[0].id }),
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Delete");
  assert.equal((await graph()).devices.length, original.devices.length - ids.length);
  assert.equal((await graph()).groups.length, 0);
  await button("撤销此次删除").click();
  assert.deepEqual((await graph()).devices, grouped.devices);
  assert.deepEqual((await graph()).links, grouped.links);
  assert.deepEqual((await graph()).groups, grouped.groups);
  await page.evaluate(() =>
    window.__store
      .getState()
      .select({ kind: "group", id: window.__store.getState().topology.groups[0].id }),
  );
  await page
    .locator(".side-panel")
    .getByRole("button", { name: "删除组内设备", exact: true })
    .click();
  await button("撤销此次删除").click();
  assert.deepEqual((await graph()).devices, grouped.devices);

  await search();
  await query().fill("办公室");
  assert.equal(await results().count(), ids.length, "search by group");
  await query().fill("203.0.113.88");
  assert.equal(await results().count(), 1, "search address embedded in name");
  await query().press("Enter");
  await page.waitForTimeout(500);
  assert.equal((await selected()).id, ids[0]);
  const found = await page.locator(`[data-id="${ids[0]}"]`).boundingBox();
  const canvas = await page.locator(".canvas").boundingBox();
  assert.ok(
    found.x >= canvas.x && found.x + found.width <= canvas.x + canvas.width,
    "off-screen device located",
  );
  await search();
  await query().fill(pcs[0].config.ip);
  assert.ok((await results().count()) >= 1, "search configured IP");
  await query().fill("no-such-device");
  assert.equal(await results().count(), 0);
  await query().press("Enter");
  assert.equal((await selected()).id, ids[0]);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".device-search-dialog").count(), 0);

  await button("隐藏 IP").click();
  assert.equal(await page.locator(".side-panel").count(), 1);
  await noVisibleIps();
  await page.evaluate((ids) => window.__store.getState().select({ kind: "devices", ids }), ids);
  await page.getByRole("button", { name: "左对齐", exact: true }).click();
  const aligned = await graph();
  assert.equal(
    aligned.devices.find((d) => d.id === ids[0]).position.x,
    aligned.devices.find((d) => d.id === ids[1]).position.x,
  );
  await noVisibleIps();
  await page.evaluate(() =>
    window.__store
      .getState()
      .select({ kind: "group", id: window.__store.getState().topology.groups[0].id }),
  );
  assert.ok(
    await page
      .locator(".side-panel")
      .getByRole("button", { name: "取消成组", exact: true })
      .isEnabled(),
  );
  await noVisibleIps();
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${output}/private-group-desktop.png` });
  await search();
  await query().fill("203.0.113.88");
  assert.equal(await results().count(), 0, "hidden raw IP cannot be searched");
  await query().fill("主机");
  assert.equal(await results().count(), 1);
  await noVisibleIps();
  const alias = (await results().first().innerText()).match(/地址 \d+/)[0];
  await query().fill(alias);
  assert.ok((await results().count()) > 0, "alias can be searched");
  await page.screenshot({ path: `${output}/private-search-desktop.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__store.getState().saveState === "saved");
  const beforeReload = await graph();
  await page.reload();
  await button("显示 IP").waitFor();
  await page.locator(".device-node").first().waitFor();
  await noVisibleIps();
  assert.deepEqual(
    (await graph()).devices,
    beforeReload.devices,
    "refresh preserves data and privacy",
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.locator(".toolbar").evaluate((el) => el.scrollWidth <= el.clientWidth),
      `toolbar fits ${width}`,
    );
    await search();
    await query().fill("主机");
    await page.screenshot({ path: `${output}/search-mobile-${width}.png` });
    await results().first().click();
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator(".side-panel").isVisible(),
      false,
      "mobile locator keeps inspector closed",
    );
    const rect = await page.locator(`[data-id="${ids[0]}"]`).boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= width, "located device visible on mobile");
    await page.screenshot({ path: `${output}/located-mobile-${width}.png` });
  }
  await button("显示 IP").click();
  await page.reload();
  await button("隐藏 IP").waitFor();
  assert.deepEqual((await graph()).devices, beforeReload.devices);
  assert.deepEqual(errors, []);
  console.log(
    "PASS group dissolve/delete/one-step undo; name/IP/group search; offscreen locate; private panel alignment/group controls; no raw IP in results; privacy reload; 390/320px search and unobstructed locate.",
  );
} finally {
  await browser.close();
}
