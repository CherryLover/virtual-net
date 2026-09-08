import { lint, parseTopology, type Topology } from "../engine";

export const IMPORT_LIMITS = { bytes: 5 * 1024 * 1024, devices: 200, links: 500, ports: 64 };
export const IMPORT_LIMIT_LABEL = "上限：5 MiB、200 台设备、500 条连线、每台 64 个端口";
export type StepStatus = "待检查" | "检查中" | "通过" | "有提醒" | "无法继续" | "未执行";
export interface ImportIssue {
  path: string;
  message: string;
  severity: "block" | "warning";
}
export interface ImportStep {
  name: string;
  status: StepStatus;
  issues: ImportIssue[];
}
export interface ImportCheck {
  steps: ImportStep[];
  topology: Topology | null;
  compatibility: string[];
}
export const initialCheck = (): ImportCheck => ({
  steps: ["文件检查", "内容检查", "节点检查", "连接与关联检查", "导入确认"].map((name) => ({
    name,
    status: "待检查",
    issues: [],
  })),
  topology: null,
  compatibility: [],
});
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export async function checkImport(
  file: Pick<File, "size" | "text">,
  update?: (check: ImportCheck) => void,
): Promise<ImportCheck> {
  const result = initialCheck();
  const emit = () => update?.(structuredClone(result));
  const block = (step: number, path: string, message: string) => {
    result.steps.slice(0, step).forEach((item) => {
      if (item.status === "待检查" || item.status === "检查中") item.status = "通过";
    });
    const target = result.steps[step];
    if (target) {
      target.status = "无法继续";
      target.issues.push({ path, message, severity: "block" });
    }
    result.steps.slice(step + 1).forEach((item) => {
      item.status = "未执行";
    });
    emit();
    return result;
  };
  const first = result.steps[0];
  if (first) first.status = "检查中";
  emit();
  if (file.size > IMPORT_LIMITS.bytes)
    return block(0, "文件", "文件超过 5 MiB，请减少内容后重新导出。");
  if (!file.size) return block(0, "文件", "文件为空，请重新选择网络图 JSON 文件。");
  let text: string;
  try {
    text = await file.text();
  } catch {
    return block(0, "文件", "无法读取文件，请重新选择或检查文件访问权限。");
  }
  if (!text.trim()) return block(0, "文件", "文件没有内容，请重新导出网络图。");
  if (new TextEncoder().encode(text).length > IMPORT_LIMITS.bytes)
    return block(0, "文件", "文件超过 5 MiB，请减少内容后重新导出。");
  if (first) first.status = "通过";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return block(
      1,
      "文件内容",
      "内容不是有效 JSON，请选择网络图文件，而不是图片、PDF 或其他文件。",
    );
  }
  if (!object(raw)) return block(1, "文件内容", "需要完整网络图对象，请重新导出网络图。");
  if (
    "courses" in raw ||
    "learning" in raw ||
    "progress" in raw ||
    (typeof raw.kind === "string" && /learn|course/i.test(raw.kind)) ||
    (typeof raw.type === "string" && /learn|course/i.test(raw.type))
  )
    return block(
      1,
      "文件类型",
      "这是学习备份，不能替换工作台网络图。当前版本尚不支持恢复学习备份。",
    );
  if (Array.isArray(raw.devices) && raw.devices.length > IMPORT_LIMITS.devices)
    return block(1, "devices", "设备超过 200 台，请拆分网络图后导入。");
  if (Array.isArray(raw.links) && raw.links.length > IMPORT_LIMITS.links)
    return block(1, "links", "连线超过 500 条，请拆分网络图后导入。");
  if (
    Array.isArray(raw.devices) &&
    raw.devices.some(
      (device) =>
        object(device) && Array.isArray(device.ports) && device.ports.length > IMPORT_LIMITS.ports,
    )
  )
    return block(2, "devices.ports", "单台设备超过 64 个端口，请拆分网络图后导入。");
  const secrets: string[] = [];
  const remaining: unknown[] = [raw];
  while (remaining.length) {
    const value = remaining.pop();
    if (Array.isArray(value)) for (const item of value) remaining.push(item);
    else if (object(value))
      for (const [key, child] of Object.entries(value)) {
        if (/password/i.test(key) && typeof child === "string" && child) secrets.push(child);
        else if (child && typeof child === "object") remaining.push(child);
      }
  }
  const safe = (message: string) =>
    secrets.reduce((text, secret) => text.split(secret).join("[已隐藏]"), message);
  const location = (path: string) => {
    const index = /^devices\[(\d+)\]/.exec(path)?.[1];
    const device =
      index !== undefined && Array.isArray(raw.devices) ? raw.devices[Number(index)] : null;
    return object(device) && typeof device.name === "string"
      ? safe(`${device.name} (${typeof device.id === "string" ? device.id : "身份无效"}) · ${path}`)
      : safe(path || "文件内容");
  };
  const parsed = parseTopology(raw, { allowInvalidConfig: true });
  if (!parsed.ok) {
    const group = (path: string) =>
      /^(links|groups|appearance\.(devices|links))/.test(path) ||
      /\.(linkId|proxy\.deviceId)$/.test(path)
        ? 3
        : /^devices\[/.test(path)
          ? 2
          : 1;
    const earliest = Math.min(...parsed.errors.map((error) => group(error.path)));
    result.steps.forEach((step, i) => {
      step.status = i < earliest ? "通过" : i === earliest ? "无法继续" : "未执行";
    });
    const step = result.steps[earliest];
    if (step)
      step.issues = parsed.errors
        .filter((error) => group(error.path) === earliest)
        .map((error) => ({
          path: location(error.path),
          message: `${safe(error.message)}。请修正该字段后重新导出。`,
          severity: "block",
        }));
    emit();
    return result;
  }
  const topology = parsed.topology;
  result.steps.forEach((step) => {
    step.status = "通过";
  });
  const addWarning = (stepIndex: number, path: string, message: string) => {
    const step = result.steps[stepIndex];
    if (step) {
      step.status = "有提醒";
      step.issues.push({
        path: location(path),
        message: `${safe(message)}。原值保留，导入后可在设备配置中处理。`,
        severity: "warning",
      });
    }
  };
  parsed.warnings.forEach((warning) => {
    addWarning(2, warning.path, warning.message);
  });
  try {
    lint(topology)
      .filter((issue) => !["L009", "L013", "L018", "L020"].includes(issue.ruleId))
      .forEach((issue) => {
        const target = issue.targets[0];
        const index = topology.devices.findIndex((device) => device.id === target?.deviceId);
        addWarning(
          issue.targets.length > 1 ? 3 : 2,
          index >= 0 ? `devices[${index}].${target?.field ?? "config"}` : "网络图",
          issue.message,
        );
      });
  } catch {
    return block(2, "设备配置", "配置无法安全检查，请确认设备字段完整后重新导出。");
  }
  const devices = raw.devices as Record<string, unknown>[];
  if (
    devices.some(
      (device) =>
        device.type === "server" &&
        object(device.config) &&
        Array.isArray(device.config.services) &&
        device.config.services.some((service) => object(service) && service.protocol === undefined),
    )
  )
    result.compatibility.push("旧服务未注明协议，按 TCP 解释；原文件不修改。");
  if (
    devices.some(
      (device) =>
        device.type === "internet" &&
        object(device.config) &&
        object(device.config.access) &&
        device.config.access.mode === undefined,
    )
  )
    result.compatibility.push("旧互联网接入未注明方式，沿用 DHCP。");
  if (!raw.groups) result.compatibility.push("文件未包含固定分组，保持无分组。");
  if (!raw.appearance) result.compatibility.push("文件未包含配色，沿用默认外观。");
  result.topology = topology;
  emit();
  return result;
}
