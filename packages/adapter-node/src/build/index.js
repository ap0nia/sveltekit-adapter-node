import polka from 'polka';
import { env } from './env.js';
import { handler } from './handler.js';

export const path = env('SOCKET_PATH', false);
export const host = env('HOST', '0.0.0.0');
export const port = env('PORT', !path && '3000');

const server = polka().use(handler);

server.listen({ path, host, port }, () => {
  console.log(`🚀 Listening on ${path ? path : host + ':' + port}`);
});

export { server };
