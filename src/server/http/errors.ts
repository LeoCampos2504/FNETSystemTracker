export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_AUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}

export function notAuthenticated(message = "Authentication required"): ApiError {
  return new ApiError(401, "NOT_AUTHENTICATED", message);
}

export function forbidden(message = "Not allowed to access this resource"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found"): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, "CONFLICT", message, details);
}
