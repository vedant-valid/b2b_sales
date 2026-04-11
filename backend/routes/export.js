import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { generateLeadsXlsx } from "../services/export.js";

const router = Router();
router.use(requireAuth);

router.get("/leads", async (req, res, next) => {
  try {
    const buffer = await generateLeadsXlsx(req.query);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) { next(e); }
});

export default router;
