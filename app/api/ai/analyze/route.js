import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ANALYSIS_PROMPT = `You are an expert editorial image researcher. Analyze the following article text and extract information to help find the most relevant editorial photographs.

Return a JSON object with exactly these fields:
{
  "keywords": ["5-8 concise search keywords"],
  "searchQueries": ["3-5 specific image search queries that would find the best photos for this article"],
  "visualConcepts": ["2-4 visual concepts or scenes that would illustrate this article"],
  "people": ["names of key people mentioned"],
  "locations": ["key locations/places mentioned"]
}

Focus on:
- Names of specific people, politicians, leaders
- Specific events, meetings, conferences
- Geographic locations and landmarks
- Visual scenes that represent the story (e.g., "protest march", "diplomatic handshake", "election rally")
- Emotional tone (e.g., "celebration", "devastation", "tension")

Return ONLY valid JSON, no explanation.`;

async function getSettingValue(key) {
    try {
        const setting = await prisma.setting.findUnique({ where: { key } });
        return setting?.value || '';
    } catch {
        return '';
    }
}

async function callOpenAI(apiKey, text) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: ANALYSIS_PROMPT },
                { role: 'user', content: text.substring(0, 4000) },
            ],
            temperature: 0.3,
            max_tokens: 500,
        }),
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '{}';
}

async function callAnthropic(apiKey, text) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [
                { role: 'user', content: `${ANALYSIS_PROMPT}\n\nArticle:\n${text.substring(0, 4000)}` },
            ],
        }),
    });

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || '{}';
}

async function callGemini(apiKey, text) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: `${ANALYSIS_PROMPT}\n\nArticle:\n${text.substring(0, 4000)}` },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 500,
                },
            }),
        }
    );

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

function parseAIResponse(content) {
    try {
        const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

function fallbackAnalysis(text) {
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

    const words = text.toLowerCase().replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

    const properNouns = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)
        ?.filter(p => p.length > 3) || [];
    const people = [...new Set(properNouns.slice(0, 5))];

    const keywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);

    return {
        keywords: [...people.slice(0, 3), ...keywords].slice(0, 8),
        searchQueries: people.length > 0
            ? [people.join(' '), keywords.slice(0, 3).join(' ')]
            : [keywords.slice(0, 4).join(' ')],
        visualConcepts: [],
        people: people,
        locations: [],
    };
}

export async function POST(request) {
    try {
        const { title, text } = await request.json();

        const combinedText = [title, text].filter(Boolean).join('\n\n');

        if (!combinedText || combinedText.trim().length < 5) {
            return NextResponse.json({ error: 'Text too short' }, { status: 400 });
        }

        // Get LLM settings from database
        const llmProvider = await getSettingValue('llm_provider') || 'openai';
        const apiKeyMap = {
            openai: 'openai_api_key',
            anthropic: 'anthropic_api_key',
            gemini: 'gemini_api_key',
        };

        const apiKey = await getSettingValue(apiKeyMap[llmProvider])
            || process.env.OPENAI_API_KEY // fallback to env
            || '';

        if (apiKey) {
            try {
                let rawContent;

                switch (llmProvider) {
                    case 'anthropic':
                        rawContent = await callAnthropic(apiKey, combinedText);
                        break;
                    case 'gemini':
                        rawContent = await callGemini(apiKey, combinedText);
                        break;
                    default:
                        rawContent = await callOpenAI(apiKey, combinedText);
                }

                const analysis = parseAIResponse(rawContent);
                if (analysis) {
                    return NextResponse.json({
                        ...analysis,
                        provider: llmProvider,
                    });
                }
            } catch (aiError) {
                console.warn(`${llmProvider} analysis failed, using fallback:`, aiError.message);
            }
        }

        // Fallback without AI
        const fallback = fallbackAnalysis(combinedText);
        return NextResponse.json({ ...fallback, provider: 'fallback' });
    } catch (error) {
        console.error('Analysis error:', error);
        return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
    }
}
