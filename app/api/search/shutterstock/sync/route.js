import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const maxDuration = 300;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            const waitTime = 3000 * (attempt + 1);
            await delay(waitTime);
            continue;
        }
        return res;
    }
    return null; // Return null instead of throwing
}

export async function POST(request) {
    const { searchParams } = new URL(request.url);
    const startPage = parseInt(searchParams.get('startPage') || '1', 10);
    const maxPages = parseInt(searchParams.get('maxPages') || '15', 10);

    const token = process.env.SHUTTERSTOCK_API_TOKEN;
    const clientId = process.env.SHUTTERSTOCK_CLIENT_ID;
    const clientSecret = process.env.SHUTTERSTOCK_CLIENT_SECRET;

    if (!token) {
        return NextResponse.json({ error: 'No API token configured' }, { status: 500 });
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    let page = startPage;
    const perPage = 200;
    let totalSynced = 0;
    let totalCount = 0;
    let pagesProcessed = 0;
    let lastError = null;

    try {
        // Process one page at a time: fetch licenses → get details → save to DB
        while (pagesProcessed < maxPages) {
            // Step 1: Fetch one page of licenses
            const res = await fetchWithRetry(
                `https://api.shutterstock.com/v2/images/licenses?per_page=${perPage}&page=${page}&sort=newest`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!res || !res.ok) {
                lastError = `Failed to fetch page ${page}`;
                break;
            }

            const data = await res.json();
            totalCount = data.total_count || 0;
            const licenses = data.data || [];

            if (licenses.length === 0) break;

            // Step 2: Collect image IDs from this page
            const pageLicenses = [];
            for (const lic of licenses) {
                if (lic.image?.id) {
                    pageLicenses.push({
                        id: lic.image.id,
                        licensedAt: lic.download_time || new Date().toISOString(),
                    });
                }
            }

            // Deduplicate within page
            const seen = new Set();
            const uniquePage = pageLicenses.filter(l => {
                if (seen.has(l.id)) return false;
                seen.add(l.id);
                return true;
            });

            // Step 3: Batch fetch image details (up to 50 at a time)
            const BATCH = 50;
            for (let i = 0; i < uniquePage.length; i += BATCH) {
                const batch = uniquePage.slice(i, i + BATCH);
                const ids = batch.map(l => l.id).join(',');

                let details = {};
                const detailRes = await fetchWithRetry(
                    `https://api.shutterstock.com/v2/images?id=${ids}&view=minimal`,
                    { headers: { Authorization: `Basic ${auth}` } }
                );

                if (detailRes && detailRes.ok) {
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

                // Step 4: Save to DB immediately
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
                        // Skip individual failures
                    }
                }

                // Rate limit: ~700ms between API calls
                await delay(700);
            }

            page++;
            pagesProcessed++;

            // Check if we've fetched everything
            if (page * perPage >= totalCount + perPage) break;

            // Delay between pages
            await delay(500);
        }
    } catch (error) {
        lastError = error.message;
    }

    const hasMore = (page - 1) * perPage < totalCount;

    return NextResponse.json({
        success: true,
        synced: totalSynced,
        total: totalCount,
        pagesProcessed,
        nextPage: hasMore ? page : null,
        hasMore,
        error: lastError,
        message: hasMore
            ? `Synced ${totalSynced} images (pages ${startPage}-${page - 1}). Call again with ?startPage=${page} to continue.`
            : `Sync complete! ${totalSynced} images synced.`,
    });
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
