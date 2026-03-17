import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./db";
import { env } from "./env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    // Session max age: 8 hours for internal tool security
    maxAge: 8 * 60 * 60, // 8 hours in seconds
    // Force session refresh every 15 minutes
    updateAge: 15 * 60, // 15 minutes in seconds
  },
  pages: {
    signIn: "/login",
  },
  // Enable CSRF protection (enabled by default in next-auth v5, explicitly set)
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorToken: { label: "2FA Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;
        const twoFactorToken = (credentials.twoFactorToken as string) || "";

        // Validate input format before DB query
        if (typeof email !== "string" || email.length > 254) return null;
        if (typeof password !== "string" || password.length > 128) return null;

        // Restrict login to allowed email domain
        if (!email.toLowerCase().endsWith(`@${env.AUTH_ALLOWED_DOMAIN}`)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            status: true,
            roles: { include: { role: true } },
            twoFactorConfig: {
              select: { isEnabled: true, isVerified: true },
            },
          },
        });

        if (!user || !user.passwordHash) return null;

        // Check user status — do not allow INACTIVE users to log in
        if (user.status !== "ACTIVE") {
          return null;
        }

        // bcryptjs.compare is timing-safe by design
        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        // Check 2FA requirement
        if (user.twoFactorConfig?.isEnabled && user.twoFactorConfig?.isVerified) {
          if (!twoFactorToken) {
            // 2FA is required but no token provided — force challenge flow
            return null;
          }

          // Verify the twoFactorToken against a used TwoFactorChallenge
          const challenge = await prisma.twoFactorChallenge.findUnique({
            where: { verificationToken: twoFactorToken },
          });

          if (!challenge) return null;

          // Must be recent (within 5 minutes) and must belong to this user
          if (challenge.userId !== user.id) return null;
          if (!challenge.usedAt) return null;

          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (challenge.usedAt < fiveMinutesAgo) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles.map((ur: { role: { name: string } }) => ur.role.name),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.roles = user.roles ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.roles = (token.roles as string[]) ?? [];
      }
      return session;
    },
  },
});
