import { describe, expect, it } from "vitest";
import {
  inRange,
  inSubnet,
  ipRange,
  isHostAddress,
  isPrivate,
  isValidIp,
  parseIp,
  parseMask,
  SCOPE_LABELS,
  subnetLabel,
} from "./address";

describe("CP1-S1 地址工具", () => {
  it("T-CP1-004 掩码解析与私网判定", () => {
    expect(parseMask("255.255.0.255")).toBeNull();
    expect(parseMask("255.255.255.0")).toBe(24);
    expect(parseMask("255.255.0.0")).toBe(16);
    expect(isPrivate("100.64.1.1")).toBe("carrier");
    expect(SCOPE_LABELS[isPrivate("100.64.1.1")]).toBe("运营商内网");
    expect(isPrivate("192.168.1.1")).toBe("private");
    expect(isPrivate("10.1.1.1")).toBe("private");
    expect(isPrivate("172.16.0.1")).toBe("private");
    expect(isPrivate("8.8.8.8")).toBe("public");
  });

  it("T-CP1-004 IP 解析与格式判定", () => {
    expect(parseIp("192.168.1.1")).toBe(3232235777);
    expect(isValidIp("300.1.1.1")).toBe(false);
    expect(isValidIp("1.1.1")).toBe(false);
    expect(isValidIp("")).toBe(false);
  });

  it("T-CP1-004 网段判断与地址池", () => {
    expect(inSubnet("192.168.1.100", "192.168.1.1", "255.255.255.0")).toBe(true);
    expect(inSubnet("10.0.0.1", "192.168.1.1", "255.255.255.0")).toBe(false);
    expect(subnetLabel("192.168.1.10", "255.255.255.0")).toBe("192.168.1.0/24");
    expect(isHostAddress("192.168.1.0", "255.255.255.0")).toBe(false);
    expect(isHostAddress("192.168.1.255", "255.255.255.0")).toBe(false);
    expect(isHostAddress("192.168.1.1", "255.255.255.0")).toBe(true);
    expect(ipRange("192.168.1.1", "192.168.1.3")).toEqual([
      "192.168.1.1",
      "192.168.1.2",
      "192.168.1.3",
    ]);
    expect(ipRange("192.168.1.3", "192.168.1.1")).toEqual([]);
    expect(inRange("192.168.1.150", "192.168.1.100", "192.168.1.199")).toBe(true);
  });
});
