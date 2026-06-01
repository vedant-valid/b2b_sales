import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { listSendingAccounts as realListAccounts } from "../services/instantly.js";

const router = Router();
router.use(requireAuth);

let listAccountsFn = realListAccounts;
export function __setListAccountsImpl(impl) { listAccountsFn = impl; }

// IMPORTANT: /mine must be registered before /:email to avoid Express matching "mine" as an email param
router.get("/mine", async (req, res, next) => {
  try {
    const assignments = await prisma.userSenderAccount.findMany({
      where: { userId: req.user.id },
      include: { sender: true }
    });
    res.json({ senders: assignments.map(a => a.sender) });
  } catch (e) { next(e); }
});

router.post("/sync", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const accounts = await listAccountsFn();
    for (const a of accounts) {
      await prisma.senderAccount.upsert({
        where: { email: a.email },
        update: { status: a.status, syncedAt: new Date() },
        create: { accountId: a.accountId, email: a.email, status: a.status }
      });
    }
    const all = await prisma.senderAccount.findMany({ orderBy: { email: "asc" } });
    res.json({ synced: all.length, senders: all });
  } catch (e) { next(e); }
});

router.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const senders = await prisma.senderAccount.findMany({
      orderBy: { email: "asc" },
      include: {
        assignments: {
          include: { user: { select: { id: true, email: true, name: true } } }
        }
      }
    });
    res.json({ senders });
  } catch (e) { next(e); }
});

const assignSchema = z.object({ userId: z.string() });

router.post("/:email/assign", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
    const sender = await prisma.senderAccount.findUnique({ where: { email: req.params.email } });
    if (!sender) return res.status(404).json({ error: "not_found" });
    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return res.status(404).json({ error: "user_not_found" });
    await prisma.userSenderAccount.upsert({
      where: { userId_senderEmail: { userId: parsed.data.userId, senderEmail: req.params.email } },
      update: {},
      create: { userId: parsed.data.userId, senderEmail: req.params.email }
    });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

router.delete("/:email/assign/:userId", requireRole("ADMIN"), async (req, res, next) => {
  try {
    await prisma.userSenderAccount.deleteMany({
      where: { userId: req.params.userId, senderEmail: req.params.email }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
