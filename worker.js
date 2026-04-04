export default {
  async fetch(request, env) {
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    }

    return new Response(JSON.stringify({ error: 'Not found' }, null, 2), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
};
