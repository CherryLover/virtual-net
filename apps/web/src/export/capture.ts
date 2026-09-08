import { toSvg } from "html-to-image";
import QRCode from "qrcode";

export const PRODUCT_URL = "https://vnet.flyooo.uk/";
export const MAX_EXPORT_SIDE = 16_384;
export const MAX_EXPORT_PIXELS = 32_000_000;
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Capture {
  svg: string;
  width: number;
  height: number;
}

export function outputSize(width: number, height: number, scale: number, share = false) {
  const w = Math.ceil(Math.max(width, share ? 720 : 1) * scale);
  const h = Math.ceil((height + (share ? 200 : 0)) * scale);
  if (
    !Number.isFinite(w + h) ||
    w < 1 ||
    h < 1 ||
    w > MAX_EXPORT_SIDE ||
    h > MAX_EXPORT_SIDE ||
    w * h > MAX_EXPORT_PIXELS
  ) {
    throw new Error(
      "图片过大：单边最多 16384 像素，总计最多 3200 万像素。请降低清晰度或缩小网络图后重试。",
    );
  }
  return { width: w, height: h };
}

export function unionBounds(rects: Bounds[], padding = 48): Bounds {
  if (rects.length === 0) throw new Error("画布为空，请先添加设备。");
  const x = Math.min(...rects.map((r) => r.x)) - padding;
  const y = Math.min(...rects.map((r) => r.y)) - padding;
  return {
    x,
    y,
    width: Math.ceil(Math.max(...rects.map((r) => r.x + r.width)) + padding - x),
    height: Math.ceil(Math.max(...rects.map((r) => r.y + r.height)) + padding - y),
  };
}

const CONTENT =
  ".device-node, .port-label, .vlan-badge, .device-node-badge, .device-edge, .device-edge-label, .device-group, .topology-group, .group-node";
const EDITORS =
  ".react-flow__handle, .react-flow__nodesselection, .react-flow__selection, .edge-control, .edge-reset, .edge-control-guides, .port-side-menu, .trace-overlay, button, input, select, textarea, script";

