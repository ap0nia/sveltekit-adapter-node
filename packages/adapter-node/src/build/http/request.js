import { error } from '@sveltejs/kit'

/**
 * @param {import('http').IncomingMessage} req
 * @param {number} [body_size_limit]
 */
function get_raw_body(req, body_size_limit) {
  const h = req.headers;

  if (!h['content-type']) {
    return null;
  }

  const content_length = Number(h['content-length']);

  const noBody = req.httpVersionMajor === 1 && isNaN(content_length) && h['transfer-encoding'] == null

  if (noBody || content_length === 0) {
    return null;
  }

  const length = body_size_limit && !content_length ? body_size_limit : content_length;

  if (length > body_size_limit) {
    throw error(
      413,
      `Received content-length of ${length}, but only accept up to ${body_size_limit} bytes.`
    );
  }

  if (req.destroyed) {
    const readable = new ReadableStream();
    readable.cancel();
    return readable;
  }

  let size = 0;
  let cancelled = false;

  return new ReadableStream({
    start(controller) {
      req.on('error', (error) => {
        cancelled = true;
        controller.error(error);
      });

      req.on('end', () => {
        if (cancelled) return;
        controller.close();
      });

      req.on('data', (chunk) => {
        if (cancelled) {
          return;
        }

        size += chunk.length;

        if (size > length) {
          cancelled = true;
          controller.error(
            error(
              413,
              `request body size exceeded ${content_length ? "'content-length'" : 'BODY_SIZE_LIMIT'
              } of ${length}`
            )
          );
          return;
        }

        controller.enqueue(chunk);

        if (controller.desiredSize === null || controller.desiredSize <= 0) {
          req.pause();
        }
      });
    },

    pull() {
      req.resume();
    },

    cancel(reason) {
      cancelled = true;
      req.destroy(reason);
    }
  });
}

/**
 * @param {{
 *   request: import('http').IncomingMessage;
 *   base: string;
 *   bodySizeLimit?: number;
 * }} options
 *
 * @returns {Promise<Request>}
 */
export async function getRequest({ request, base, bodySizeLimit }) {
  return new Request(base + request.url, {
    duplex: 'half',
    method: request.method,
    headers: /** @type {Record<string, string>} */ (request.headers),
    body: get_raw_body(request, bodySizeLimit)
  });
}

