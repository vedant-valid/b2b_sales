import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || "Admin1234!";

const users = [
  { email: "vedantmadne555@gmail.com", name: "Vedant Madne",   role: "ADMIN" },
  { email: "manager@reachout.dev",     name: "Manager Demo",   role: "MANAGER" },
  { email: "vedant.madne66@gmail.com", name: "Vedant (Multi)", role: "MANAGER", password: "manager1234!" },
];

async function main() {
  for (const u of users) {
    const hash = await bcrypt.hash(u.password || DEFAULT_PASSWORD, 10);
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: {},          // don't overwrite if exists
      create: { email: u.email, name: u.name, role: u.role, password: hash },
    });
    console.log(`[seed] ${user.role} ${user.email}  (id: ${user.id})`);
  }

  console.log(`\n[seed] done`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
