import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query) return NextResponse.json({ results: [], total: 0 });

    const clientId = process.env.SHUTTERSTOCK_CLIENT_ID;
    const clientSecret = process.env.SHUTTERSTOCK_CLIENT_SECRET;
    const apiToken = process.env.SHUTTERSTOCK_API_TOKEN;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ results: generateDemoResults(query, 'shutterstock'), total: 5 });
    }

    try {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const page = Math.floor(offset / limit) + 1;
        const res = await fetch(
            `https://api.shutterstock.com/v2/images/search?query=${encodeURIComponent(query)}&per_page=${limit}&page=${page}&sort=popular&image_type=photo`,
            { headers: { Authorization: `Basic ${auth}` } }
        );

        if (!res.ok) throw new Error(`Shutterstock API error: ${res.status}`);

        const data = await res.json();
        const results = (data.data || []).map((item) => ({
            id: item.id,
            title: item.description || 'Shutterstock Image',
            imageUrl: item.assets?.huge_thumb?.url || item.assets?.preview?.url,
            thumbUrl: item.assets?.large_thumb?.url || item.assets?.small_thumb?.url,
            source: 'shutterstock',
            date: item.added_date || '',
            metadata: JSON.stringify({ contributor: item.contributor?.id }),
            licensed: false, // default, will be updated below
        }));

        // Check license status if we have an OAuth token
        if (apiToken && results.length > 0) {
            const imageIds = results.map(r => r.id);
            const licensedMap = await checkLicenseStatus(imageIds, apiToken);
            for (const result of results) {
                result.licensed = !!licensedMap[result.id];
            }
        }

        return NextResponse.json({
            results,
            total: data.total_count || results.length,
        });
    } catch (error) {
        console.error('Shutterstock search error:', error);
        return NextResponse.json({ results: generateDemoResults(query, 'shutterstock'), total: 5 });
    }
}

async function checkLicenseStatus(imageIds, token) {
    const licensedMap = {};
    const BATCH_SIZE = 5;

    for (let i = 0; i < imageIds.length; i += BATCH_SIZE) {
        const batch = imageIds.slice(i, i + BATCH_SIZE);
        const checks = batch.map(async (imageId) => {
            try {
                const res = await fetch(
                    `https://api.shutterstock.com/v2/images/licenses?image_id=${imageId}&per_page=1`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.ok) {
                    const data = await res.json();
                    licensedMap[imageId] = (data.total_count || 0) > 0;
                }
            } catch {
                // silently skip
            }
        });
        await Promise.all(checks);
    }

    return licensedMap;
}

function generateDemoResults(query, source) {
    return Array.from({ length: 5 }, (_, i) => ({
        id: `ss${i + 1}`,
        title: `${query} — Stock Photo ${i + 1}`,
        imageUrl: `https://picsum.photos/seed/ss${query}${i}/400/267`,
        thumbUrl: `https://picsum.photos/seed/ss${query}${i}/400/267`,
        source,
        date: new Date().toLocaleDateString(),
        licensed: false,
    }));
}
