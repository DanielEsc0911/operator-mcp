export class ConfigError extends Error {
  constructor(message = "Not configured. Run: npx operator-mcp setup") {
    super(message);
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super("Server is in read-only mode (profile readOnly or OPENPROJECT_READ_ONLY)");
  }
}

export class OpenProjectError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const WRITE_MAY_HAVE_HAPPENED = "A write may already have happened — check the work package or list before retrying.";

export class UnexpectedResponseError extends Error {
  constructor(method: string, detail: string) {
    super(method === "GET" ? detail : `${detail} ${WRITE_MAY_HAVE_HAPPENED}`);
  }
}

type ErrorBody = {
  message?: string;
  _embedded?: { errors?: { message?: string }[] };
};

function detailOf(body: unknown): string | undefined {
  const parsed = body as ErrorBody | undefined;
  const validations = parsed?._embedded?.errors?.map((error) => error.message).filter(Boolean);
  if (validations?.length) return validations.join("; ");
  return parsed?.message || undefined;
}

export function describeHttpError(status: number, baseUrl: string, body: unknown): string {
  const detail = detailOf(body);
  switch (status) {
    case 401:
      return `API key rejected by ${baseUrl} — regenerate at ${baseUrl}/my/access_token`;
    case 403:
      return detail ?? "Your account lacks the required permission for this action";
    case 404:
      return detail ?? "Not found (or not visible to you)";
    case 409:
      return `${detail ?? "The resource changed while you were editing it"}. Read the resource again and retry.`;
    default:
      return detail ?? `OpenProject returned ${status}`;
  }
}

export function humanMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const CERTIFICATE_CODE = /^(?:SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_GET_ISSUER_CERT(?:_LOCALLY)?|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/;

export function networkReason(error: unknown): string {
  const cause = error instanceof Error ? (error.cause as { code?: string; message?: string } | undefined) : undefined;
  const message = humanMessage(error);
  const detail = [cause?.code, cause?.message].filter((part) => part && !message.includes(part)).join(": ");
  const reason = detail ? `${message} (${detail})` : message;
  const certificate = CERTIFICATE_CODE.test(cause?.code ?? "") ? " Point NODE_EXTRA_CA_CERTS at your organization's CA file to trust it." : "";
  return `${reason}${certificate}`;
}
