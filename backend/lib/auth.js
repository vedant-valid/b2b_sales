import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload, opts = {}) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d", ...opts });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
