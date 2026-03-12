import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query) return NextResponse.json({ results: [], total: 0 });

    const apiKey = process.env.EPOCH_IMAGES_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ results: [], total: 0, error: 'Epoch Times API key not configured' });
    }

    try {
        const res = await fetch('https://images.theepochtimes.com/api/v1/search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                search: query,
                searchType: 'newest',
                offset,
                limit,
                videoOnly: false,
            }),
        });

        if (!res.ok) throw new Error(`Epoch Times API error: ${res.status}`);

        const data = await res.json();
        const results = (data.hits || []).map((item) => ({
            id: String(item.slug),
            title: item.description || 'Epoch Times Image',
            imageUrl: item.previewUrl || item.thumb,
            thumbUrl: item.thumb || item.previewUrl,
            source: 'epochtimes',
            date: item.creationDate ? new Date(item.creationDate).toLocaleDateString() : '',
            metadata: JSON.stringify({
                artist: item.artistName,
                collection: item.collection,
                affiliation: item.affiliation,
                tags: item.tags,
                pageUrl: item.pageUrl,
                downloadUrl: item.downloadUrl,
                dimensions: item.width && item.height ? `${item.width}×${item.height}` : '',
                filename: item.filename,
            }),
        }));

        return NextResponse.json({ results, total: data.total || data.estimatedTotalHits || 0 });
    } catch (error) {
        console.error('Epoch Times search error:', error);
        return NextResponse.json({ results: [], error: error.message });
    }
}
