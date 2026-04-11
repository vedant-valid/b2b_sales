import CredentialsProvider from "next-auth/providers/credentials";
import { apiFetch } from "./api.js";

export const authOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const { token, user } = await apiFetch("/api/auth/login", {
            method: "POST",
            body: { email: credentials.email, password: credentials.password }
          });
          return { id: user.id, email: user.email, name: user.name, role: user.role, backendToken: token };
        } catch {
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.backendToken = user.backendToken;
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.backendToken = token.backendToken;
      return session;
    }
  },
  pages: { signIn: "/login" }
};

export function hasRole(session, ...roles) {
  return session?.user && roles.includes(session.user.role);
}
