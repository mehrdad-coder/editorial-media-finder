'use client';

import { SessionProvider } from 'next-auth/react';

export default function SettingsLayout({ children }) {
    return <SessionProvider>{children}</SessionProvider>;
}
