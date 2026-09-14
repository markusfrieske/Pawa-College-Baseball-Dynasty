import type { ErrorRequestHandler } from "express";

/** Middleware errors may contain SQL, filesystem paths or submitted payloads. */
export const publicErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const candidate = error?.status ?? error?.statusCode;
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  // Do not log the raw URL (invite tokens), parser body (credentials), or full
  // error object. Retain server-failure diagnostics, and only parser metadata
  // for client errors whose messages can embed submitted request contents.
  console.error("Request failed:", {
    method: req.method, status, name: error?.name, code: error?.code,
    ...(status >= 500 ? { message: error?.message } : { type: error?.type }),
  });
  if (res.headersSent) return next(error);

  const messages: Record<number, string> = {
    400: "Invalid request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    413: "Request body too large",
    415: "Unsupported media type",
    429: "Too many requests",
    503: "Service temporarily unavailable",
  };
  res.set("Cache-Control", "no-store");
  res.status(status).json({ message: messages[status] ?? (status >= 500 ? "Internal Server Error" : "Request failed") });
};
