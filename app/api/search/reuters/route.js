import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) return NextResponse.json({ results: [] });

    const clientId = process.env.REUTERS_CLIENT_ID;
    const clientSecret = process.env.REUTERS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ results: generateDemoResults(query, 'reuters') });
    }

    try {
        // Reuters uses OAuth — get token first
        const tokenRes = await fetch('https://auth.thomsonreuters.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
        });

        if (!tokenRes.ok) throw new Error('Reuters auth failed');

        const tokenData = await tokenRes.json();

        const res = await fetch(
            `https://api.reutersagency.com/api/2/images?query=${encodeURIComponent(query)}&limit=20`,
            { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );

        if (!res.ok) throw new Error(`Reuters API error: ${res.status}`);

        const data = await res.json();
        const results = (data.results || []).map((item) => ({
            id: item.id,
            title: item.headline || item.caption || 'Reuters Image',
            imageUrl: item.preview_url || item.thumbnail_url,
            thumbUrl: item.thumbnail_url || item.preview_url,
            source: 'reuters',
            date: item.date_taken ? new Date(item.date_taken).toLocaleDateString() : '',
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Reuters search error:', error);
        return NextResponse.json({ results: generateDemoResults(query, 'reuters') });
    }
}

function generateDemoResults(query, source) {
    return Array.from({ length: 3 }, (_, i) => ({
        id: `rt${i + 1}`,
        title: `${query} — Reuters Photo ${i + 1}`,
        imageUrl: `https://picsum.photos/seed/rt${query}${i}/400/267`,
        thumbUrl: `https://picsum.photos/seed/rt${query}${i}/400/267`,
        source,
        date: new Date().toLocaleDateString(),
    }));
}
