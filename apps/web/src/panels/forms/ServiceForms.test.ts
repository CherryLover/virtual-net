import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildRuntime } from "../../engine";
import { servicesTopology } from "../../engine/serviceSample";
import { AccessControlForm, AccessPolicyForm, ProxyForm, ServerForm } from "./ServiceForms";

function fixture() {
  const topology = servicesTopology();
  const proxy = topology.devices.find((d) => d.type === "proxy");
  const server = topology.devices.find((d) => d.type === "server");
  const control = topology.devices.find((d) => d.type === "access-control");
  if (!proxy || !server || !control) throw new Error("示例设备缺失");
  return { proxy, server, control, runtime: buildRuntime(topology) };
}

describe("service diagnostic highlighting", () => {
  it("highlights exactly the requested proxy field", () => {
    const { proxy, runtime } = fixture();
    const html = renderToStaticMarkup(
      createElement(ProxyForm, { device: proxy, runtime, highlight: "proxy.port" }),
    );
    expect(html).toContain('class="field field-highlight" data-field="proxy.port"');
    expect(html.match(/field-highlight/g)).toHaveLength(1);
  });
  it("highlights DNS service sections and nested records separately", () => {
    const { server, runtime } = fixture();
    expect(
      renderToStaticMarkup(
        createElement(ServerForm, { device: server, runtime, highlight: "dnsService" }),
      ),
    ).toContain('class="service-section field-highlight" data-field="dnsService"');
    const html = renderToStaticMarkup(
      createElement(ServerForm, { device: server, runtime, highlight: "dnsService.records.0.ip" }),
    );
    expect(html).toContain('class="field field-highlight" data-field="dnsService.records.0.ip"');
    expect(html.match(/field-highlight/g)).toHaveLength(1);
  });
  it("highlights a specific service port instead of its entire section", () => {
    const { server, runtime } = fixture();
    const html = renderToStaticMarkup(
      createElement(ServerForm, {
        device: server,
        runtime,
        highlight: "services.internal-https.port",
      }),
    );
    expect(html).toContain(
      'class="field field-highlight" data-field="services.internal-https.port"',
    );
    expect(html.match(/field-highlight/g)).toHaveLength(1);
  });
  it("highlights rewrite settings and opens the diagnosed rule", () => {
    const { control } = fixture();
    expect(
      renderToStaticMarkup(
        createElement(AccessControlForm, { device: control, highlight: "dnsRewrite.enabled" }),
      ),
    ).toContain('class="field field-inline field-highlight" data-field="dnsRewrite.enabled"');
    const html = renderToStaticMarkup(
      createElement(AccessPolicyForm, {
        device: control,
        highlight: "accessPolicy.rules.restrict-mail",
      }),
    );
    expect(html).toContain('class="rule-item" open=""');
    expect(html).toContain(
      'class="rule-body field-highlight" data-field="accessPolicy.rules.restrict-mail"',
    );
    expect(html.match(/field-highlight/g)).toHaveLength(1);
  });
  it("locates the default action when no rule matched", () => {
    const { control } = fixture();
    const html = renderToStaticMarkup(
      createElement(AccessPolicyForm, {
        device: control,
        highlight: "accessPolicy.defaultAction",
      }),
    );
    expect(html).toContain('class="field field-highlight" data-field="accessPolicy.defaultAction"');
    expect(html.match(/field-highlight/g)).toHaveLength(1);
  });
});

import { createElement } from "react";
