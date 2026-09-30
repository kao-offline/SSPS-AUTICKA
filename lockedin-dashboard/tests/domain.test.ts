import { afterEach, expect, test, vi } from 'vitest';
import worker from '../../deploy/cloudflare/worker.mjs';

afterEach(() => vi.unstubAllGlobals());

test('domain proxy preserves API requests and rewrites upstream redirects', async () => {
  let forwarded: Request | undefined;
  vi.stubGlobal('fetch', async (request: Request) => {
    forwarded = request;
    return new Response(null, {status:307,headers:{location:'https://ssps-auticka.vercel.app/dashboard'}});
  });
  const response = await worker.fetch(new Request('https://li.kaooffline.top/api/demo/read?x=1',{headers:{'x-api-key':'test-key'}}),{ORIGIN:'https://ssps-auticka.vercel.app'});
  expect(forwarded?.url).toBe('https://ssps-auticka.vercel.app/api/demo/read?x=1');
  expect(forwarded?.headers.get('x-api-key')).toBe('test-key');
  expect(response.headers.get('location')).toBe('https://li.kaooffline.top/dashboard');
});

test('domain proxy cannot be used for arbitrary hosts', async () => {
  expect((await worker.fetch(new Request('https://other.example/'),{ORIGIN:'https://ssps-auticka.vercel.app'})).status).toBe(404);
});
