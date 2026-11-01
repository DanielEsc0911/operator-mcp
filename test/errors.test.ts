import { describe, expect, it } from "vitest";
import { networkReason, ConfigError, ReadOnlyError, OpenProjectError, describeHttpError, humanMessage } from "../src/errors.js";

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
    expect(humanMessage(new ReadOnlyError())).toBe("Server is in read-only mode (profile readOnly or OPENPROJECT_READ_ONLY)");
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

describe("networkReason", () => {
  const failure = (cause: object, message = "fetch failed") => new TypeError(message, { cause: Object.assign(new Error((cause as any).message), cause) });

  it("adds the certificate hint only for certificate codes", () => {
    expect(networkReason(failure({ code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self-signed" }))).toContain("NODE_EXTRA_CA_CERTS");
    expect(networkReason(failure({ code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", message: "x" }))).toContain("NODE_EXTRA_CA_CERTS");
    expect(networkReason(failure({ code: "ECONNREFUSED", message: "refused" }))).not.toContain("NODE_EXTRA_CA_CERTS");
    expect(networkReason(failure({ code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "altname" }))).not.toContain("NODE_EXTRA_CA_CERTS");
  });

  it("does not repeat a code the message already contains", () => {
    const reason = networkReason(failure({ code: "ECONNRESET", message: "boom" }, "fetch failed: ECONNRESET"));
    expect(reason.match(/ECONNRESET/g)).toHaveLength(1);
  });
});
