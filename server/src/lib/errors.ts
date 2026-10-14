export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Autenticação necessária') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Sem permissão para esta ação') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Registro não encontrado') => new AppError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);
export const tooManyRequests = (message = 'Muitas tentativas. Aguarde alguns minutos.') =>
  new AppError(429, 'too_many_requests', message);
export const serviceUnavailable = (message: string, details?: unknown) =>
  new AppError(503, 'service_unavailable', message, details);
