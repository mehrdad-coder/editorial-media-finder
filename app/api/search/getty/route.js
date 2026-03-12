import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) return NextResponse.json({ results: [] });

    const apiKey = process.env.GETTY_API_KEY;
    const apiSecret = process.env.GETTY_API_SECRET;

    if (!apiKey) {
        return NextResponse.json({ results: generateDemoResults(query, 'getty') });
    }

    try {
        const res = await fetch(
            `https://api.gettyimages.com/v3/search/images/editorial?phrase=${encodeURIComponent(query)}&page_size=20&sort_order=newest`,
            { headers: { 'Api-Key': apiKey } }
        );

        if (!res.ok) throw new Error(`Getty API error: ${res.status}`);

        const data = await res.json();
        const results = (data.images || []).map((item) => ({
            id: item.id,
            title: item.title || 'Getty Image',
            imageUrl: item.display_sizes?.[0]?.uri,
            thumbUrl: item.display_sizes?.find((d) => d.name === 'thumb')?.uri || item.display_sizes?.[0]?.uri,
            source: 'getty',
            date: item.date_created ? new Date(item.date_created).toLocaleDateString() : '',
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Getty search error:', error);
        return NextResponse.json({ results: generateDemoResults(query, 'getty') });
    }
}

function generateDemoResults(query, source) {
    return Array.from({ length: 4 }, (_, i) => ({
        id: `gt${i + 1}`,
        title: `${query} — Getty Editorial ${i + 1}`,
        imageUrl: `https://picsum.photos/seed/gt${query}${i}/400/267`,
        thumbUrl: `https://picsum.photos/seed/gt${query}${i}/400/267`,
        source,
        date: new Date().toLocaleDateString(),
    }));
}
