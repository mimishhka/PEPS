import { buildApiBaseUrl } from "./api";

describe("buildApiBaseUrl", () => {
  const originalEnv = process.env.REACT_APP_BACKEND_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_BACKEND_URL;
    } else {
      process.env.REACT_APP_BACKEND_URL = originalEnv;
    }
  });

  it("falls back to the current origin when no backend env var is provided", () => {
    delete process.env.REACT_APP_BACKEND_URL;
    window.history.pushState({}, "", "https://shop.example.com/account");

    expect(buildApiBaseUrl()).toBe("https://shop.example.com/api");
  });

  it("normalizes a configured backend URL without duplicating the api suffix", () => {
    process.env.REACT_APP_BACKEND_URL = "https://api.example.com/api";

    expect(buildApiBaseUrl()).toBe("https://api.example.com/api");
  });
});
