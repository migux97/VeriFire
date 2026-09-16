import { timingSafeEqual } from 'node:crypto';
import { config } from './config';
import { HttpError } from './errors';

const MAX_BODY_BYTES = 64 * 1024;

export type JsonBody = Record<string, unknown>;

export const json = (body: unknown, status = 200) => Response.json(body, { status });

// Errors meant for the client keep their status and message; anything else is logged and answered generically.
export const errorResponse = (error: unknown, fallbackStatus: number, fallbackMessage: string, logLabel: string) => {
  if (error instanceof HttpError) {
    return json({ error: error.message, ...(error.retryable ? { retryable: true } : {}) }, error.status);
  }
  console.error(logLabel, error);
  return json({ error: fallbackMessage }, fallbackStatus);
};

export const readJson = async (request: Request): Promise<JsonBody> => {
  const tooLarge = () => new HttpError(413, 'El cuerpo de la solicitud es demasiado grande.');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw tooLarge();
  if (!request.body) return {};

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  if (!size) return {};

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'El cuerpo de la solicitud debe ser un objeto JSON.');
  }
  return body as JsonBody;
};

// A field of a JSON body as text, the way a form would send it.
export const textField = (body: JsonBody, key: string): string => {
  const value = body[key];
  return value === undefined || value === null ? '' : String(value);
};

export const isAdminRequest = (request: Request) => {
  if (!config.adminApiToken) return false;
  const provided = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(config.adminApiToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

// For endpoints where an unreadable body must answer 400 instead of the fallback of the operation that follows.
export const readJsonBody = async (request: Request, logLabel: string) => {
  try {
    return await readJson(request);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(logLabel, error);
    throw new HttpError(400, 'No se pudo leer la solicitud.');
  }
};
