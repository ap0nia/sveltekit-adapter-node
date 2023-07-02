import { manifest } from 'MANIFEST';

import fs from 'node:fs';
import sirv from 'sirv';

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

