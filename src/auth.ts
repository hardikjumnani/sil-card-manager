import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { onLogin } from "@/lib/users";

function domainAllowed(email: string) {
  const list = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(email.split("@")[1]?.toLowerCase() ?? "");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      return !!user.email && domainAllowed(user.email);
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.uid = await onLogin(user.email, user.name ?? null, user.image ?? null);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
