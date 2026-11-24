// Cloudflare Pages: every /api/... request runs the UnStevened Social server.
import handler from '../../server/api.mjs';
export const onRequest = (ctx) => handler(ctx.request, { ip: ctx.request.headers.get('CF-Connecting-IP'), env: ctx.env });
