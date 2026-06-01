import { prisma } from "../lib/prisma.js";

const SEEDED_EMAILS = ["vedantmadne555@gmail.com", "manager@reachout.dev"];

export async function resetDb() {
  await prisma.reply.deleteMany();
  await prisma.email.deleteMany();
  await prisma.leadSelection.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.brandDoc.deleteMany();
  await prisma.userSenderAccount.deleteMany();
  await prisma.senderAccount.deleteMany();
  // preserve seeded admin/manager accounts so dev login still works after tests
  await prisma.user.deleteMany({ where: { email: { notIn: SEEDED_EMAILS } } });
}

afterAll(async () => { await prisma.$disconnect(); });
