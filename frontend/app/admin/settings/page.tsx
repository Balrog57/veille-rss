'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkAuth, logout, getSettings, updateSettings, pruneNow, triggerRunTick } from '@/lib/api';
import type { Settings as SettingsType } from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);
  const [ticking, setTicking] = useState(false);
  const [tickMsg, setTickMsg] = useState<string | null>(null);

  // Form state (allows editing before save)
  const [tz, setTz] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [retentionDays, setRetentionDays] = useState(90);
  const [maxAgeHours, setMaxAgeHours] = useState(48);
  const [pruneDaysInput, setPruneDaysInput] = useState<number | ''>('');

  useEffect(() => {
    checkAuth()
      .then(() => setAuthChecked(true))
      .catch(() => router.push('/login'));
  }, [router]);

  const loadSettings = useCallback(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setTz(s.timezone);
        setCronExpr(s.cronExpr);
        setRetentionDays(s.retentionDays);
        setMaxAgeHours(s.maxArticleAgeHours);
      })
      .catch((err) => setSaveMsg(`Erreur: ${err.message}`));
  }, []);

  useEffect(() => {
    if (authChecked) loadSettings();
  }, [authChecked, loadSettings]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateSettings({
        timezone: tz,
        cronExpr,
        retentionDays: Number(retentionDays),
        maxArticleAgeHours: Number(maxAgeHours),
      });
      setSettings(updated);
      setSaveMsg('✓ Paramètres enregistrés. Le cron a été relancé si nécessaire.');
    } catch (err: any) {
      setSaveMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrune = async (overrideDays?: number) => {
    setPruning(true);
    setPruneMsg(null);
    try {
      const days = overrideDays ?? (pruneDaysInput === '' ? undefined : Number(pruneDaysInput));
      const result = await pruneNow(days);
      setPruneMsg(
        `🗑️ ${result.deletedEditions} édition(s) et ${result.deletedArticles} article(s) supprimés (rétention: ${result.days}j). ` +
          `Avant: ${result.editionsBefore} édition(s) → Après: ${result.editionsAfter}.`
      );
      loadSettings();
    } catch (err: any) {
      setPruneMsg(`❌ ${err.message}`);
    } finally {
      setPruning(false);
    }
  };

  const handleRunTick = async () => {
    setTicking(true);
    setTickMsg(null);
    try {
      const result = await triggerRunTick();
      if (result.skipped) {
        setTickMsg('⏭️ Édition existante pour ce créneau — utilise "Forcer" pour la remplacer.');
      } else {
        setTickMsg(`✅ Édition #${result.editionId} créée avec ${result.articleCount ?? 0} article(s).`);
      }
    } catch (err: any) {
      setTickMsg(`❌ ${err.message}`);
    } finally {
      setTicking(false);
    }
  };

  if (!authChecked || !settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-amber-500 animate-pulse">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-amber-400">Veille RSS</h1>
            <nav className="hidden sm:flex items-center gap-3 ml-6">
              <a href="/dashboard" className="text-sm text-gray-300 hover:text-amber-400 transition-colors">Tableau de bord</a>
              <a href="/admin/feeds" className="text-sm text-gray-300 hover:text-amber-400 transition-colors">Flux</a>
              <a href="/admin/settings" className="text-sm text-amber-400">Paramètres</a>
            </nav>
          </div>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Schedule & Timezone */}
        <section className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Planification &amp; fuseau horaire</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Le cron s'exécute dans le fuseau choisi. Modifier l'expression redémarre automatiquement le cron.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-300 mb-1">Fuseau horaire (IANA)</label>
              <input
                type="text"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                placeholder="Europe/Paris"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-zinc-500 mt-1">Ex: Europe/Paris, Europe/London, America/New_York, UTC</p>
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-1">Expression cron (5 champs)</label>
              <input
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 */6 * * *"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                <code>0 */6 * * *</code> = toutes les 6h &middot; <code>0 0,6,12,18 * * *</code> = 4 fois/jour aux heures piles &middot; <code>0 0 * * *</code> = 1 fois/jour à minuit
              </p>
            </div>
          </div>
        </section>

        {/* Retention */}
        <section className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Rétention &amp; nettoyage</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Les articles plus vieux que la rétention sont supprimés chaque nuit à 03:05 (heure du fuseau).
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Rétention (jours) — <span className="text-amber-400 font-mono">{retentionDays}</span>
              </label>
              <input
                type="range"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>1j</span><span>30j</span><span>90j</span><span>180j</span><span>365j</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Âge max d'un article dans une édition (heures) — <span className="text-amber-400 font-mono">{maxAgeHours}</span>
              </label>
              <input
                type="range"
                min={1}
                max={168}
                value={maxAgeHours}
                onChange={(e) => setMaxAgeHours(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Un article publié il y a plus de N heures est ignoré. Évite qu'un article publié à 14h apparaisse dans l'édition de 12h.
              </p>
            </div>
          </div>
        </section>

        {/* Save */}
        <section className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-900 font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
          </button>
          {saveMsg && (
            <p className="text-sm text-zinc-300 mt-3">{saveMsg}</p>
          )}
        </section>

        {/* Trash (manual prune) */}
        <section className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-1">
            <span className="text-amber-400">🗑️</span> Corbeille — nettoyage manuel
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Force le nettoyage immédiat. Utile quand tu diminues la rétention et veux purger tout de suite.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Supprimer tout ce qui a plus de...</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={pruneDaysInput}
                  onChange={(e) => setPruneDaysInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={`${settings.retentionDays} (défaut)`}
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="flex items-center text-sm text-zinc-400">jours</span>
              </div>
            </div>
            <button
              onClick={() => handlePrune()}
              disabled={pruning}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {pruning ? 'Suppression...' : '🗑️ Vider'}
            </button>
          </div>
          {pruneMsg && (
            <p className="text-sm text-zinc-300 mt-3">{pruneMsg}</p>
          )}
        </section>

        {/* Manual tick */}
        <section className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Collecte manuelle</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Déclenche un tick de pipeline immédiatement. "Collecter" depuis le dashboard fait déjà ça.
          </p>
          <button
            onClick={handleRunTick}
            disabled={ticking}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-900 font-semibold rounded-lg transition-colors"
          >
            {ticking ? 'Collecte...' : 'Collecter maintenant'}
          </button>
          {tickMsg && (
            <p className="text-sm text-zinc-300 mt-3">{tickMsg}</p>
          )}
        </section>

        {/* Current state */}
        <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500">
          <p>État actuel : cron <code className="text-zinc-300">{settings.cronExpr}</code> en <code className="text-zinc-300">{settings.timezone}</code>, rétention {settings.retentionDays}j, âge max {settings.maxArticleAgeHours}h.</p>
        </section>
      </main>
    </div>
  );
}
