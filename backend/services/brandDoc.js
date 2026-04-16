import { prisma } from "../lib/prisma.js";

export async function getBrandDoc() {
  return prisma.brandDoc.findUnique({ where: { id: "singleton" } });
}
