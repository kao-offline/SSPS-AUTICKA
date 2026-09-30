export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.hostname !== 'li.kaooffline.top') return new Response('Not found', {status:404});
    const upstream = new URL(incoming.pathname + incoming.search, env.ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', 'https');
    try {
      const response = await fetch(new Request(upstream, {method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
      const output = new Response(response.body, response);
      const location = output.headers.get('location');
      if (location) {
        const target = new URL(location, upstream);
        if (target.origin === new URL(env.ORIGIN).origin) {
          target.host = incoming.host;
          output.headers.set('location', target.toString());
        }
      }
      return output;
    } catch {
      return new Response('Dashboard temporarily unavailable', {status:502,headers:{'cache-control':'no-store'}});
    }
  },
};
