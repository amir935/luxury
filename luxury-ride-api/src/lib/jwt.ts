// lib/jwt.ts
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET!;

export function signToken(user: {
  id: number;
  role: "RIDER" | "DRIVER" | "ADMIN" | "SUPER_ADMIN";
  tokenVersion?: number;
}) {
  return jwt.sign(
    { userId: user.id, role: user.role, tv: user.tokenVersion ?? 0 },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken<T = any>(token: string): T {
  return jwt.verify(token, JWT_SECRET) as T;
}
