import type { Response } from "express";

export function clearSessionCookie(res: Response): void {
  res.clearCookie("connect.sid", {
    path: "/", httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
