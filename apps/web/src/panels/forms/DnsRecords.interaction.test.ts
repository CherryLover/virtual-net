// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DnsRecord } from "../../engine";
import { DnsRecords } from "./ServiceForms";

let root: Root;
let container: HTMLDivElement;
let current: DnsRecord[];
function Harness() {
  const [records, setRecords] = useState<DnsRecord[]>([
    { domain: "first.example", ip: "192.0.2.10" },
    { domain: "middle.example", ip: "192.0.2.20" },
    { domain: "last.example", ip: "192.0.2.20" },
  ]);
  current = records;
  return createElement(DnsRecords, { records, onChange: setRecords });
}
function input(index: number, field: "domain" | "ip") {
  const found = container.querySelector<HTMLInputElement>(
    `[data-field="records.${index}.${field}"] input`,
  );
  if (!found) throw new Error("DNS field missing");
  return found;
}
async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("native input setter missing");
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("DNS record component editing", () => {
  it("commits domain then IP without remounting the next focused field", async () => {
    const domain = input(0, "domain");
    const ip = input(0, "ip");
    await typeInto(domain, "renamed.example");
    await act(async () => ip.focus());
    expect(current[0]?.domain).toBe("renamed.example");
    expect(document.activeElement).toBe(ip);
    expect(input(0, "ip")).toBe(ip);
    expect(input(0, "domain")).toBe(domain);
    await typeInto(ip, "192.0.2.99");
    await act(async () => ip.blur());
    expect(current[0]).toEqual({ domain: "renamed.example", ip: "192.0.2.99" });
    expect(container.querySelector(".field-error")).toBeNull();
  });
  it("deleting the middle record cannot transfer its invalid draft to the next row with an identical original IP", async () => {
    const middleIp = input(1, "ip");
    await typeInto(middleIp, "not-an-ip");
    await act(async () => middleIp.blur());
    expect(container.querySelector(".field-error")).not.toBeNull();
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="删除 DNS 记录 2"]',
    );
    if (!remove) throw new Error("delete button missing");
    await act(async () => remove.click());
    expect(current).toEqual([
      { domain: "first.example", ip: "192.0.2.10" },
      { domain: "last.example", ip: "192.0.2.20" },
    ]);
    expect(input(1, "domain").value).toBe("last.example");
    expect(input(1, "ip").value).toBe("192.0.2.20");
    expect(container.querySelector(".field-error")).toBeNull();
    await typeInto(input(1, "ip"), "192.0.2.45");
    await act(async () => input(1, "ip").blur());
    expect(current[1]).toEqual({ domain: "last.example", ip: "192.0.2.45" });
  });
});
