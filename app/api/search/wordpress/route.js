import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ results: [] });
    }

    const wpUrl = process.env.WORDPRESS_URL;
    const wpUser = process.env.WORDPRESS_USERNAME;
    const wpPass = process.env.WORDPRESS_APP_PASSWORD;

    if (!wpUrl) {
        // Return demo results when WordPress is not configured
        return NextResponse.json({
            results: generateDemoResults(query, 'wordpress'),
        });
    }

    try {
        const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
        const res = await fetch(
            `${wpUrl}/wp-json/wp/v2/media?search=${encodeURIComponent(query)}&per_page=20&media_type=image`,
            {
                headers: { Authorization: `Basic ${auth}` },
            }
        );

        if (!res.ok) throw new Error(`WordPress API error: ${res.status}`);

        const data = await res.json();
        const results = data.map((item) => ({
            id: item.id,
            title: item.title?.rendered || item.alt_text || 'WordPress Image',
            imageUrl: item.source_url,
            thumbUrl: item.media_details?.sizes?.medium?.source_url || item.source_url,
            source: 'wordpress',
            date: new Date(item.date).toLocaleDateString(),
            metadata: JSON.stringify({
                width: item.media_details?.width,
                height: item.media_details?.height,
                caption: item.caption?.rendered,
            }),
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('WordPress search error:', error);
        return NextResponse.json({
            results: generateDemoResults(query, 'wordpress'),
        });
    }
}

function generateDemoResults(query, source) {
    const demoImages = [
        { id: 'wp1', title: `${query} — Editorial Photo 1`, thumbUrl: `https://picsum.photos/seed/${query}1/400/267` },
        { id: 'wp2', title: `${query} — News Coverage`, thumbUrl: `https://picsum.photos/seed/${query}2/400/267` },
        { id: 'wp3', title: `${query} — Archive Image`, thumbUrl: `https://picsum.photos/seed/${query}3/400/267` },
        { id: 'wp4', title: `${query} — Feature Photo`, thumbUrl: `https://picsum.photos/seed/${query}4/400/267` },
    ];

    return demoImages.map((img) => ({
        ...img,
        imageUrl: img.thumbUrl,
        source,
        date: new Date().toLocaleDateString(),
    }));
}
