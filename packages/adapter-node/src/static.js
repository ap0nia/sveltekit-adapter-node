import { manifest, prerendered } from 'MANIFEST';

import fs from 'node:fs';
import path from 'node:path';
import sirv from 'sirv';
import { parse as polka_url_parser } from '@polka/url';

/**
 * @param {string} path
 * @param {boolean} client
 */
export function serve(path, client = false) {
  if (!fs.existsSync(path)) return

  return sirv(path, {
    etag: true,
    gzip: true,
    brotli: true,
    setHeaders: client && ((res, pathname) => {
      // only apply to build directory, not e.g. version.json
      if (pathname.startsWith(`/${manifest.appPath}/immutable/`) && res.statusCode === 200) {
        res.setHeader('cache-control', 'public,max-age=31536000,immutable');
      }
    })
  })
}

/**
 * Required because the static file server ignores trailing slashes.
 * @param {string} dir
 * @returns {import('polka').Middleware}
 */
export function serve_prerendered(dir) {
  const handler = serve(path.join(dir, 'prerendered'));

  return (req, res, next) => {
    let parsedRequest = polka_url_parser(req);

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

