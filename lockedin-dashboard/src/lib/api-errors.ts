export function apiErrorStatus(error: unknown) {
  const message = apiErrorMessage(error);
  if (/Rate limit exceeded/i.test(message)) return 429;
  if (/Invalid API key|Invalid or revoked|Invalid.*token|Missing.*token|Not authenticated|Unauthorized/i.test(message)) return 401;
  if (/Forbidden|not allowed|inactive/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/Bad request|Invalid JSON|ArgumentValidationError/i.test(message)) return 400;
  return 500;
}

export function apiErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && typeof error.data === 'string') return error.data;
  return error instanceof Error ? error.message : String(error);
}
