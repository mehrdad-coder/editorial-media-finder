'use client';

import { SessionProvider } from 'next-auth/react';

export default function HomeLayout({ children }) {
    return <SessionProvider>{children}</SessionProvider>;
}
