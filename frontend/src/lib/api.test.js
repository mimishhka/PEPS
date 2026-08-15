import { buildApiBaseUrl } from "./api";

describe("buildApiBaseUrl", () => {
  it("falls back to the current origin when no backend env var is provided", () => {
    expect(buildApiBaseUrl("", {
      hostname: "shop.example.com",
      origin: "https://shop.example.com",
    })).toBe("https://shop.example.com/api");
  });

  it("normalizes a configured backend URL without duplicating the api suffix", () => {
    expect(buildApiBaseUrl("https://api.example.com/api")).toBe("https://api.example.com/api");
  });
});
