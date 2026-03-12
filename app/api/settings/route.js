import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// All setting keys we support
const SETTING_KEYS = [
    'wordpress_url', 'wordpress_username', 'wordpress_password',
    'shutterstock_client_id', 'shutterstock_client_secret',
    'getty_api_key',
    'ap_api_key',
    'reuters_client_id', 'reuters_client_secret',
    'llm_provider', // 'openai' | 'anthropic' | 'gemini'
    'openai_api_key',
    'anthropic_api_key',
    'gemini_api_key',
];

// Keys that should be masked when returned
const SENSITIVE_KEYS = [
    'wordpress_password', 'shutterstock_client_secret',
    'getty_api_key', 'ap_api_key',
    'reuters_client_secret',
    'openai_api_key', 'anthropic_api_key', 'gemini_api_key',
];

function maskValue(key, value) {
    if (!value || value.length < 6) return value ? '••••••' : '';
    if (SENSITIVE_KEYS.includes(key)) {
        return value.substring(0, 4) + '••••' + value.slice(-4);
    }
    return value;
}

export async function GET() {
    try {
        const settings = await prisma.setting.findMany();
        const result = {};

        for (const key of SETTING_KEYS) {
            const setting = settings.find(s => s.key === key);
            result[key] = {
                value: setting ? maskValue(key, setting.value) : '',
                isSet: !!(setting && setting.value),
            };
        }

        return NextResponse.json({ settings: result });
    } catch (error) {
        console.error('Settings GET error:', error);
        return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const { settings } = await request.json();

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ error: 'Invalid settings data' }, { status: 400 });
        }

        const updates = [];

        for (const [key, value] of Object.entries(settings)) {
            if (!SETTING_KEYS.includes(key)) continue;

            // Skip if value looks like a masked value (user didn't change it)
            if (typeof value === 'string' && value.includes('••••')) continue;
            // Skip empty strings (don't clear existing values)
            if (value === '') continue;

            updates.push(
                prisma.setting.upsert({
                    where: { key },
                    update: { value },
                    create: { key, value },
                })
            );
        }

        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }

        return NextResponse.json({ success: true, updated: updates.length });
    } catch (error) {
        console.error('Settings PUT error:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
