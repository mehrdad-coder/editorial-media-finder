import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1', 10);

    if (!query) return NextResponse.json({ results: [], total: 0 });

    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ results: [], total: 0, error: 'Serper API key not configured' });
    }

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
                num: 20,
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

        // Serper doesn't return a total count, but if we got a full page, there's likely more
        const hasMore = images.length >= 20;
        const estimatedTotal = hasMore ? (page * 20) + 20 : (page - 1) * 20 + images.length;

        return NextResponse.json({ results, total: estimatedTotal, hasMore });
    } catch (error) {
        console.error('Epoch Times Web search error:', error);
        return NextResponse.json({ results: [], total: 0, error: error.message });
    }
}
