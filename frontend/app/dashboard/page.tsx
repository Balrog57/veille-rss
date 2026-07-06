'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth, logout, getEditions, getEdition, triggerRunTick } from '@/lib/api';
import type { Edition, Article } from '@/lib/types';
import EditionSelector from './components/EditionSelector';
import DraggableGrid from './components/DraggableGrid';

export default function DashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState<number | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    checkAuth()
      .then(() => setAuthChecked(true))
      .catch(() => router.push('/login'));
  }, [router]);

  // Load editions
  useEffect(() => {
    if (!authChecked) return;

    setLoadingEditions(true);
    getEditions()
      .then((eds) => {
        setEditions(eds);
        if (eds.length > 0) {
          setSelectedEditionId(eds[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingEditions(false));
  }, [authChecked]);

  // Load articles for selected edition
  useEffect(() => {
    if (!selectedEditionId) return;

    setLoadingArticles(true);
    getEdition(selectedEditionId)
      .then((ed) => setArticles(ed.articles || []))
      .catch(console.error)
      .finally(() => setLoadingArticles(false));
  }, [selectedEditionId]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [router]);

  const handleRunTick = useCallback(async () => {
    setTicking(true);
    setTickResult(null);
    try {
      const result = await triggerRunTick();
      if (result.skipped) {
        setTickResult('⏭️ Collecte déjà effectuée pour ce créneau.');
      } else {
        setTickResult(`✅ ${result.articleCount ?? 0} articles collectés.`);
        // Refresh editions and select the latest
        const eds = await getEditions();
        setEditions(eds);
        if (eds.length > 0) {
          setSelectedEditionId(eds[0].id);
        }
      }
    } catch (err: any) {
      setTickResult(`❌ Erreur : ${err.message}`);
    } finally {
      setTicking(false);
    }
  }, []);

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
              <a
                href="/dashboard"
                className="text-sm text-gray-300 hover:text-amber-400 transition-colors"
              >
                Tableau de bord
              </a>
              <a
                href="/admin/feeds"
                className="text-sm text-gray-400 hover:text-amber-400 transition-colors"
              >
                Gestion des flux
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <EditionSelector
              editions={editions}
              selectedId={selectedEditionId}
              onSelect={setSelectedEditionId}
              loading={loadingEditions}
            />
            <button
              onClick={handleRunTick}
              disabled={ticking}
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg text-gray-300 transition-colors"
              title="Déclencher une collecte manuelle"
            >
              {ticking ? '⏳...' : 'Collecter'}
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Tick result toast */}
        {tickResult && (
          <div className="max-w-5xl mx-auto px-4 pb-2">
            <div className="text-sm text-gray-300 bg-zinc-800 rounded-lg px-3 py-1.5 inline-block">
              {tickResult}
              <button
                onClick={() => setTickResult(null)}
                className="ml-2 text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile nav */}
      <div className="sm:hidden flex gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <a
          href="/dashboard"
          className="text-sm text-amber-400"
        >
          Tableau de bord
        </a>
        <a
          href="/admin/feeds"
          className="text-sm text-gray-400"
        >
          Gestion des flux
        </a>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {loadingArticles ? (
          <div className="text-center py-16 text-zinc-500 animate-pulse">
            Chargement des articles...
          </div>
        ) : (
          <DraggableGrid articles={articles} />
        )}
      </main>
    </div>
  );
}
