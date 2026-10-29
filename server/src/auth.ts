import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

export type TokenPayload = { id: number; username: string; full_name: string; role?: string };
export type AuthedRequest = Request & { user?: TokenPayload };

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function decodeToken(req: Request): TokenPayload | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const decoded = decodeToken(req);
  if (!decoded) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = decoded;
  next();
}
