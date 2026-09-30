import { expect, test } from 'vitest';
import { ConvexError } from 'convex/values';
import { apiErrorMessage, apiErrorStatus } from '../src/lib/api-errors';

test('production Convex errors use their public data rather than the redacted message', () => {
  const error = new ConvexError('Invalid API key');
  error.message = '[Request ID: test] Server Error';
  expect(apiErrorStatus(error)).toBe(401);
  expect(apiErrorMessage(error)).toBe('Invalid API key');
});

test.each([['Forbidden: endpoint',403],['Rate limit exceeded',429],['Parking space not found',404],['Bad request: body',400]])('maps %s to %s', (message,status) => {
  expect(apiErrorStatus(new ConvexError(message))).toBe(status);
});
