import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function serveAsset(name, contentType) {
  const body = await readFile(join(process.cwd(), 'public', name), 'utf8');
  return new Response(body, { headers: { 'content-type': contentType } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return serveAsset('index.html', 'text/html; charset=utf-8');
    }
    if (url.pathname === '/client.js') {
      return serveAsset('client.js', 'application/javascript; charset=utf-8');
    }
    if (url.pathname === '/styles.css') {
      return serveAsset('styles.css', 'text/css; charset=utf-8');
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(JSON.stringify({ error: 'Not found' }, null, 2), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
};
