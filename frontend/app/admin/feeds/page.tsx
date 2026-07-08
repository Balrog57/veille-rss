'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth, logout, getFeeds, deleteFeed, getSettings, updateSettings, pruneNow, type Settings } from '@/lib/api';
import type { Feed } from '@/lib/types';
import FeedForm from './components/FeedForm';

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Zurich',
  'Europe/Lisbon',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Moscow',
  'Africa/Casablanca',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

export default function AdminFeedsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Settings state
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tz, setTz] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [retentionDays, setRetentionDays] = useState(300);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);

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

  const loadSettings = useCallback(async () => {
    try {
      const s = await getSettings();
      setSettings(s);
      setTz(s.timezone);
      setCronExpr(s.cronExpr);
      setRetentionDays(s.retentionDays);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  useEffect(() => {
    if (authChecked) {
      loadFeeds();
      loadSettings();
    }
  }, [authChecked, loadFeeds, loadSettings]);

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

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateSettings({
        timezone: tz,
        cronExpr,
        retentionDays: Number(retentionDays),
      });
      setSettings(updated);
      setSaveMsg('✓ Paramètres enregistrés. Le cron a été relancé si nécessaire.');
    } catch (err: any) {
      setSaveMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrune = async () => {
    if (!confirm(`Supprimer toutes les éditions et articles de plus de ${retentionDays} jours ?`)) return;
    setPruning(true);
    setPruneMsg(null);
    try {
      const result = await pruneNow();
      setPruneMsg(
        `🗑️ ${result.deletedEditions} édition(s) et ${result.deletedArticles} article(s) supprimés ` +
          `(${result.editionsBefore} → ${result.editionsAfter} édition(s)).`
      );
      loadFeeds();
    } catch (err: any) {
      setPruneMsg(`❌ ${err.message}`);
    } finally {
      setPruning(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-amber-500 animate-pulse">Vérification...</div>
      </div>
    );
  }

  // Build a sorted, deduped timezone list (with common ones first)
  const allTimezones = (() => {
    try {
      // @ts-ignore - supportedValuesOf may not be in older TS lib
      const all = typeof Intl !== 'undefined' && (Intl as any).supportedValuesOf
        ? (Intl as any).supportedValuesOf('timeZone') as string[]
        : COMMON_TIMEZONES;
      return Array.from(new Set([...COMMON_TIMEZONES, ...all])).sort();
    } catch {
      return COMMON_TIMEZONES.slice().sort();
    }
  })();

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
            </nav>
          </div>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Settings — at the top of Flux page */}
        <section className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-4">Paramètres</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="tz" className="block text-sm text-zinc-300 mb-1">
                Fuseau horaire
              </label>
              <select
                id="tz"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {allTimezones.map((tzOpt) => (
                  <option key={tzOpt} value={tzOpt}>
                    {tzOpt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cron" className="block text-sm text-zinc-300 mb-1">
                Cron
              </label>
              <input
                id="cron"
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 */6 * * *"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                <code>0 */6 * * *</code> = toutes les 6h &middot; <code>0 0 * * *</code> = 1 fois/jour
              </p>
            </div>

            <div>
              <label htmlFor="retention" className="block text-sm text-zinc-300 mb-1">
                Rétention (jours)
              </label>
              <div className="flex gap-2">
                <input
                  id="retention"
                  type="number"
                  min={1}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={handlePrune}
                  disabled={pruning}
                  title={`Vider toutes les données de plus de ${retentionDays} jours`}
                  className="px-3 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  {pruning ? '...' : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path>
                      <path d="M10 11v6"></path>
                      <path d="M14 11v6"></path>
                      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                L'icône 🗑️ supprime immédiatement les données de plus de {retentionDays} jours.
              </p>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-900 font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>

          {(saveMsg || pruneMsg) && (
            <p className="text-sm text-zinc-300 mt-3">{saveMsg || pruneMsg}</p>
          )}
        </section>

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
