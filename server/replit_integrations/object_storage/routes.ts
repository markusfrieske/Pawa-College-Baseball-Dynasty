import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { requireAuth, canAccessGameReportImage, hasCommissionerAccess } from "../../route-helpers";
import { storage } from "../../storage";

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/*objectPath", requireAuth, async (req, res) => {
    try {
      const objectPath = req.path;

      // Check if it's a game-report screenshot first.
      const image = await storage.getGameReportImageByObjectPath(objectPath);
      if (image) {
        const allowed = await canAccessGameReportImage(image.leagueId, image.gameId, req.session.userId);
        if (!allowed) return res.status(403).json({ error: "Forbidden" });
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        return await objectStorageService.downloadObject(objectFile, res);
      }

      // Check if it's a news post image — any league member may view.
      const newsPost = await storage.getDynastyNewsByImageUrl(objectPath);
      if (newsPost) {
        const league = await storage.getLeague(newsPost.leagueId);
        const isComm = league ? hasCommissionerAccess(league, req.session.userId) : false;
        if (!isComm) {
          const coaches = await storage.getCoachesByLeague(newsPost.leagueId);
          const isMember = coaches.some((c: any) => c.userId === req.session.userId);
          if (!isMember) return res.status(403).json({ error: "Forbidden" });
        }
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        return await objectStorageService.downloadObject(objectFile, res);
      }

      return res.status(404).json({ error: "Object not found" });
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

