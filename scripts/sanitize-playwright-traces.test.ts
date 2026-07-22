import { describe, expect, it } from "vitest";

import { sanitizeTraceNetwork } from "./sanitize-playwright-traces";

describe("sanitizeTraceNetwork", () => {
  it("認証情報を含む場合、cookieと認証headerの値を伏せる", () => {
    const record = {
      snapshot: {
        request: {
          cookies: [{ name: "authjs.csrf-token", value: "request-secret" }],
          headers: [
            { name: "Cookie", value: "authjs.csrf-token=request-secret" },
            { name: "X-Test", value: "public-value" },
          ],
        },
        response: {
          cookies: [
            {
              name: "authjs.callback-url",
              value: "response-secret",
              path: "/",
            },
          ],
          headers: [
            {
              name: "Set-Cookie",
              value: "authjs.callback-url=response-secret",
            },
          ],
        },
      },
    };
    const expected = {
      snapshot: {
        request: {
          cookies: [{ name: "authjs.csrf-token", value: "[REDACTED]" }],
          headers: [
            { name: "Cookie", value: "[REDACTED]" },
            { name: "X-Test", value: "public-value" },
          ],
        },
        response: {
          cookies: [
            {
              name: "authjs.callback-url",
              value: "[REDACTED]",
              path: "/",
            },
          ],
          headers: [{ name: "Set-Cookie", value: "[REDACTED]" }],
        },
      },
    };
    const source = `${JSON.stringify(record)}\n`;

    const result = sanitizeTraceNetwork(source);

    expect(result).toBe(`${JSON.stringify(expected)}\n`);
    expect(result).not.toContain("request-secret");
    expect(result).not.toContain("response-secret");
  });

  it("network JSONが不正な場合、元データを保持せず失敗する", () => {
    expect(() => sanitizeTraceNetwork('{"snapshot":')).toThrow(
      "Invalid trace network JSON at line 1",
    );
  });
});
