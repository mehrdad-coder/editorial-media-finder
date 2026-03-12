import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query) return NextResponse.json({ results: [], total: 0 });

    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ results: [], total: 0, error: 'Serper API key not configured' });
    }

    // Convert offset to page number (Serper uses 1-based pages)
    const page = Math.floor(offset / limit) + 1;

    try {
        const res = await fetch('https://google.serper.dev/images', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: `site:theepochtimes.com ${query}`,
                page,
                num: limit,
            }),
        });

        if (!res.ok) throw new Error(`Serper API error: ${res.status}`);

        const data = await res.json();
        const images = data.images || [];

        const results = images.map((item, index) => ({
            id: `et-web-${page}-${index}`,
            title: item.title || 'Epoch Times Published Image',
            imageUrl: item.imageUrl || item.thumbnailUrl,
            thumbUrl: item.thumbnailUrl || item.imageUrl,
            source: 'epochtimes-web',
            date: '',
            metadata: JSON.stringify({
                pageUrl: item.link || item.source,
                sourceUrl: item.source,
                domain: item.domain || 'theepochtimes.com',
                imageWidth: item.imageWidth,
                imageHeight: item.imageHeight,
                dimensions: item.imageWidth && item.imageHeight ? `${item.imageWidth}×${item.imageHeight}` : '',
            }),
        }));

        // Serper doesn't give exact total — if we got a full page, assume there's more
        const hasMoreResults = images.length >= limit;
        const estimatedTotal = hasMoreResults ? offset + images.length + 100 : offset + images.length;

        return NextResponse.json({ results, total: estimatedTotal });
    } catch (error) {
        console.error('Epoch Times Web search error:', error);
        return NextResponse.json({ results: [], total: 0, error: error.message });
    }
}
