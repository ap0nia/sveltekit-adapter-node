import { prerenderedMappings } from 'PRERENDERED';

import { methodsWithNoBody } from '../http/methods.js';

/**
 * Viewer Request Lambda@Edge handler to improve cache hit ratio.
 *
 * @type {import('aws-lambda').CloudFrontRequestHandler}
 */
export async function handler(event, _context, callback) {
  const { request } = event.Records[0].cf

  request.headers['x-forwarded-host'] = request.headers.host.map(({ value }) => ({value}))

  request.querystring = new URLSearchParams(request.querystring).toString()

  if (!methodsWithNoBody.has(request.method)) {
    return callback(null, request)
  }

  const prerenderedFile = prerenderedMappings.get(request.uri)

  /**
   * Lambda@Edge handler will re-write the URL to try to hit cache.
   * For cache misses, it will hit the API Gateway endpoint, which will read from its file system.
   */
  if (!prerenderedFile) {
    return callback(null, request)
  }

  request.uri = `/${prerenderedFile}`

  return callback(null, request)
}
