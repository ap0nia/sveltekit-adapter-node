import 'SHIMS';
import { Server } from 'SERVER';
import { manifest } from 'MANIFEST';

const server = new Server(manifest);

const initialized = server.init({ env: process.env });

/** 
 * @type {import('aws-lambda').ProxyHandler} 
 */
export async function handler(event, context, callback) {
  await initialized

  const request = new Request(event.path, {
    method: event.httpMethod,
    headers: null,
  })

  const response = await server.respond(request, {
    platform: {
      event,
      context,
      callback,
    },
    getClientAddress() {
      return request.headers.get('x-forwarded-for')
    },
  })

  return {
    statusCode: response.status,
    body: await response.text(),
    isBase64Encoded: false,
  }
}
