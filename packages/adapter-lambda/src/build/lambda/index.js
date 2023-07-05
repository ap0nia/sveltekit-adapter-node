import 'SHIMS';
import { Server } from 'SERVER';
import { manifest } from 'MANIFEST';
import { prerenderedMappings } from 'PRERENDERED'

import { readFileSync } from 'node:fs'
import { methodsForPrerenderedFiles } from '../http/methods.js';
import { isBinaryContentType } from '../http/binaryContentTypes.js';
import { FORWARDED_HOST_HEADER, PRERENDERED_FILE_HEADERS } from '../http/headers.js'

const server = new Server(manifest);

const initialized = server.init({ env: process.env });

/** 
 * API Gateway / Lambda handler.
 *
 * @param {import('aws-lambda').APIGatewayProxyEvent | import('aws-lambda').APIGatewayProxyEventV2} event
 * @param {import('aws-lambda').Context} context 
 * @param {import('aws-lambda').Callback} callback
 *
 * @return {Promise<import('aws-lambda').APIGatewayProxyResult | import('aws-lambda').APIGatewayProxyResultV2>}
 */
export async function handler(event, context, callback) {
  // debug("event", event);

  await initialized

  const internalEvent = isAPIGatewayProxyEventV2(event)
    ? convertAPIGatewayProxyEventV2ToRequest(event)
    : convertAPIGatewayProxyEventV1ToRequest(event)

  const prerenderedFile = prerenderedMappings.get(internalEvent.path);

  /**
   * Pre-rendered routes are handled by both Lambda and Lambda@Edge.
   * Lambda will serve the actual file contents; Lambda@Edge will re-write the URL to try to hit cache.
   */
  if (prerenderedFile) {
    return {
      statusCode: 200,
      headers: PRERENDERED_FILE_HEADERS,
      body: readFileSync(prerenderedFile, "utf8"),
      isBase64Encoded: false,
    }
  }

  // Set correct host header
  if (internalEvent.headers[FORWARDED_HOST_HEADER]) {
    internalEvent.headers.host = internalEvent.headers[FORWARDED_HOST_HEADER];
  }

  const requestUrl = `https://${internalEvent.headers.host}${internalEvent.url}`

  /**
   * @type RequestInit
   */
  const requestInit = {
    method: internalEvent.method,
    headers: internalEvent.headers,
    body: methodsForPrerenderedFiles.has(internalEvent.method) ? undefined : internalEvent.body,
  }

  // debug("request", requestUrl, requestInit);

  const request = new Request(requestUrl, requestInit)

  const response = await server.respond(request, {
    platform: {
      event,
      context,
      callback,
    },
    getClientAddress: () => internalEvent.remoteAddress,
  })

  // debug("response", response);

  return isAPIGatewayProxyEventV2(event)
    ? convertResponseToAPIGatewayProxyResultV2(response)
    : convertResponseToAPIGatewayProxyResultV1(response)
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEvent | import('aws-lambda').APIGatewayProxyEventV2} event
 * @returns {event is import('aws-lambda').APIGatewayProxyEventV2}
 */
function isAPIGatewayProxyEventV2(event) {
  return 'version' in event;
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 * @return {import('.').InternalEvent}
 */
function convertAPIGatewayProxyEventV1ToRequest(event) {
  return {
    method: event.httpMethod,
    path: event.path,
    url: event.path + normalizeAPIGatewayProxyEventQueryParams(event),
    body: Buffer.from(event.body ?? "", event.isBase64Encoded ? "base64" : "utf8"),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
    remoteAddress: event.requestContext.identity.sourceIp
  }
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEventV2} event
 * @return {import('.').InternalEvent}
 */
function convertAPIGatewayProxyEventV2ToRequest(event) {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    url: event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ''),
    body: normalizeAPIGatewayProxyEventV2Body(event),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
    remoteAddress: event.requestContext.http.sourceIp
  }
}

/**
 * @param {Response} response
 * @return {Promise<import('aws-lambda').APIGatewayProxyResult>}
 */
async function convertResponseToAPIGatewayProxyResultV1(response) {
  const isBase64Encoded = isBinaryContentType(response.headers.get("content-type"));

  /**
   * @type {import('aws-lambda').APIGatewayProxyResult}
   */
  const result = {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    multiValueHeaders: {},
    body: isBase64Encoded
      ? Buffer.from(await response.arrayBuffer()).toString("base64")
      : await response.text(),
    isBase64Encoded,
  }

  // debug(response);

  return result
}

/**
 * @param {Response} response
 * @return {Promise<import('aws-lambda').APIGatewayProxyResultV2>}
 */
async function convertResponseToAPIGatewayProxyResultV2(response) {
  const isBase64Encoded = isBinaryContentType(response.headers.get("content-type"));

  /**
   * @type {import('aws-lambda').APIGatewayProxyResultV2}
   */
  const result = {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    cookies: response.headers.get("set-cookie")?.split(", ") ?? [],
    body: isBase64Encoded
      ? Buffer.from(await response.arrayBuffer()).toString("base64")
      : await response.text(),
    isBase64Encoded,
  }

  // debug(response);

  return result
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEventV2} event
 */
function normalizeAPIGatewayProxyEventV2Body(event) {
  if (Buffer.isBuffer(event.body)) {
    return event.body;
  } else if (typeof event.body === "string") {
    return Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8");
  } else if (typeof event.body === "object") {
    return Buffer.from(JSON.stringify(event.body));
  }
  return Buffer.from("", "utf8");
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 */
function normalizeAPIGatewayProxyEventQueryParams(event) {
  const params = new URLSearchParams();

  if (event.multiValueQueryStringParameters) {
    for (const [key, value] of Object.entries(event.multiValueQueryStringParameters)) {
      if (value !== undefined) {
        for (const v of value) {
          params.append(key, v);
        }
      }
    }
  }

  if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) {
        params.append(key, value);
      }
    }
  }

  const value = params.toString();

  return value ? `?${value}` : "";
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEvent | import('aws-lambda').APIGatewayProxyEventV2} event
 */
function normalizeAPIGatewayProxyEventHeaders(event) {
  /**
   * @type Record<string, string>
   */
  const headers = {};

  if ('multiValueHeaders' in event && event.multiValueHeaders) {
    for (const [key, values] of Object.entries(event.multiValueHeaders)) {
      if (values) {
        headers[key.toLowerCase()] = values.join(",");
      }
    }
  }

  for (const [key, value] of Object.entries(event.headers)) {
    if (value) {
      headers[key.toLowerCase()] = value;
    }
  }

  return headers;
}

