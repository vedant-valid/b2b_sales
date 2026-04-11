import { logger } from "../lib/logger.js";

export function errorHandler(err, req, res, _next) {
  logger.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || "internal_error",
    message: err.expose ? err.message : "Something went wrong"
  });
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}
