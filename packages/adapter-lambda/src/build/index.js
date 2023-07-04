import 'SHIMS';
import { Server } from 'SERVER';
import { manifest } from 'MANIFEST';

const server = new Server(manifest);

const initialized = server.init({ env: process.env });

const { routes } = manifest._

const routeMatchers = routes.map(route => route.pattern)

/** 
 * @type {import('aws-lambda').ProxyHandler} 
 */
export async function handler(event, context, callback) {
  await initialized

  const requestUrl = `https://${event.headers.host}${event.path}`;

  const request = new Request(requestUrl, {
    method: event.httpMethod,
    headers: event.headers ?? {},
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

  if (routeMatchers.some(matcher => matcher.test(requestUrl))) {
    response.headers.set('Content-Type', 'text/html')
  }

  /**
   * @type {Record<string, string>}
   */
  const headers = {}

  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  return {
    statusCode: response.status,
    headers,
    body: await response.text(),
  }
}
