import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                username: { label: 'Username', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) return null;

                const user = await prisma.user.findUnique({
                    where: { username: credentials.username },
                });

                if (!user || user.password !== credentials.password) return null;

                return {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    role: user.role,
                };
            },
        }),
    ],
    session: { strategy: 'jwt' },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = user.role;
                token.username = user.username;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.sub;
                session.user.role = token.role;
                session.user.username = token.username;
            }
            return session;
        },
    },
    pages: { signIn: '/' },
    secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
});
