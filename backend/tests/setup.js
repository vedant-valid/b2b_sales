import { prisma } from "../lib/prisma.js";

export async function resetDb() {
  await prisma.reply.deleteMany();
  await prisma.email.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.brandDoc.deleteMany();
  await prisma.user.deleteMany();
}

afterAll(async () => { await prisma.$disconnect(); });
