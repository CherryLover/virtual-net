// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCanvas, downloadBlob, pngBlob, rasterize } from "./capture";
import { ExportDialog } from "./ExportDialog";

vi.mock("./capture", () => ({
  captureCanvas: vi.fn(),
  rasterize: vi.fn(),
  pngBlob: vi.fn(),
  pdfBlob: vi.fn(),
  downloadBlob: vi.fn(),
}));
let container: HTMLDivElement;
let root: Root;
const close = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(captureCanvas)
    .mockReset()
    .mockResolvedValue({ svg: "<svg/>", width: 100, height: 100 });
  vi.mocked(rasterize)
    .mockReset()
    .mockResolvedValue(
      Object.assign(document.createElement("canvas"), { width: 720, height: 300 }),
    );
  vi.mocked(pngBlob)
    .mockReset()
    .mockResolvedValue(new Blob(["PNG"], { type: "image/png" }));
  vi.mocked(downloadBlob).mockReset();
  close.mockReset();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const mount = async (mode: "share" | "export" = "share") => {
  await act(async () => root.render(createElement(ExportDialog, { mode, onClose: close })));
};
const button = (name: string) => {
  const element = Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name,
  );
  if (!element) throw new Error(`Missing button ${name}`);
  return element;
};
describe("export preview", () => {
  it("sharing uses only the full thumbnail and requires a completed preview before saving", async () => {
    await mount();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:export-preview");
    expect(container.querySelector(".export-preview-tools")).toBeNull();
    await act(async () => button("保存 PNG").click());
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "vnet-share.png");
  });
  it("ordinary export retains original-size inspection", async () => {
    await mount("export");
    await act(async () => button("原始大小").click());
    expect(container.querySelector(".export-preview-actual")).not.toBeNull();
  });
  it("keeps the previous preview and URL during regeneration, but blocks stale downloads", async () => {
    await mount();
    let rejectCapture: ((reason: Error) => void) | undefined;
    vi.mocked(captureCanvas).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCapture = reject;
        }),
    );
    const scale = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      scale.value = "1";
      scale.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:export-preview");
    expect(container.querySelector(".export-preview-busy")).not.toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(button("保存 PNG").disabled).toBe(true);
    await act(async () => rejectCapture?.(new Error("生成失败")));
    expect(container.querySelector("img")).not.toBeNull();
    expect(button("保存 PNG").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("生成失败");
  });
  it("reports generation errors, prevents saving and can retry", async () => {
    vi.mocked(captureCanvas).mockRejectedValueOnce(new Error("画布为空，请先添加设备。"));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("画布为空");
    expect(button("保存 PNG").disabled).toBe(true);
    await act(async () => button("重新生成").click());
    expect(button("保存 PNG").disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("does not publish a stale preview after options change", async () => {
    let finish: ((value: { svg: string; width: number; height: number }) => void) | undefined;
    vi.mocked(captureCanvas).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    expect(button("保存 PNG").disabled).toBe(true);
    const scale = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      scale.value = "1";
      scale.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button("保存 PNG").disabled).toBe(false);
    await act(async () => finish?.({ svg: "stale", width: 9, height: 9 }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
  it("closes without saving and releases the preview URL", async () => {
    await mount();
    await act(async () => button("取消").click());
    expect(close).toHaveBeenCalledOnce();
    expect(downloadBlob).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:export-preview");
  });
});
