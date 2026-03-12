import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) return NextResponse.json({ results: [] });

    const apiKey = process.env.AP_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ results: generateDemoResults(query, 'ap') });
    }

    try {
        const res = await fetch(
            `https://api.ap.org/media/v/content/search?q=${encodeURIComponent(query)}&page_size=20&media_type=photo`,
            { headers: { 'x-api-key': apiKey } }
        );

        if (!res.ok) throw new Error(`AP API error: ${res.status}`);

        const data = await res.json();
        const results = (data.data?.items || []).map((item) => ({
            id: item.item?.altids?.itemid || item.item?.uri,
            title: item.item?.headline || 'AP Image',
            imageUrl: item.item?.renditions?.preview?.href,
            thumbUrl: item.item?.renditions?.thumbnail?.href || item.item?.renditions?.preview?.href,
            source: 'ap',
            date: item.item?.firstcreated ? new Date(item.item.firstcreated).toLocaleDateString() : '',
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('AP search error:', error);
        return NextResponse.json({ results: generateDemoResults(query, 'ap') });
    }
}

function generateDemoResults(query, source) {
    return Array.from({ length: 4 }, (_, i) => ({
        id: `ap${i + 1}`,
        title: `${query} — AP News Photo ${i + 1}`,
        imageUrl: `https://picsum.photos/seed/ap${query}${i}/400/267`,
        thumbUrl: `https://picsum.photos/seed/ap${query}${i}/400/267`,
        source,
        date: new Date().toLocaleDateString(),
    }));
}
