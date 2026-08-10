import { sanitizeRedirectTarget } from "./redirects";

describe("sanitizeRedirectTarget", () => {
  it("preserves same-origin relative paths", () => {
    expect(sanitizeRedirectTarget("/account?tab=security", "/")).toBe("/account?tab=security");
    expect(sanitizeRedirectTarget("/affiliate/join?token=abc123", "/login")).toBe("/affiliate/join?token=abc123");
  });

  it("rejects external or unsafe redirect targets", () => {
    expect(sanitizeRedirectTarget("https://evil.example", "/")).toBe("/");
    expect(sanitizeRedirectTarget("//evil.example", "/login")).toBe("/login");
    expect(sanitizeRedirectTarget("javascript:alert(1)", "/account")).toBe("/account");
  });

  it("falls back when the input is empty or malformed", () => {
    expect(sanitizeRedirectTarget("", "/account")).toBe("/account");
    expect(sanitizeRedirectTarget("   ", "/login")).toBe("/login");
  });
});
