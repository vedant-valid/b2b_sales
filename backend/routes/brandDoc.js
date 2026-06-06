import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { extractTextFromBuffer, extractBrandFields as realExtractBrandFields } from "../services/docExtract.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

let extractBrandFieldsFn = realExtractBrandFields;
export function __setExtractBrandFieldsImpl(impl) { extractBrandFieldsFn = impl; }

router.get("/", async (req, res, next) => {
  try {
    const doc = await prisma.brandDoc.findUnique({ where: { id: "singleton" } });
    res.json({ brandDoc: doc });
  } catch (e) { next(e); }
});

const saveSchema = z.object({
  tone:           z.string().optional().nullable(),
  campaignGoals:  z.string().optional().nullable(),
  targetPersonas: z.string().optional().nullable(),
  proofPoints:    z.string().optional().nullable(),
  bannedWords:    z.string().optional().nullable(),
  fileName:       z.string().optional().nullable()
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const { tone, campaignGoals, targetPersonas, proofPoints, bannedWords, fileName } = parsed.data;
    const doc = await prisma.brandDoc.upsert({
      where: { id: "singleton" },
      update: { tone: tone ?? null, campaignGoals: campaignGoals ?? null, targetPersonas: targetPersonas ?? null, proofPoints: proofPoints ?? null, bannedWords: bannedWords ?? null, fileName: fileName ?? null, uploadedById: req.user.sub },
      create: { id: "singleton", tone: tone ?? null, campaignGoals: campaignGoals ?? null, targetPersonas: targetPersonas ?? null, proofPoints: proofPoints ?? null, bannedWords: bannedWords ?? null, fileName: fileName ?? null, uploadedById: req.user.sub }
    });
    res.json({ brandDoc: doc });
  } catch (e) { next(e); }
});

const uploadSingle = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: "no_file" });
    next();
  });
};

router.post("/extract", uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const text = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
    const fields = await extractBrandFieldsFn(text);
    res.json({ fields, fileName: req.file.originalname });
  } catch (e) {
    if (e.message === "unsupported_file_type") return res.status(400).json({ error: "unsupported_file_type" });
    next(e);
  }
});

export default router;
