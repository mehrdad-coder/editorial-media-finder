import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');

    if (!ids) return NextResponse.json({ licensed: {} });

    const token = process.env.SHUTTERSTOCK_API_TOKEN;
    if (!token) {
        return NextResponse.json({ licensed: {}, error: 'No API token configured' });
    }

    const imageIds = ids.split(',').map(id => id.trim()).filter(Boolean);
    const licensedMap = {};

    // Check each image ID against the licenses API
    // Batch into chunks to avoid overwhelming the API
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
                } else {
                    licensedMap[imageId] = false;
                }
            } catch {
                licensedMap[imageId] = false;
            }
        });
        await Promise.all(checks);
    }

    return NextResponse.json({ licensed: licensedMap });
}
