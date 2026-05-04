import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { verifyPassword, signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const token = signToken({ sub: user.id, role: user.role });
    const { password: _p, ...safe } = user;
    res.json({ token, user: safe });
  } catch (e) { next(e); }
});

router.post("/logout", (_req, res) => res.json({ ok: true }));

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ error: "not_found" });
    const { password: _p, ...safe } = user;
    res.json({ user: safe });
  } catch (e) { next(e); }
});

export default router;
