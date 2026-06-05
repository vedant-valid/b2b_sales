import { logger } from "../lib/logger.js";

// Map Prisma error codes to HTTP status + readable message
const PRISMA_MAP = {
  P2002: [409, "unique_constraint", (e) => `Duplicate value on: ${JSON.stringify(e.meta?.target)}`],
  P2003: [400, "foreign_key_constraint", (e) => `FK violation on field: ${e.meta?.field_name ?? "(unknown)"}. If you recently reset the DB, sign out and sign back in.`],
  P2025: [404, "not_found", () => "Record not found"],
};

export function errorHandler(err, req, res, _next) {
  const prismaEntry = PRISMA_MAP[err.code];

  if (prismaEntry) {
    const [status, code, msg] = prismaEntry;
    logger.error(`[${req.method} ${req.path}] Prisma ${err.code}: ${msg(err)}`);
    return res.status(status).json({ error: code, message: msg(err) });
  }

  // Translate Gemini/Google API transient errors to a friendly message
  if (
    err.status === 429 || err.status === 503
    || err.message?.includes("429") || err.message?.includes("503")
    || err.message?.toLowerCase().includes("resource has been exhausted")
    || err.message?.toLowerCase().includes("service unavailable")
    || err.message?.toLowerCase().includes("overloaded")
  ) {
    return res.status(503).json({ error: "ai_unavailable", message: "AI service is temporarily busy — please try again in a moment." });
  }

  // Log full stack for unexpected errors
  logger.error(`[${req.method} ${req.path}] ${err.stack || err.message || err}`);

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
