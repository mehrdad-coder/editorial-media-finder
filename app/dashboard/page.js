'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const SOURCES = [
    { id: 'all', label: 'All Sources', color: '#a29bfe' },
    { id: 'epochtimes', label: 'ET Photo Wire', color: '#1a3a5c' },
    { id: 'epochtimes-web', label: 'ET Published', color: '#2d6a4f' },
    { id: 'wordpress', label: 'WordPress', color: '#00cec9' },
    { id: 'shutterstock', label: 'Shutterstock', color: '#e17055' },
    { id: 'getty', label: 'Getty Images', color: '#fdcb6e' },
    { id: 'ap', label: 'AP', color: '#74b9ff' },
    { id: 'reuters', label: 'Reuters', color: '#ff7675' },
];

const SOURCE_LABELS = {
    'epochtimes': 'ET Photo Wire',
    'epochtimes-web': 'ET Published',
    'wordpress': 'WordPress',
    'shutterstock': 'Shutterstock',
    'getty': 'Getty',
    'ap': 'AP',
    'reuters': 'Reuters',
};

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [articleTitle, setArticleTitle] = useState('');
    const [articleText, setArticleText] = useState('');
    const [activeSource, setActiveSource] = useState('all');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [keywords, setKeywords] = useState([]);
    const [showArticlePanel, setShowArticlePanel] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [lightboxImage, setLightboxImage] = useState(null);

    // Infinite scroll state
    const [sourceOffsets, setSourceOffsets] = useState({});
    const [sourceTotals, setSourceTotals] = useState({});
    const [hasMore, setHasMore] = useState(false);
    const [lastQuery, setLastQuery] = useState('');
    const [lastSources, setLastSources] = useState([]);
    const sentinelRef = useRef(null);
    const sourceOffsetsRef = useRef({});
    const sourceTotalsRef = useRef({});

    // Load more results for infinite scroll
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore || !lastQuery) return;

        setLoadingMore(true);
        try {
            const newResults = [];
            const currentOffsets = { ...sourceOffsetsRef.current };
            const currentTotals = sourceTotalsRef.current;
            let stillHasMore = false;

            for (const source of lastSources) {
                const offset = currentOffsets[source] || 0;
                const total = currentTotals[source] || 0;

                if (offset >= total) continue;

                try {
                    const res = await fetch(`/api/search/${source}?q=${encodeURIComponent(lastQuery)}&offset=${offset}&limit=20`);
                    if (res.ok) {
                        const data = await res.json();
                        const items = data.results || [];
                        newResults.push(...items);
                        currentOffsets[source] = offset + items.length;
                        // Update total from API response (may grow for Serper)
                        if (data.total) {
                            currentTotals[source] = data.total;
                        }
                        if (currentOffsets[source] < (data.total || total)) {
                            stillHasMore = true;
                        }
                    }
                } catch (err) {
                    console.warn(`Load more failed for ${source}:`, err);
                }
            }

            if (newResults.length > 0) {
                setResults(prev => [...prev, ...newResults]);
            }
            sourceOffsetsRef.current = currentOffsets;
            sourceTotalsRef.current = currentTotals;
            setSourceOffsets(currentOffsets);
            setSourceTotals({ ...currentTotals });
            setHasMore(stillHasMore);
        } catch (err) {
            console.error('Load more error:', err);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, lastQuery, lastSources]);

    // IntersectionObserver for infinite scroll
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    loadMore();
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, loadMore]);

    // Auto-search when source filter changes
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (query.trim()) {
            handleSearch(query);
        }
    }, [activeSource]);

    // Redirect if not authenticated
    if (status === 'unauthenticated') {
        router.push('/');
        return null;
    }

    if (status === 'loading') {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <div className="loading-text">Loading...</div>
            </div>
        );
    }

    const handleSearch = async (searchQuery) => {
        const q = searchQuery || query;
        if (!q.trim()) return;

        setLoading(true);
        setResults([]);
        const offsets = {};
        const totals = {};

        try {
            const sourcesToSearch = activeSource === 'all'
                ? ['epochtimes', 'epochtimes-web', 'wordpress', 'shutterstock', 'getty', 'ap', 'reuters']
                : [activeSource];

            const allResults = [];

            for (const source of sourcesToSearch) {
                try {
                    const res = await fetch(`/api/search/${source}?q=${encodeURIComponent(q)}&offset=0&limit=20`);
                    if (res.ok) {
                        const data = await res.json();
                        const items = data.results || [];
                        allResults.push(...items);
                        offsets[source] = items.length;
                        totals[source] = data.total || items.length;
                    }
                } catch (err) {
                    console.warn(`Search failed for ${source}:`, err);
                }
            }

            setResults(allResults);
            setSourceOffsets(offsets);
            setSourceTotals(totals);
            sourceOffsetsRef.current = offsets;
            sourceTotalsRef.current = totals;
            setLastQuery(q);
            setLastSources(sourcesToSearch);

            // Check if any source has more results
            const anyMore = sourcesToSearch.some(s => (offsets[s] || 0) < (totals[s] || 0));
            setHasMore(anyMore);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAIAnalyze = async () => {
        if (!articleText.trim() && !articleTitle.trim()) return;

        setAiLoading(true);
        setAiAnalysis(null);
        try {
            const res = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: articleTitle, text: articleText }),
            });

            if (res.ok) {
                const data = await res.json();
                setAiAnalysis(data);

                // Set keywords
                const allKeywords = data.keywords || [];
                setKeywords(allKeywords);

                // Auto-search with the best query
                const bestQuery = data.searchQueries?.[0] || allKeywords.join(' ');
                if (bestQuery) {
                    setQuery(bestQuery);
                    handleSearch(bestQuery);
                }
            }
        } catch (err) {
            console.error('AI analysis error:', err);
        } finally {
            setAiLoading(false);
        }
    };

    const toggleSelection = (image) => {
        setSelections((prev) => {
            const exists = prev.find((s) => s.imageUrl === image.imageUrl);
            if (exists) {
                return prev.filter((s) => s.imageUrl !== image.imageUrl);
            }
            return [...prev, image];
        });
    };

    const isSelected = (image) => {
        return selections.some((s) => s.imageUrl === image.imageUrl);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const showToast = (message) => {
        setToast(message);
        setTimeout(() => setToast(null), 2000);
    };

    const handleCopyImage = async (e, image) => {
        e.stopPropagation();
        const url = image.imageUrl || image.thumbUrl;
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            // Convert to PNG for clipboard compatibility
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const loaded = new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            img.src = URL.createObjectURL(blob);
            await loaded;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(img.src);
            const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': pngBlob })
            ]);
            showToast('📋 Image copied! Paste anywhere');
        } catch {
            // Fallback: copy URL
            try {
                await navigator.clipboard.writeText(url);
                showToast('📋 URL copied (image copy not supported)');
            } catch {
                showToast('❌ Copy failed');
            }
        }
    };

    const handleDownload = async (e, image) => {
        e.stopPropagation();
        const url = image.imageUrl || image.thumbUrl;
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = image.title ? `${image.title.slice(0, 50)}.jpg` : 'image.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            showToast('⬇️ Download started!');
        } catch {
            window.open(url, '_blank');
            showToast('📎 Opened in new tab');
        }
    };



    return (
        <>
            {/* Header */}
            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-logo">
                        <img src="/logo.png" alt="Epoch Times" />
                    </div>
                    <span className="app-header-title">MediaFinder</span>
                </div>
                <div className="app-header-right">
                    <button
                        className="settings-link-btn"
                        onClick={() => router.push('/settings')}
                    >
                        ⚙️ Settings
                    </button>
                    <div className="user-badge">
                        <div className="user-avatar">
                            {session?.user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <span>{session?.user?.name || 'User'}</span>
                    </div>
                    <button className="logout-btn" onClick={() => signOut({ callbackUrl: '/' })}>
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Dashboard */}
            <main className="dashboard">
                {/* Article Input Toggle */}
                <div className="article-panel">
                    <button
                        className="ai-btn"
                        onClick={() => setShowArticlePanel(!showArticlePanel)}
                        style={{ marginBottom: showArticlePanel ? '16px' : '0' }}
                    >
                        ✨ {showArticlePanel ? 'Hide Article Panel' : 'Paste Article for AI Analysis'}
                    </button>

                    {showArticlePanel && (
                        <>
                            <div className="article-title-group">
                                <label className="article-field-label">📰 Article Title</label>
                                <input
                                    type="text"
                                    className="article-title-input"
                                    placeholder="Enter the article title..."
                                    value={articleTitle}
                                    onChange={(e) => setArticleTitle(e.target.value)}
                                />
                            </div>
                            <div className="article-body-group">
                                <label className="article-field-label">📝 Article Text</label>
                                <textarea
                                    className="article-textarea"
                                    placeholder="Paste the full article text or a relevant section here... AI will analyze it and find the most relevant images based on people, places, events, and visual concepts."
                                    value={articleText}
                                    onChange={(e) => setArticleText(e.target.value)}
                                />
                            </div>
                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button className="search-btn" onClick={handleAIAnalyze} disabled={aiLoading || (!articleText.trim() && !articleTitle.trim())}>
                                    {aiLoading ? '⏳ Analyzing...' : '🧠 Analyze & Find Images'}
                                </button>
                            </div>

                            {/* AI Analysis Results */}
                            {aiAnalysis && (
                                <div className="ai-analysis-panel">
                                    {/* Search Queries */}
                                    {aiAnalysis.searchQueries?.length > 0 && (
                                        <div style={{ marginBottom: '12px' }}>
                                            <div className="ai-analysis-label">🔍 Search Queries</div>
                                            <div className="ai-analysis-queries">
                                                {aiAnalysis.searchQueries.map((q, i) => (
                                                    <span
                                                        key={i}
                                                        className="ai-query-tag"
                                                        onClick={() => { setQuery(q); handleSearch(q); }}
                                                    >
                                                        {q}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Visual Concepts */}
                                    {aiAnalysis.visualConcepts?.length > 0 && (
                                        <div style={{ marginBottom: '12px' }}>
                                            <div className="ai-analysis-label">🎨 Visual Concepts</div>
                                            <div className="ai-analysis-queries">
                                                {aiAnalysis.visualConcepts.map((vc, i) => (
                                                    <span
                                                        key={i}
                                                        className="ai-query-tag visual"
                                                        onClick={() => { setQuery(vc); handleSearch(vc); }}
                                                    >
                                                        {vc}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Keywords */}
                                    {aiAnalysis.keywords?.length > 0 && (
                                        <div style={{ marginBottom: '12px' }}>
                                            <div className="ai-analysis-label">🏷️ Keywords</div>
                                            <div className="keywords-tags">
                                                {aiAnalysis.keywords.map((kw, i) => (
                                                    <span
                                                        key={i}
                                                        className="keyword-tag"
                                                        onClick={() => { setQuery(kw); handleSearch(kw); }}
                                                    >
                                                        {kw}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* People & Locations */}
                                    {(aiAnalysis.people?.length > 0 || aiAnalysis.locations?.length > 0) && (
                                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                            {aiAnalysis.people?.length > 0 && (
                                                <div>
                                                    <div className="ai-analysis-label">👤 People</div>
                                                    <div className="ai-analysis-queries">
                                                        {aiAnalysis.people.map((p, i) => (
                                                            <span key={i} className="ai-query-tag" onClick={() => { setQuery(p); handleSearch(p); }}>{p}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {aiAnalysis.locations?.length > 0 && (
                                                <div>
                                                    <div className="ai-analysis-label">📍 Locations</div>
                                                    <div className="ai-analysis-queries">
                                                        {aiAnalysis.locations.map((l, i) => (
                                                            <span key={i} className="ai-query-tag" onClick={() => { setQuery(l); handleSearch(l); }}>{l}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {aiAnalysis.provider && (
                                        <div style={{ marginTop: '12px', fontSize: '11px', color: '#999' }}>
                                            Analyzed by: {aiAnalysis.provider}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Search Area */}
                <div className="search-area">
                    <div className="search-bar-wrapper">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search for editorial images..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                    </div>

                    <div className="search-actions">
                        <button className="search-btn" onClick={() => handleSearch()} disabled={loading || !query.trim()}>
                            {loading ? '⏳ Searching...' : '🔍 Search'}
                        </button>

                        <div className="source-filters">
                            {SOURCES.map((source) => (
                                <button
                                    key={source.id}
                                    className={`source-chip ${activeSource === source.id ? 'active' : ''}`}
                                    onClick={() => setActiveSource(source.id)}
                                >
                                    <span className="source-chip-dot" style={{ background: source.color }}></span>
                                    {source.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Results */}
                {results.length > 0 && (
                    <div className="results-info">
                        <div className="results-count">
                            Showing <span>{results.length}</span> of <span>{Object.values(sourceTotals).reduce((a, b) => a + b, 0)}</span> images
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <div className="loading-text">Searching across media sources...</div>
                    </div>
                ) : results.length > 0 ? (
                    <div className="image-grid">
                        {results.map((image, index) => (
                            <div key={`${image.source}-${image.id || index}`} className="image-card" onClick={() => setLightboxImage(image)}>
                                <div className="image-card-img-wrapper">
                                    <img src={image.thumbUrl || image.imageUrl} alt={image.title || 'Image'} loading="lazy" />
                                </div>
                                <div className="image-card-info">
                                    <div className="image-card-title">{image.title || 'Untitled'}</div>
                                    <div className="image-card-meta">
                                        <span className={`image-card-source ${image.source}`}>{SOURCE_LABELS[image.source] || image.source}</span>
                                        {image.date && <span className="image-card-date">{image.date}</span>}
                                        <div className="image-card-btns">
                                            <button
                                                className="card-action-btn"
                                                onClick={(e) => handleCopyImage(e, image)}
                                                title="Copy image to clipboard"
                                            >
                                                📋
                                            </button>
                                            <button
                                                className="card-action-btn"
                                                onClick={(e) => handleDownload(e, image)}
                                                title="Download image"
                                            >
                                                ⬇️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* Sentinel for infinite scroll */}
                        <div ref={sentinelRef} style={{ gridColumn: '1 / -1', height: '1px' }} />
                        {loadingMore && (
                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                                <div className="loading-spinner" />
                            </div>
                        )}
                        {!hasMore && results.length > 20 && (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                                All results loaded
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">🖼️</div>
                        <h3>Search for Editorial Images</h3>
                        <p>Enter keywords or paste an article above to discover relevant images from WordPress, Shutterstock, Getty, AP, and Reuters.</p>
                    </div>
                )}
            </main>

            {/* Selections Panel */}
            <div className={`selections-panel ${selections.length > 0 ? 'visible' : ''}`}>
                <div className="selections-header">
                    <div className="selections-title">
                        📌 Selected Images <span className="selections-count">{selections.length}</span>
                    </div>
                </div>
                <div className="selections-thumbnails">
                    {selections.map((sel, i) => (
                        <div key={i} className="selection-thumb">
                            <img src={sel.thumbUrl || sel.imageUrl} alt={sel.title || ''} />
                            <button
                                className="selection-thumb-remove"
                                onClick={() => toggleSelection(sel)}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Lightbox Modal */}
            {lightboxImage && (
                <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
                    <button className="lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
                    <img
                        className="lightbox-img"
                        src={lightboxImage.imageUrl || lightboxImage.thumbUrl}
                        alt={lightboxImage.title || 'Image'}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div className="lightbox-info" onClick={(e) => e.stopPropagation()}>
                        <div className="lightbox-title">{lightboxImage.title || 'Untitled'}</div>
                        <div className="lightbox-actions">
                            <button className="lightbox-btn" onClick={(e) => handleCopyImage(e, lightboxImage)}>📋 Copy Image</button>
                            <button className="lightbox-btn" onClick={(e) => handleDownload(e, lightboxImage)}>⬇️ Download</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className="toast-notification">{toast}</div>
            )}
        </>
    );
}
