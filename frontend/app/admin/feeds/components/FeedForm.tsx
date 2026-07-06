'use client';

import { useState, FormEvent } from 'react';
import { addFeed } from '@/lib/api';

interface Props {
  onFeedAdded: () => void;
}

export default function FeedForm({ onFeedAdded }: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await addFeed(url, title || undefined);
      setUrl('');
      setTitle('');
      onFeedAdded();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'ajout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-gray-100">Ajouter un flux RSS</h2>

      <div>
        <label htmlFor="feed-url" className="block text-sm text-gray-300 mb-1">
          URL du flux *
        </label>
        <input
          id="feed-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          required
        />
      </div>

      <div>
        <label htmlFor="feed-title" className="block text-sm text-gray-300 mb-1">
          Titre (optionnel)
        </label>
        <input
          id="feed-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mon flux"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 text-white font-medium rounded-lg transition-colors text-sm"
      >
        {loading ? 'Vérification...' : 'Ajouter le flux'}
      </button>
    </form>
  );
}
