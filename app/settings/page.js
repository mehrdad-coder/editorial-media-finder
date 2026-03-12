'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const API_SECTIONS = [
    {
        id: 'wordpress',
        title: 'WordPress',
        icon: '📝',
        color: '#0a836e',
        fields: [
            { key: 'wordpress_url', label: 'WordPress URL', placeholder: 'https://your-site.com', type: 'text' },
            { key: 'wordpress_username', label: 'Username', placeholder: 'admin', type: 'text' },
            { key: 'wordpress_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password' },
        ],
    },
    {
        id: 'shutterstock',
        title: 'Shutterstock',
        icon: '📸',
        color: '#c0392b',
        fields: [
            { key: 'shutterstock_client_id', label: 'Client ID', placeholder: 'Your Shutterstock Client ID', type: 'text' },
            { key: 'shutterstock_client_secret', label: 'Client Secret', placeholder: 'Your Shutterstock Client Secret', type: 'password' },
        ],
    },
    {
        id: 'getty',
        title: 'Getty Images',
        icon: '🖼️',
        color: '#d4820a',
        fields: [
            { key: 'getty_api_key', label: 'API Key', placeholder: 'Your Getty API Key', type: 'password' },
        ],
    },
    {
        id: 'ap',
        title: 'Associated Press',
        icon: '🗞️',
        color: '#2767b0',
        fields: [
            { key: 'ap_api_key', label: 'API Key', placeholder: 'Your AP Media API Key', type: 'password' },
        ],
    },
    {
        id: 'reuters',
        title: 'Reuters',
        icon: '🌐',
        color: '#d35400',
        fields: [
            { key: 'reuters_client_id', label: 'Client ID', placeholder: 'Your Reuters Client ID', type: 'text' },
            { key: 'reuters_client_secret', label: 'Client Secret', placeholder: 'Your Reuters Client Secret', type: 'password' },
        ],
    },
];

