// What a log line may say about a failure: its kind, a database error code, and a short message.
// Never request bodies, photo bytes, tokens or connection strings.
export function errorFacts(error: unknown) {
  const e = error as { name?: unknown; code?: unknown; message?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const message = typeof e?.message === "string" ? e.message : String(error);
  return {
    errorName: typeof e?.name === "string" ? e.name : typeof error,
    // Postgres SQLSTATE (e.g. 42501 permission denied, 57014 statement timeout, 53300 too many connections).
    errorCode: typeof e?.code === "string" ? e.code : undefined,
    // Connection strings and secrets are cut out in case a driver includes them in a message.
    errorMessage: message.replace(/postgres(ql)?:\/\/\S+/gi, "[connection]").slice(0, 300),
  };
}
