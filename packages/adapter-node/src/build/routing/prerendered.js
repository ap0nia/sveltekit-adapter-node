import { prerendered } from 'MANIFEST';

import path from 'node:path';
import { parse } from '@polka/url';
import { serve } from './static.js'

/**
 * Required because the static file server ignores trailing slashes.
 * @param {string} dir
 * @returns {import('polka').Middleware}
 */
export function serve_prerendered(dir) {
  const handler = serve(path.join(dir, 'prerendered'));

  return (req, res, next) => {
    const parsedRequest = parse(req);

    let { pathname } = parsedRequest

    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // ignore invalid URI
    }

    if (prerendered.has(pathname)) {
      return handler(req, res, next);
    }

    // Remove or add trailing slash as appropriate.
    const location = pathname.at(-1) === '/' ? pathname.slice(0, -1) : pathname + '/';

    if (prerendered.has(location)) {
      res.writeHead(308, {
        location: `${location}${parsedRequest.query ? parsedRequest.search : ''}`
      })
      res.end();
    } else {
      next();
    }
  };
}

