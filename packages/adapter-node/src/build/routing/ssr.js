import { ENV_PREFIX } from '../env.js';
import { getRequest } from '../http/request.js'
import { setResponse } from '../http/response.js'

/**
 * @param {import('@sveltejs/kit').Server} server
 * @param {string} origin
 * @param {number} xff_depth
 * @param {string} address_header
 * @param {string} protocol_header
 * @param {string} host_header
 * @param {number} body_size_limit
 *
 * @returns {import('polka').Middleware}
 */
export function createSsr(
  server,
  origin,
  xff_depth,
  address_header,
  protocol_header,
  host_header,
  body_size_limit,
) {
  /**
   * @param {import('http').IncomingHttpHeaders} headers
   * @returns
   */
  function get_origin(headers) {
    const protocol = (protocol_header && headers[protocol_header]) || 'https';
    const host = headers[host_header];
    return `${protocol}://${host}`;
  }

  /** 
   * @type {import('polka').Middleware} 
   */
  async function ssr(req, res) {
    const request = await getRequest({
      base: origin || get_origin(req.headers),
      request: req,
      bodySizeLimit: body_size_limit
    }).catch(err => {
      res.statusCode = err.status ?? 400;
    })

    if (!request) {
      res.end('Invalid request body');
      return;
    }

    setResponse(
      res,
      await server.respond(request, {
        platform: { req },
        getClientAddress: () => {
          if (!(address_header in req.headers)) {
            throw new Error(
              `Address header was specified with ${ENV_PREFIX + 'ADDRESS_HEADER'}=${address_header} but is absent from request`
            );
          }

          if (!address_header) {
            return (
              req.connection?.remoteAddress ??
              req.connection?.socket?.remoteAddress ??
              req.socket?.remoteAddress ??
              req.info?.remoteAddress
            );
          }

          const value = /** @type {string} */ (req.headers[address_header]) ?? '';

          if (address_header === 'x-forwarded-for') {
            const addresses = value.split(',');

            if (xff_depth < 1) {
              throw new Error(`${ENV_PREFIX + 'XFF_DEPTH'} must be a positive integer`);
            }

            if (xff_depth > addresses.length) {
              throw new Error(
                `${ENV_PREFIX + 'XFF_DEPTH'} is ${xff_depth}, but only found ${addresses.length
                } addresses`
              );
            }

            return addresses[addresses.length - xff_depth].trim();
          }

          return value;
        }
      })
    );
  }

  return ssr
}

