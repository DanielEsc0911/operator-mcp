export class ConfigError extends Error {
  constructor() {
    super("Not configured. Run: npx operator-mcp setup");
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super("Server is in read-only mode (OPENPROJECT_READ_ONLY)");
  }
}

export class OpenProjectError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
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
