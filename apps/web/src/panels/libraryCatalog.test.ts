import { describe, expect, it } from "vitest";
import { DEVICE_TYPES } from "../engine";
import { filterLibrary, LIBRARY_GROUPS, libraryGroupCount } from "./libraryCatalog";

const typesOf = (query: string) =>
  filterLibrary(query).flatMap((g) => g.roles.flatMap((r) => r.types));

describe("library catalogue", () => {
  it("keeps every supported type exactly once without inventing service node types", () => {
    const types = typesOf("");
    expect([...types].sort()).toEqual([...DEVICE_TYPES].sort());
    expect(new Set(types).size).toBe(types.length);
    expect(LIBRARY_GROUPS.map((g) => [g.name, libraryGroupCount(g)])).toEqual([
      ["设备与主机", 6],
      ["软件与服务", 2],
      ["网络环境", 1],
    ]);
  });
  it("separates hosts, service entries and the external network", () => {
    expect(typesOf("设备与主机")).toEqual(["modem", "ap", "switch", "router", "pc", "server"]);
    expect(typesOf("软件与服务")).toEqual(["proxy", "access-control"]);
    expect(typesOf("网络环境")).toEqual(["internet"]);
  });
  it("searches roles and protocol aliases with case-insensitive multiword matching", () => {
    expect(typesOf("交换隔离")).toEqual(["switch"]);
    expect(typesOf(" 软件 SOCKS5 ")).toEqual(["proxy"]);
    expect(typesOf("http")).toEqual(["proxy"]);
    expect(typesOf("VLAN")).toEqual(["switch"]);
  });
  it("routes DNS and application searches to their existing server host", () => {
    expect(typesOf("DNS")).toEqual(["server"]);
    expect(typesOf("应用")).toEqual(["server"]);
    expect(typesOf("名称解析")).toEqual(["server"]);
  });
  it("omits empty branches without mutating the catalogue", () => {
    expect(filterLibrary("no-such-device")).toEqual([]);
    expect(filterLibrary("proxy")).toEqual([
      { id: "services", name: "软件与服务", roles: [{ name: "代理转发", types: ["proxy"] }] },
    ]);
    expect(typesOf(" ")).toHaveLength(9);
  });
});
