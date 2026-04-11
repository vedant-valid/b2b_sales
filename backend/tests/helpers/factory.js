import { prisma } from "../../lib/prisma.js";
import { hashPassword, signToken } from "../../lib/auth.js";

export async function createUser({ email = `u${Date.now()}@test.com`, role = "VIEWER", password = "secret123" } = {}) {
  const user = await prisma.user.create({
    data: { email, password: await hashPassword(password), role }
  });
  return { user, token: signToken({ sub: user.id, role: user.role }) };
}

export function authHeader(token) { return { Authorization: `Bearer ${token}` }; }