const LLM_PROVIDERS = [
    { id: 'openai', name: 'OpenAI GPT-4o', icon: '🤖', keyField: 'openai_api_key', placeholder: 'sk-...' },
    { id: 'anthropic', name: 'Anthropic Claude', icon: '🧠', keyField: 'anthropic_api_key', placeholder: 'sk-ant-...' },
    { id: 'gemini', name: 'Google Gemini', icon: '✨', keyField: 'gemini_api_key', placeholder: 'AIza...' },
];

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [settings, setSettings] = useState({});
    const [formValues, setFormValues] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const [activeTab, setActiveTab] = useState('sources');
    const [selectedLLM, setSelectedLLM] = useState('openai');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/');
            return;
        }
        loadSettings();
    }, [status]);

    const loadSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings || {});

                // Set LLM provider from saved settings
                const llmProv = data.settings?.llm_provider;
                if (llmProv?.value && llmProv.value !== '' && !llmProv.value.includes('••')) {
                    setSelectedLLM(llmProv.value);
                }
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (key, value) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus(null);
        try {
            const dataToSave = { ...formValues, llm_provider: selectedLLM };
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: dataToSave }),
            });

            if (res.ok) {
                const data = await res.json();
                setSaveStatus({ type: 'success', message: `✅ ${data.updated} settings saved successfully!` });
                setFormValues({});
                loadSettings(); // Reload to get updated masked values
            } else {
                setSaveStatus({ type: 'error', message: '❌ Failed to save settings' });
            }
        } catch (err) {
            setSaveStatus({ type: 'error', message: '❌ Network error saving settings' });
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus(null), 4000);
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <div className="loading-text">Loading settings...</div>
            </div>
        );
    }

    const getDisplayValue = (key) => {
        if (formValues[key] !== undefined) return formValues[key];
        return settings[key]?.value || '';
    };

    const isFieldSet = (key) => settings[key]?.isSet;

    return (
        <>
            {/* Header */}
            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-header-logo">
                        <img src="/logo.png" alt="Epoch Times" />
                    </div>
                    <span className="app-header-title">Settings</span>
                </div>
                <div className="app-header-right">
                    <button
                        className="settings-back-btn"
                        onClick={() => router.push('/dashboard')}
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </header>

            <main className="settings-page">
                {/* Tab Navigation */}
                <div className="settings-tabs">
                    <button
                        className={`settings-tab ${activeTab === 'sources' ? 'active' : ''}`}
                        onClick={() => setActiveTab('sources')}
                    >
                        🔗 Image Sources
                    </button>
                    <button
                        className={`settings-tab ${activeTab === 'llm' ? 'active' : ''}`}
                        onClick={() => setActiveTab('llm')}
                    >
                        🧠 AI / LLM Provider
                    </button>
                </div>

                {/* Sources Tab */}
                {activeTab === 'sources' && (
                    <div className="settings-content">
                        <div className="settings-section-header">
                            <h2>Image Source APIs</h2>
                            <p>Configure credentials for each image source. Green dot means the API key is configured.</p>
                        </div>

                        <div className="settings-grid">
                            {API_SECTIONS.map(section => (
                                <div key={section.id} className="settings-card">
                                    <div className="settings-card-header">
                                        <div className="settings-card-title">
                                            <span className="settings-card-icon">{section.icon}</span>
                                            <h3>{section.title}</h3>
                                        </div>
                                        <div
                                            className="settings-status-dot"
                                            style={{
                                                background: section.fields.every(f => isFieldSet(f.key))
                                                    ? '#0fa573' : '#ccc'
                                            }}
                                            title={
                                                section.fields.every(f => isFieldSet(f.key))
                                                    ? 'Connected' : 'Not configured'
                                            }
                                        />
                                    </div>
                                    <div className="settings-card-fields">
                                        {section.fields.map(field => (
                                            <div key={field.key} className="settings-field">
                                                <label>{field.label}</label>
                                                <div className="settings-input-wrapper">
                                                    <input
                                                        type={field.type}
                                                        value={getDisplayValue(field.key)}
                                                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                                                        placeholder={field.placeholder}
                                                        className="settings-input"
                                                    />
                                                    {isFieldSet(field.key) && formValues[field.key] === undefined && (
                                                        <span className="settings-input-badge">Saved</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* LLM Tab */}
                {activeTab === 'llm' && (
                    <div className="settings-content">
                        <div className="settings-section-header">
                            <h2>AI / LLM Provider</h2>
                            <p>Choose which AI model analyzes your articles to find relevant images. Each provider requires its own API key.</p>
                        </div>

                        <div className="llm-providers">
                            {LLM_PROVIDERS.map(provider => (
                                <div
                                    key={provider.id}
                                    className={`llm-card ${selectedLLM === provider.id ? 'active' : ''}`}
                                    onClick={() => setSelectedLLM(provider.id)}
                                >
                                    <div className="llm-card-header">
                                        <div className="llm-card-radio">
                                            <div className={`llm-radio ${selectedLLM === provider.id ? 'checked' : ''}`} />
                                        </div>
                                        <span className="llm-card-icon">{provider.icon}</span>
                                        <h3>{provider.name}</h3>
                                        {isFieldSet(provider.keyField) && (
                                            <span className="llm-connected-badge">Connected</span>
                                        )}
                                    </div>
                                    <div className="settings-field" style={{ marginTop: '16px' }}>
                                        <label>API Key</label>
                                        <input
                                            type="password"
                                            value={getDisplayValue(provider.keyField)}
                                            onChange={(e) => handleInputChange(provider.keyField, e.target.value)}
                                            placeholder={provider.placeholder}
                                            className="settings-input"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Save Button Area */}
                <div className="settings-footer">
                    {saveStatus && (
                        <div className={`settings-toast ${saveStatus.type}`}>
                            {saveStatus.message}
                        </div>
                    )}
                    <button
                        className="settings-save-btn"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? '⏳ Saving...' : '💾 Save All Settings'}
                    </button>
                </div>
            </main>
        </>
    );
}
