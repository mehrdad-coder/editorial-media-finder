import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const maxDuration = 300; // Allow up to 5 minutes for sync

export async function POST() {
    const token = process.env.SHUTTERSTOCK_API_TOKEN;
    const clientId = process.env.SHUTTERSTOCK_CLIENT_ID;
    const clientSecret = process.env.SHUTTERSTOCK_CLIENT_SECRET;

    if (!token) {
        return NextResponse.json({ error: 'No API token configured' }, { status: 500 });
    }

    try {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        let page = 1;
        const perPage = 200;
        let totalSynced = 0;
        let totalCount = 0;

        // Phase 1: Fetch all licensed image IDs
        const allLicenses = [];
        do {
            const res = await fetch(
                `https://api.shutterstock.com/v2/images/licenses?per_page=${perPage}&page=${page}&sort=newest`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Licenses API error (page ${page}): ${res.status} - ${errText}`);
            }

            const data = await res.json();
            totalCount = data.total_count || 0;
            const licenses = data.data || [];

            for (const lic of licenses) {
                if (lic.image?.id) {
                    allLicenses.push({
                        id: lic.image.id,
                        licensedAt: lic.download_time || new Date().toISOString(),
                    });
                }
            }

            page++;
        } while (allLicenses.length < totalCount && page <= 200);

        // Deduplicate by image ID (some images may be licensed multiple times)
        const uniqueMap = new Map();
        for (const lic of allLicenses) {
            if (!uniqueMap.has(lic.id)) {
                uniqueMap.set(lic.id, lic);
            }
        }
        const uniqueLicenses = Array.from(uniqueMap.values());

        // Phase 2: Batch fetch image details and upsert to DB
        const DETAIL_BATCH = 50;
        for (let i = 0; i < uniqueLicenses.length; i += DETAIL_BATCH) {
            const batch = uniqueLicenses.slice(i, i + DETAIL_BATCH);
            const ids = batch.map(l => l.id).join(',');

            let details = {};
            try {
                const detailRes = await fetch(
                    `https://api.shutterstock.com/v2/images?id=${ids}&view=minimal`,
                    { headers: { Authorization: `Basic ${auth}` } }
                );
                if (detailRes.ok) {
                    const detailData = await detailRes.json();
                    for (const img of (detailData.data || [])) {
                        details[img.id] = {
                            description: img.description || '',
                            thumbUrl: img.assets?.large_thumb?.url || img.assets?.small_thumb?.url || '',
                            imageUrl: img.assets?.huge_thumb?.url || img.assets?.preview?.url || '',
                            contributor: img.contributor?.id || '',
                        };
                    }
                }
            } catch (err) {
                console.warn(`Detail fetch failed for batch at ${i}:`, err.message);
            }

            // Upsert each image
            for (const lic of batch) {
                const detail = details[lic.id] || {};
                try {
                    await prisma.licensedImage.upsert({
                        where: { id: lic.id },
                        update: {
                            description: detail.description || '',
                            thumbUrl: detail.thumbUrl || '',
                            imageUrl: detail.imageUrl || '',
                            contributor: detail.contributor || '',
                            licensedAt: new Date(lic.licensedAt),
                            syncedAt: new Date(),
                        },
                        create: {
                            id: lic.id,
                            description: detail.description || '',
                            thumbUrl: detail.thumbUrl || '',
                            imageUrl: detail.imageUrl || '',
                            contributor: detail.contributor || '',
                            licensedAt: new Date(lic.licensedAt),
                            syncedAt: new Date(),
                        },
                    });
                    totalSynced++;
                } catch (err) {
                    console.warn(`Upsert failed for image ${lic.id}:`, err.message);
                }
            }
        }

        return NextResponse.json({
            success: true,
            synced: totalSynced,
            total: totalCount,
            unique: uniqueLicenses.length,
        });
    } catch (error) {
        console.error('Sync error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Check sync status
export async function GET() {
    try {
        const count = await prisma.licensedImage.count();
        const latest = await prisma.licensedImage.findFirst({
            orderBy: { syncedAt: 'desc' },
            select: { syncedAt: true },
        });
        return NextResponse.json({
            cachedCount: count,
            lastSync: latest?.syncedAt || null,
        });
    } catch (error) {
        return NextResponse.json({ cachedCount: 0, lastSync: null });
    }
}
