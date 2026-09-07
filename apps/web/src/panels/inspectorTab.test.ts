import { describe, expect, it } from "vitest";
import { diagnosticTab } from "./inspectorTab";

describe("diagnostic panel destination", () => {
  it("opens the port section for port-specific issues", () => {
    expect(diagnosticTab("vlan", "port-1")).toBe("ports");
    expect(diagnosticTab("lanPorts", null)).toBe("ports");
    expect(diagnosticTab("ports.vlan", null)).toBe("ports");
  });
  it("opens configuration for fields and keeps the current tab for simple selection", () => {
    expect(diagnosticTab("gateway", null)).toBe("config");
    expect(diagnosticTab(null, null)).toBeNull();
  });
});
