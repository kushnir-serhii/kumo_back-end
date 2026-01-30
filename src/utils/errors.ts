// Error type for type checking
export interface HttpError extends Error {
  statusCode: number;
  isHttpError: true;
}

// Simple function - just use this everywhere
export function httpError(message: string, statusCode = 400): never {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.isHttpError = true;
  throw error;
}
