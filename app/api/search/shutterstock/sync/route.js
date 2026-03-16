import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const maxDuration = 300;

// Helper: delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: fetch with retry on 429
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
            const waitTime = Math.max(retryAfter * 1000, 2000) * (attempt + 1);
            console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}...`);
            await delay(waitTime);
            continue;
        }
        return res;
    }
    throw new Error('Max retries exceeded due to rate limiting');
}

export async function POST(request) {
    const { searchParams } = new URL(request.url);
    const startPage = parseInt(searchParams.get('startPage') || '1', 10);
    const maxPages = parseInt(searchParams.get('maxPages') || '30', 10);

    const token = process.env.SHUTTERSTOCK_API_TOKEN;
    const clientId = process.env.SHUTTERSTOCK_CLIENT_ID;
    const clientSecret = process.env.SHUTTERSTOCK_CLIENT_SECRET;

    if (!token) {
        return NextResponse.json({ error: 'No API token configured' }, { status: 500 });
    }

    try {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        let page = startPage;
        const perPage = 200;
        let totalSynced = 0;
        let totalCount = 0;
        let pagesProcessed = 0;

        // Phase 1: Fetch licensed image IDs (with rate limit handling)
        const allLicenses = [];
        do {
            const res = await fetchWithRetry(
                `https://api.shutterstock.com/v2/images/licenses?per_page=${perPage}&page=${page}&sort=newest`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!res.ok) {
                const errText = await res.text();
                // Return partial results if we've synced some
                if (allLicenses.length > 0) break;
                throw new Error(`Licenses API error (page ${page}): ${res.status}`);
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
            pagesProcessed++;

            // Small delay between pages to avoid rate limiting
            await delay(200);

        } while (allLicenses.length < totalCount && pagesProcessed < maxPages);

        // Deduplicate
        const uniqueMap = new Map();
        for (const lic of allLicenses) {
            if (!uniqueMap.has(lic.id)) {
                uniqueMap.set(lic.id, lic);
            }
        }
        const uniqueLicenses = Array.from(uniqueMap.values());

        // Phase 2: Batch fetch image details and upsert to DB
        const DETAIL_BATCH = 40;
        for (let i = 0; i < uniqueLicenses.length; i += DETAIL_BATCH) {
            const batch = uniqueLicenses.slice(i, i + DETAIL_BATCH);
            const ids = batch.map(l => l.id).join(',');

            let details = {};
            try {
                const detailRes = await fetchWithRetry(
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

            // Delay between detail batches
            await delay(300);
        }

        const nextPage = page;
        const hasMore = allLicenses.length < totalCount && pagesProcessed >= maxPages;

        return NextResponse.json({
            success: true,
            synced: totalSynced,
            total: totalCount,
            unique: uniqueLicenses.length,
            pagesProcessed,
            nextPage: hasMore ? nextPage : null,
            hasMore,
            message: hasMore
                ? `Synced ${totalSynced} images (pages ${startPage}-${nextPage - 1}). Call again with ?startPage=${nextPage} to continue.`
                : `Sync complete! ${totalSynced} images synced.`,
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
