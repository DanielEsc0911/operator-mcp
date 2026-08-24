import { describe, expect, it } from "vitest";
import { ConfigError, ReadOnlyError, OpenProjectError, describeHttpError, humanMessage } from "../src/errors.js";

const BASE = "https://op.acme.com";

describe("describeHttpError", () => {
  it("points 401 at the token page", () => {
    expect(describeHttpError(401, BASE, {})).toBe(
      "API key rejected by https://op.acme.com — regenerate at https://op.acme.com/my/access_token",
    );
  });

  it("passes through OpenProject validation messages verbatim", () => {
    const body = { _embedded: { errors: [{ message: "Subject can't be blank" }, { message: "Type is invalid" }] } };
    expect(describeHttpError(422, BASE, body)).toBe("Subject can't be blank; Type is invalid");
  });

  it("falls back to the top-level message", () => {
    expect(describeHttpError(422, BASE, { message: "Bad request" })).toBe("Bad request");
  });

  it("tells the caller to re-read after a lock conflict", () => {
    expect(describeHttpError(409, BASE, { message: "Version mismatch" })).toBe(
      "Version mismatch. Read the resource again and retry.",
    );
  });

  it("describes 403 and 404 without leaking HAL", () => {
    expect(describeHttpError(403, BASE, {})).toContain("lacks the required permission");
    expect(describeHttpError(404, BASE, {})).toBe("Not found (or not visible to you)");
  });

  it("reports unmapped statuses with their code", () => {
    expect(describeHttpError(503, BASE, {})).toBe("OpenProject returned 503");
  });
});

describe("humanMessage", () => {
  it("renders each typed error", () => {
    expect(humanMessage(new ConfigError())).toBe("Not configured. Run: npx operator-mcp setup");
    expect(humanMessage(new ReadOnlyError())).toBe("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
    expect(humanMessage(new OpenProjectError(404, "Work package 1234 not found"))).toBe("Work package 1234 not found");
  });

  it("renders an unexpected error without a stack trace", () => {
    const message = humanMessage(new TypeError("boom"));
    expect(message).toBe("boom");
    expect(message).not.toContain("at ");
  });

  it("renders a non-error throw", () => {
    expect(humanMessage("something odd")).toBe("something odd");
  });
});
