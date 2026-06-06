import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const SEEDED_EMAILS = ["vedantmadne555@gmail.com", "manager@reachout.dev", "vedant.madne66@gmail.com"];

const SEEDED_USERS = [
  { email: "vedantmadne555@gmail.com", name: "Vedant Madne",   role: "ADMIN" },
  { email: "manager@reachout.dev",     name: "Manager Demo",   role: "MANAGER" },
  { email: "vedant.madne66@gmail.com", name: "Vedant (Multi)", role: "MANAGER" },
];

async function ensureSeededUsers() {
  const hash = await bcrypt.hash("Admin1234!", 10);
  for (const u of SEEDED_USERS) {
    await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: { ...u, password: hash },
    });
  }
}

export async function resetDb() {
  await prisma.reply.deleteMany();
  await prisma.email.deleteMany();
  await prisma.leadSelection.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.brandDoc.deleteMany();
  await prisma.userSenderAccount.deleteMany();
  await prisma.senderAccount.deleteMany();
  await prisma.user.deleteMany({ where: { email: { notIn: SEEDED_EMAILS } } });
}

// Guarantee seeded users exist on every test suite — safe on fresh or wiped test DB
beforeAll(ensureSeededUsers);
afterAll(async () => { await prisma.$disconnect(); });
