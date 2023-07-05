import { prerenderedMappings } from 'PRERENDERED';

import { FORWARDED_HOST_HEADER } from '../http/headers.js'
import { methodsForPrerenderedFiles } from '../http/methods.js';

/**
 * Viewer Request Lambda@Edge handler to improve cache hit ratio.
 *
 * @type {import('aws-lambda').CloudFrontRequestHandler}
 */
export async function handler(event, _context, callback) {
  const { request } = event.Records[0].cf

  request.headers[FORWARDED_HOST_HEADER] = request.headers.host.map(({ value }) => ({value}))

  /**
   * Correctly encodes querystring parameters containing "/"
   * @example ?/enter => ?%2Fenter
   */
  request.querystring = new URLSearchParams(request.querystring).toString()

  if (!methodsForPrerenderedFiles.has(request.method)) {
    return callback(null, request)
  }

  const prerenderedFile = prerenderedMappings.get(request.uri)

  /**
   * Lambda@Edge handler will re-write the URL to try to hit cache.
   * For cache misses, it will hit the Lambda function, which will read from file system.
   */
  if (!prerenderedFile) {
    return callback(null, request)
  }

  request.uri = `/${prerenderedFile}`

  return callback(null, request)
}
