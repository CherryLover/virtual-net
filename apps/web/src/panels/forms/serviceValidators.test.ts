import { describe, expect, it } from "vitest";
import { addressMatcherValidator, domainValidator, portValidator } from "./serviceValidators";

describe("service form validation", () => {
  it("accepts only integer service ports", () => {
    for (const value of ["1", "443", "65535"]) expect(portValidator(value)).toBeNull();
    for (const value of ["", "0", "65536", "1.5", "abc"])
      expect(portValidator(value)).not.toBeNull();
  });
  it("validates IP and CIDR without accepting malformed prefixes", () => {
    for (const value of ["", "*", "10.0.0.1", "10.0.0.0/0", "10.0.0.1/32"])
      expect(addressMatcherValidator(value)).toBeNull();
    for (const value of ["999.1.1.1", "10.0.0.0/33", "10.0.0.0/", "10.0.0.0/1/2"])
      expect(addressMatcherValidator(value)).not.toBeNull();
  });
  it("validates visible domain patterns", () => {
    expect(domainValidator("*.example.com", true)).toBeNull();
    expect(domainValidator("*.example.com")).not.toBeNull();
    expect(domainValidator("a..b")).not.toBeNull();
    expect(domainValidator("a.-b")).not.toBeNull();
    expect(domainValidator("service.example")).toBeNull();
    expect(domainValidator("https://example.com")).not.toBeNull();
  });
});
