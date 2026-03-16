import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query) return NextResponse.json({ results: [], total: 0 });

    const clientId = process.env.SHUTTERSTOCK_CLIENT_ID;
    const clientSecret = process.env.SHUTTERSTOCK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ results: [], total: 0 });
    }

    try {
        // Get ALL licensed image IDs from cache
        const allLicensedIds = await prisma.licensedImage.findMany({
            select: { id: true },
        });
        const licensedSet = new Set(allLicensedIds.map(img => img.id));

        if (licensedSet.size === 0) {
            return NextResponse.json({
                results: [],
                total: 0,
                message: 'No licensed images synced yet. Please trigger a sync first.',
            });
        }

        // Search Shutterstock normally but with more results, then filter
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const allMatched = [];
        let apiPage = 1;
        const maxApiPages = 10; // Search up to 10 pages to find licensed results
        let totalApiResults = 0;

        while (allMatched.length < offset + limit && apiPage <= maxApiPages) {
            const res = await fetch(
                `https://api.shutterstock.com/v2/images/search?query=${encodeURIComponent(query)}&per_page=100&page=${apiPage}&sort=popular&image_type=photo`,
                { headers: { Authorization: `Basic ${auth}` } }
            );

            if (!res.ok) break;

            const data = await res.json();
            totalApiResults = data.total_count || 0;
            const images = data.data || [];

            if (images.length === 0) break;

            // Filter to only licensed images
            for (const item of images) {
                if (licensedSet.has(item.id)) {
                    allMatched.push({
                        id: item.id,
                        title: item.description || 'Licensed Image',
                        imageUrl: item.assets?.huge_thumb?.url || item.assets?.preview?.url,
                        thumbUrl: item.assets?.large_thumb?.url || item.assets?.small_thumb?.url,
                        source: 'my-library',
                        date: item.added_date || '',
                        licensed: true,
                        metadata: JSON.stringify({ contributor: item.contributor?.id }),
                    });
                }
            }

            apiPage++;
        }

        // Apply pagination
        const paged = allMatched.slice(offset, offset + limit);

        return NextResponse.json({
            results: paged,
            total: allMatched.length,
        });
    } catch (error) {
        console.error('My Library search error:', error);
        return NextResponse.json({ results: [], total: 0 });
    }
}
