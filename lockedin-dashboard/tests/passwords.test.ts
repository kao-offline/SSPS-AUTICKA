import { Scrypt } from 'lucia';
import { expect, test } from 'vitest';
import { passwordCrypto } from '../convex/passwordCrypto';

test('new bcrypt accounts and original Scrypt accounts both remain usable', async () => {
  const password = 'regression-fixture-password';
  const original = await new Scrypt().hash(password);
  const current = await passwordCrypto.hashSecret(password);
  for (const hash of [original,current]) {
    expect(await passwordCrypto.verifySecret(password,hash)).toBe(true);
    expect(await passwordCrypto.verifySecret('incorrect-password',hash)).toBe(false);
  }
});
