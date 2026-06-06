import { verifyToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
  // Verify the user still exists — catches stale JWTs after DB resets so the
  // frontend auto-signs-out instead of hitting FK errors deep in route handlers
  try {
    const exists = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true } });
    if (!exists) return res.status(401).json({ error: "user_not_found" });
    next();
  } catch (e) {
    next(e);
  }
}
