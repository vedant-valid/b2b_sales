import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const doc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    res.json({ brandDoc: doc });
  } catch (e) { next(e); }
});

const saveSchema = z.object({
  content: z.string().min(1),
  fileName: z.string().optional()
});

router.post("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const doc = await prisma.brandDoc.upsert({
      where: { id: "singleton" },
      update: {
        content: parsed.data.content,
        fileName: parsed.data.fileName ?? null,
        uploadedById: req.user.sub
      },
      create: {
        id: "singleton",
        content: parsed.data.content,
        fileName: parsed.data.fileName ?? null,
        uploadedById: req.user.sub
      }
    });
    res.json({ brandDoc: doc });
  } catch (e) { next(e); }
});

export default router;
