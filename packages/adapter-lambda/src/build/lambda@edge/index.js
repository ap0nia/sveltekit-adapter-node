import { prerenderedCandidates } from 'MANIFEST';

import { methodsWithNoBody } from '../http/methods.js';

/**
 * Viewer Request Lambda@Edge handler to improve cache hit ratio.
 *
 * @type {import('aws-lambda').CloudFrontRequestHandler}
 */
export async function handler(event, _context, callback) {
  const { request } = event.Records[0].cf

  if (!methodsWithNoBody.has(request.method)) {
    callback(null, request)
    return
  }

  const prerenderedFile = prerenderedCandidates.get(request.uri)

  /**
   * Lambda@Edge handler will re-write the URL to try to hit cache.
   * For cache misses, it will hit the API Gateway endpoint, which will read from its file system.
   */
  if (!prerenderedFile) {
    callback(null, request)
    return
  }

  request.uri = `/${prerenderedFile}`
  callback(null, request)
}
