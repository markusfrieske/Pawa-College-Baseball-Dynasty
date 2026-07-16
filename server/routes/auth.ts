/**
 * Auth, user preferences, and presence routes.
 */

import type { Express } from "express";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import {
  requireAuth,
  SALT_ROUNDS,
  authSchema,
  presenceMap,
  getOnlineCount,
} from "../route-helpers";
import { verifyUnsubToken } from "../digestEmail";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

const guestRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Guest creation limit reached. Please try again later." },
});

export function registerAuthRoutes(app: Express): void {
  // ── PRESENCE (public, no auth required) ─────────────────────────────────
  app.post("/api/presence/heartbeat", (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.slice(0, 64) : null;
    if (!token) return res.status(400).json({ message: "token required" });
    presenceMap.set(token, Date.now());
    res.json({ ok: true, online: getOnlineCount() });
  });

  app.get("/api/presence/online-count", (_req, res) => {
    res.json({ online: getOnlineCount() });
  });

  // ── AUTH ─────────────────────────────────────────────────────────────────
  app.post("/api/auth/register", authRateLimit, async (req, res) => {
    try {
      const result = authSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password (min 6 characters)" });
      }
      const { email, password } = result.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await storage.createUser({ email, password: hashedPassword });
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) return reject(err);
          req.session.userId = user.id;
          resolve();
        });
      });
      res.json({ id: user.id, email: user.email });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimit, async (req, res) => {
    try {
      const result = authSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid email or password" });
      }
      const { email, password } = result.data;
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) return reject(err);
          req.session.userId = user.id;
          resolve();
        });
      });
      res.json({ id: user.id, email: user.email });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.isGuest) {
      res.json({ id: req.session.userId || "guest", email: "guest@guest.com", emailOptOut: false });
    } else if (req.session.userId) {
      storage.getUser(req.session.userId).then((user) => {
        if (user) {
          res.json({ id: user.id, email: user.email, emailOptOut: user.emailOptOut ?? false });
        } else {
          res.status(401).json({ message: "Not authenticated" });
        }
      });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.post("/api/auth/guest", guestRateLimit, async (req, res) => {
    try {
      const guestId = `guest-${randomUUID()}`;
      const guestEmail = `guest-${randomUUID()}@guest.local`;
      await storage.createUser({
        id: guestId,
        email: guestEmail,
        password: randomUUID(),
      });
      req.session.isGuest = true;
      req.session.userId = guestId;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create guest session" });
        }
        res.json({ id: guestId, email: guestEmail });
      });
    } catch (error) {
      console.error("Guest creation error:", error);
      res.status(500).json({ message: "Failed to create guest session" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  // ── USER PREFERENCES ──────────────────────────────────────────────────────
  app.patch("/api/users/email-preferences", requireAuth, async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      const schema = z.object({ emailOptOut: z.boolean() });
      const result = schema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ message: "emailOptOut (boolean) is required" });
      const updated = await storage.updateUser(req.session.userId, { emailOptOut: result.data.emailOptOut });
      res.json({ emailOptOut: updated?.emailOptOut ?? result.data.emailOptOut });
    } catch (error) {
      console.error("Failed to update email preferences:", error);
      res.status(500).json({ message: "Failed to update email preferences" });
    }
  });

  app.get("/api/users/unsubscribe", async (req, res) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) return res.status(400).send("Missing token");
      const userId = verifyUnsubToken(token);
      if (!userId) return res.status(400).send("Invalid or expired unsubscribe link");
      await storage.updateUser(userId, { emailOptOut: true });
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Unsubscribed</title></head>
<body style="background:#0a1a0a;color:#d4d4aa;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center;max-width:400px;padding:40px">
  <div style="font-size:32px;color:#FFD700;margin-bottom:16px;">⚾</div>
  <h1 style="color:#FFD700;font-size:18px;margin:0 0 12px">Unsubscribed</h1>
  <p style="color:#8aaa8a;font-size:14px;margin:0 0 20px">You've been unsubscribed from weekly digest emails. You can re-enable them anytime from your coach profile.</p>
  <a href="/" style="color:#FFD700;font-size:12px;text-decoration:none;border:1px solid #FFD700;padding:8px 20px;border-radius:4px">Return to Dynasty</a>
</div></body></html>`);
    } catch (error) {
      console.error("Failed to process unsubscribe:", error);
      res.status(500).send("Failed to process unsubscribe");
    }
  });
}
