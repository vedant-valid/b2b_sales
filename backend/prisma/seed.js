import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD || "Admin1234!";

const users = [
  { email: "vedantmadne555@gmail.com", name: "Vedant Madne", role: "ADMIN" },
  { email: "manager@reachout.dev",      name: "Manager Demo",  role: "MANAGER" },
];

async function main() {
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const u of users) {
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: {},          // don't overwrite if exists
      create: { email: u.email, name: u.name, role: u.role, password: hash },
    });
    console.log(`[seed] ${user.role} ${user.email}  (id: ${user.id})`);
  }

  console.log(`\n[seed] done — password for all seeded users: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
