import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express, distPath = path.resolve(__dirname, "public")) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // These namespaces belong to server routes, even when no route matched.
  // Never let an API/object request accidentally succeed with the SPA document.
  app.use((req, _res, next) => {
    let pathname: string;
    try {
      pathname = path.posix.normalize(decodeURIComponent(req.path).replaceAll("\\", "/"));
    } catch {
      return next(Object.assign(new Error("Invalid request path"), { status: 400 }));
    }
    if (!["GET", "HEAD"].includes(req.method) || /^\/(?:api|objects)(?:\/|$)/i.test(pathname)) {
      return next(Object.assign(new Error("Not found"), { status: 404 }));
    }
    next();
  });

  app.use(express.static(distPath));

  // Only page navigation can use the SPA fallback. Missing media must remain
  // visible as a failed request rather than a misleading HTML 200 response.
  app.use((req, res, next) => {
    const pathname = path.posix.normalize(decodeURIComponent(req.path).replaceAll("\\", "/"));
    if (path.posix.extname(pathname) || /^\/(?:assets|images|fonts|music|screenshots)(?:\/|$)/i.test(pathname) || !req.accepts("html")) {
      return next(Object.assign(new Error("Not found"), { status: 404 }));
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
