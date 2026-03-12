import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) return NextResponse.json({ results: [] });

    const clientId = process.env.SHUTTERSTOCK_CLIENT_ID;
    const clientSecret = process.env.SHUTTERSTOCK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ results: generateDemoResults(query, 'shutterstock') });
    }

    try {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const res = await fetch(
            `https://api.shutterstock.com/v2/images/search?query=${encodeURIComponent(query)}&per_page=20&sort=popular&image_type=photo`,
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
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Shutterstock search error:', error);
        return NextResponse.json({ results: generateDemoResults(query, 'shutterstock') });
    }
}

function generateDemoResults(query, source) {
    return Array.from({ length: 5 }, (_, i) => ({
        id: `ss${i + 1}`,
        title: `${query} — Stock Photo ${i + 1}`,
        imageUrl: `https://picsum.photos/seed/ss${query}${i}/400/267`,
        thumbUrl: `https://picsum.photos/seed/ss${query}${i}/400/267`,
        source,
        date: new Date().toLocaleDateString(),
    }));
}
