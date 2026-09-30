import { expect, test } from 'vitest';
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { normalizePrivateKey } from '../convex/authEnv';

test('PEM keys retain valid headers with spaces and escaped newlines', () => {
  const {privateKey} = generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
  for (const encoded of [pem,pem.replace(/\n/g,' '),JSON.stringify(pem)]) {
    expect(createPrivateKey(normalizePrivateKey(encoded)).asymmetricKeyType).toBe('rsa');
  }
});

test('malformed key errors do not include secret material', () => {
  expect(()=>normalizePrivateKey('secret-bad-value')).toThrow('PKCS8');
});
