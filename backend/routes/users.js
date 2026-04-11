import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

function safe(u) { const { password, ...rest } = u; return rest; }

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ users: users.map(safe) });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
  name: z.string().optional()
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { email, password, role, name } = parsed.data;
    const user = await prisma.user.create({
      data: { email, password: await hashPassword(password), role, name }
    });
    res.status(201).json({ user: safe(user) });
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "email_taken" });
    next(e);
  }
});

const roleSchema = z.object({ role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) });

router.patch("/:id/role", async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role }
    });
    res.json({ user: safe(user) });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
    next(e);
  }
});

export default router;
