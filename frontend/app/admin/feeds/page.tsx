'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth, logout, getFeeds, deleteFeed } from '@/lib/api';
import type { Feed } from '@/lib/types';
import FeedForm from './components/FeedForm';

export default function AdminFeedsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Check auth
  useEffect(() => {
    checkAuth()
      .then(() => setAuthChecked(true))
      .catch(() => router.push('/login'));
  }, [router]);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFeeds();
      setFeeds(data);
    } catch (err) {
      console.error('Failed to load feeds:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) loadFeeds();
  }, [authChecked, loadFeeds]);

  async function handleDelete(id: number) {
    if (!confirm('Supprimer ce flux ? Les articles déjà collectés ne seront pas supprimés.')) return;

    setDeleting(id);
    try {
      await deleteFeed(id);
      setFeeds((prev) => prev.filter((f) => f.id !== id));
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  }

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [router]);

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-amber-500 animate-pulse">Vérification...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-amber-400">Veille RSS</h1>
            <nav className="hidden sm:flex items-center gap-3 ml-6">
              <a href="/dashboard" className="text-sm text-gray-400 hover:text-amber-400 transition-colors">
                Tableau de bord
              </a>
              <a href="/admin/feeds" className="text-sm text-gray-300 hover:text-amber-400 transition-colors">
                Gestion des flux
              </a>
              <a href="/admin/settings" className="text-sm text-gray-400 hover:text-amber-400 transition-colors">
                Paramètres
              </a>
            </nav>
          </div>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Add feed form */}
        <FeedForm onFeedAdded={loadFeeds} />

        {/* Feed list */}
        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-4">Flux configurés</h2>

          {loading ? (
            <div className="text-center py-8 text-zinc-500 animate-pulse">Chargement...</div>
          ) : feeds.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <p>Aucun flux configuré.</p>
              <p className="text-sm mt-1">Ajoutez un flux RSS ci-dessus pour commencer.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left">
                    <th className="pb-3 text-gray-400 font-medium">Titre</th>
                    <th className="pb-3 text-gray-400 font-medium">URL</th>
                    <th className="pb-3 text-gray-400 font-medium">Statut</th>
                    <th className="pb-3 text-gray-400 font-medium">Ajouté le</th>
                    <th className="pb-3 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feeds.map((feed) => (
                    <tr key={feed.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                      <td className="py-3 pr-4 text-gray-200">
                        {feed.title || '-'}
                      </td>
                      <td className="py-3 pr-4">
                        <a
                          href={feed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-500/80 hover:text-amber-400 truncate block max-w-[300px]"
                        >
                          {feed.url}
                        </a>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            feed.active
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-zinc-700 text-zinc-400'
                          }`}
                        >
                          {feed.active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-400">
                        {new Date(feed.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => handleDelete(feed.id)}
                          disabled={deleting === feed.id}
                          className="px-3 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {deleting === feed.id ? '...' : 'Supprimer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
