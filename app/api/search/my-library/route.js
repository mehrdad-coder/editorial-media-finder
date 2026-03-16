import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query) return NextResponse.json({ results: [], total: 0 });

    try {
        // Search licensed images by keyword in description
        const keywords = query.trim().split(/\s+/);

        // Build WHERE clause: all keywords must appear in description
        const whereConditions = keywords.map(kw => ({
            description: { contains: kw },
        }));

        const [results, total] = await Promise.all([
            prisma.licensedImage.findMany({
                where: { AND: whereConditions },
                skip: offset,
                take: limit,
                orderBy: { licensedAt: 'desc' },
            }),
            prisma.licensedImage.count({
                where: { AND: whereConditions },
            }),
        ]);

        const formatted = results.map(img => ({
            id: img.id,
            title: img.description || 'Licensed Image',
            imageUrl: img.imageUrl || img.thumbUrl,
            thumbUrl: img.thumbUrl || img.imageUrl,
            source: 'my-library',
            date: img.licensedAt ? new Date(img.licensedAt).toLocaleDateString() : '',
            licensed: true,
            metadata: JSON.stringify({ contributor: img.contributor }),
        }));

        return NextResponse.json({ results: formatted, total });
    } catch (error) {
        console.error('My Library search error:', error);
        return NextResponse.json({ results: [], total: 0 });
    }
}
