import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { text } = await request.json();

        if (!text || text.trim().length < 10) {
            return NextResponse.json({ error: 'Text too short' }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;

        if (apiKey) {
            // Use OpenAI for smart keyword extraction
            try {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content:
                                    'You are a keyword extraction assistant for editorial image search. Given an article, extract 5-8 concise search keywords that would help find relevant editorial/news photos. Return ONLY a JSON array of strings, no explanation.',
                            },
                            { role: 'user', content: text.substring(0, 3000) },
                        ],
                        temperature: 0.3,
                        max_tokens: 200,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const content = data.choices?.[0]?.message?.content || '[]';
                    const keywords = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, ''));
                    return NextResponse.json({ keywords });
                }
            } catch (aiError) {
                console.warn('OpenAI extraction failed, using fallback:', aiError);
            }
        }

        // Fallback: simple keyword extraction without AI
        const keywords = extractKeywordsSimple(text);
        return NextResponse.json({ keywords });
    } catch (error) {
        console.error('Keyword extraction error:', error);
        return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
    }
}

function extractKeywordsSimple(text) {
    // Simple TF-based extraction
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its',
        'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we',
        'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
        'our', 'their', 'what', 'which', 'who', 'when', 'where', 'how',
        'not', 'no', 'nor', 'as', 'if', 'then', 'than', 'too', 'very',
        'just', 'about', 'also', 'more', 'said', 'says', 'new', 'one',
        'two', 'first', 'last', 'long', 'great', 'little', 'own', 'other',
        'old', 'right', 'big', 'high', 'different', 'small', 'large',
        'next', 'early', 'young', 'important', 'few', 'public', 'bad',
        'same', 'able', 'only', 'even', 'back', 'after', 'use', 'here',
        'all', 'so', 'up', 'into', 'over', 'such', 'through', 'during',
    ]);

    const words = text
        .toLowerCase()
        .replace(/[^a-zA-Z\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w));

    const freq = {};
    words.forEach((w) => {
        freq[w] = (freq[w] || 0) + 1;
    });

    // Also extract capitalized phrases (likely proper nouns)
    const properNouns = text
        .match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)
        ?.filter((p) => p.length > 3) || [];

    const properNounSet = [...new Set(properNouns.slice(0, 3))];

    const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

    return [...properNounSet, ...sorted].slice(0, 8);
}
