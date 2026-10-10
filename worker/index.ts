// Cloudflare Worker: /api/* is handled here, everything else is the Vite build in ./dist.
import { handleAgent, type Env } from './agent';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/agent') return handleAgent(req, env);
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