/** The copy contains display DOM only, never the underlying network configuration. */
export async function captureCanvas(transparent = false): Promise<Capture> {
  await document.fonts.ready;
  const source = document.querySelector<HTMLElement>(".canvas .react-flow__viewport");
  if (!source) throw new Error("画布尚未就绪，请稍后重试。");
  if (!source.querySelector(".device-node")) throw new Error("画布为空，请先添加设备。");
  const matrix = new DOMMatrix(getComputedStyle(source).transform);
  const zoom = Math.hypot(matrix.a, matrix.b);
  if (!zoom) throw new Error("无法读取画布尺寸，请稍后重试。");
  const origin = source.getBoundingClientRect();
  const rectangles = Array.from(source.querySelectorAll(CONTENT), (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: (rect.x - origin.x) / zoom,
      y: (rect.y - origin.y) / zoom,
      width: rect.width / zoom,
      height: rect.height / zoom,
    };
  });
  let bounds = unionBounds(rectangles);
  outputSize(bounds.width, bounds.height, 1);
  const canvas = source.closest<HTMLElement>(".canvas");
  const host = document.createElement("div");
  host.className = "canvas react-flow export-capture-host";
  host.setAttribute("aria-hidden", "true");
  const computed = getComputedStyle(canvas ?? source);
  for (const name of Array.from(computed)) {
    if (name.startsWith("--")) host.style.setProperty(name, computed.getPropertyValue(name));
  }
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    pointerEvents: "none",
    overflow: "hidden",
  });
  host.style.background = transparent ? "transparent" : "#f8f8f8";
  const copy = source.cloneNode(true) as HTMLElement;
  for (const name of copy.querySelectorAll("button.topology-group-name")) {
    const label = document.createElement("span");
    label.className = name.className;
    label.textContent = name.textContent;
    Object.assign(label.style, {
      top: "auto",
      bottom: "calc(100% + 6px)",
      width: "calc(100% - 24px)",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      overflow: "visible",
      textOverflow: "clip",
      lineHeight: "18px",
    });
    name.replaceWith(label);
  }
  copy.querySelectorAll(EDITORS).forEach((element) => {
    element.remove();
  });
  for (const element of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    for (const token of Array.from(element.classList)) {
      if (
        token === "selected" ||
        token === "is-selected" ||
        token === "device-edge-selected" ||
        token.startsWith("trace-")
      )
        element.classList.remove(token);
    }
    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.name.startsWith("data-") ||
        attribute.name.startsWith("aria-") ||
        ["title", "tabindex", "role"].includes(attribute.name)
      )
        element.removeAttribute(attribute.name);
    }
  }
  Object.assign(copy.style, {
    transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`,
    transformOrigin: "0 0",
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
  host.append(copy);
  document.body.append(host);
  try {
    const hostRect = host.getBoundingClientRect();
    const groupLabels = Array.from(copy.querySelectorAll(".topology-group-name"), (label) => {
      const rect = label.getBoundingClientRect();
      return {
        x: rect.x - hostRect.x + bounds.x,
        y: rect.y - hostRect.y + bounds.y,
        width: rect.width,
        height: rect.height,
      };
    });
    bounds = unionBounds([...rectangles, ...groupLabels]);
    outputSize(bounds.width, bounds.height, 1);
    Object.assign(host.style, { width: `${bounds.width}px`, height: `${bounds.height}px` });
    Object.assign(copy.style, {
      transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    for (const svg of copy.querySelectorAll<SVGSVGElement>(".react-flow__edges > svg")) {
      // A zero-sized SVG paints overflow on screen but not inside an exported image.
      svg.style.width = `${bounds.width}px`;
      svg.style.height = `${bounds.height}px`;
      svg.style.overflow = "visible";
      svg.style.position = "absolute";
      svg.style.inset = "0 auto auto 0";
    }
    // html-to-image deep-clones SVG without resolving CSS on its child paths.
    for (const element of copy.querySelectorAll<SVGElement>("svg *")) {
      const style = getComputedStyle(element);
      for (const property of [
        "stroke",
        "stroke-width",
        "stroke-opacity",
        "stroke-dasharray",
        "stroke-linecap",
        "stroke-linejoin",
        "fill",
        "fill-opacity",
        "color",
        "opacity",
        "visibility",
        "filter",
      ]) {
        element.style.setProperty(property, style.getPropertyValue(property));
      }
    }
    const uri = await toSvg(host, {
      width: bounds.width,
      height: bounds.height,
      skipFonts: true,
      style: {
        position: "relative",
        inset: "0 auto auto 0",
        insetInline: "0 auto",
        insetBlock: "0 auto",
      },
    });
    return {
      svg: decodeURIComponent(uri.substring(uri.indexOf(",") + 1)),
      width: bounds.width,
      height: bounds.height,
    };
  } finally {
    host.remove();
  }
}

export async function rasterize(
  capture: Capture,
  scale: number,
  share: boolean,
): Promise<HTMLCanvasElement> {
  const size = outputSize(capture.width, capture.height, scale, share);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法生成图片，请重试。");
  const image = new Image();
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(capture.svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("画布图片生成失败，请重新生成。"));
    image.src = uri;
  });
  context.scale(scale, scale);
  const width = size.width / scale;
  if (share) {
    context.fillStyle = "#f8f8f8";
    context.fillRect(0, 0, width, capture.height);
  }
  context.drawImage(image, (width - capture.width) / 2, 0, capture.width, capture.height);
  if (share) {
    context.fillStyle = "#f1f3f5";
    context.fillRect(0, capture.height, width, 200);
    context.fillStyle = "#171b20";
    context.font = "bold 32px sans-serif";
    context.fillText("vnet", 28, capture.height + 62);
    context.font = "18px sans-serif";
    context.fillText("把网络画出来，让连接看得见。", 28, capture.height + 100);
    context.font = "14px sans-serif";
    context.textAlign = "center";
    context.fillText(PRODUCT_URL, width - 120, capture.height + 188);
    context.textAlign = "start";
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, PRODUCT_URL, {
      width: 160 * scale,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    context.drawImage(qr, width - 200, capture.height + 12, 160, 160);
  }
  return canvas;
}

export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片保存失败，请降低清晰度后重试。"))),
      "image/png",
    ),
  );
}

export async function pdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const ratio = Math.min(1, 14_000 / Math.max(canvas.width, canvas.height));
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
  });
  pdf.addImage(canvas, "PNG", 0, 0, width, height);
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
