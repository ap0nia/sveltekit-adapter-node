import 'SHIMS';
import { Server } from 'SERVER';
import { manifest } from 'MANIFEST';

import url from 'node:url';
import path from 'node:path';
import { env } from './env.js'
import { serve } from './routing/static.js'
import { createSsr } from './routing/ssr.js'
import { serve_prerendered } from './routing/prerendered.js'

/**
 * The directory where all these files are located together.
 */
const buildDirectory = url.fileURLToPath(import.meta.SERVER_DIR);

const origin = env('ORIGIN', undefined);
const xff_depth = parseInt(env('XFF_DEPTH', '1'));
const address_header = env('ADDRESS_HEADER', '').toLowerCase();
const protocol_header = env('PROTOCOL_HEADER', '').toLowerCase();
const host_header = env('HOST_HEADER', 'host').toLowerCase();
const body_size_limit = parseInt(env('BODY_SIZE_LIMIT', '524288'));

const server = new Server(manifest);

await server.init({ env: process.env });

/** 
 * @param {import('polka').Middleware[]} handlers 
 * @returns {import('polka').Middleware}
 */
function sequence(handlers) {
  /** 
   * @type {import('polka').Middleware}
   */
  function middleware(req, res, next) {
    /**
     * @param {number} i
     * @returns {ReturnType<import('polka').Middleware>}
     */
    const handle = (i) => i < handlers.length ? handlers[i](req, res, () => handle(i + 1)) : next()
    return handle(0);
  };

  return middleware;
}

export const handler = sequence(
  [
    serve(path.join(buildDirectory, 'client'), true),
    serve(path.join(buildDirectory, 'static')),
    serve_prerendered(buildDirectory),
    createSsr(
      server,
      origin,
      xff_depth,
      address_header,
      protocol_header,
      host_header,
      body_size_limit,
    )
  ].filter(Boolean)
);
