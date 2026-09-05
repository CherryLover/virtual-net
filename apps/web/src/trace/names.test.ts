/** 名字表：实时拓扑与快照两种来源（CP3 4.2） */

import { describe, expect, it } from "vitest";
import { createNames, namesFromSnapshot, RAW_NAMES, snapshotNames } from "./names";
import { minimalTopology, PC1, R1 } from "./testProbes";

describe("CP3 名字表", () => {
  it("createNames 从当前拓扑查设备名与端口名", () => {
    const names = createNames(minimalTopology());
    expect(names.device(PC1)).toBe("电脑1");
    expect(names.device(R1)).toBe("路由器1");
    expect(names.port("p_pc1_eth0")).toBe("eth0");
    expect(names.port("p_r1_wan")).toBe("wan");
    // 查不到就回 id，不抛错
    expect(names.device("d_none")).toBe("d_none");
    expect(names.port("p_none")).toBe("p_none");
  });

  it("namesFromSnapshot 认快照表，设备删掉之后名字还在", () => {
    const topology = minimalTopology();
    const snapshot = snapshotNames(topology);
    topology.devices = topology.devices.filter((d) => d.id !== R1);

    expect(createNames(topology).device(R1)).toBe(R1);
    expect(namesFromSnapshot(snapshot).device(R1)).toBe("路由器1");
    expect(namesFromSnapshot(snapshot).port("p_r1_lan1")).toBe("lan1");
    expect(namesFromSnapshot(snapshot).device("d_none")).toBe("d_none");
  });

  it("RAW_NAMES 什么都不知道时原样回 id", () => {
    expect(RAW_NAMES.device(PC1)).toBe(PC1);
    expect(RAW_NAMES.port("p_pc1_eth0")).toBe("p_pc1_eth0");
  });
});
