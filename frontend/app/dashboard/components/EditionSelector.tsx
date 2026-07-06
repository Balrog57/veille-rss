import type { Edition } from '@/lib/types';

interface Props {
  editions: Edition[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
}

export default function EditionSelector({ editions, selectedId, onSelect, loading }: Props) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="edition-select" className="text-sm text-gray-400 whitespace-nowrap">
        Édition :
      </label>
      <select
        id="edition-select"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
        disabled={loading || editions.length === 0}
        className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      >
        {editions.length === 0 && (
          <option value="">Aucune édition</option>
        )}
        {editions.map((ed) => (
          <option key={ed.id} value={ed.id}>
            {formatEditionLabel(ed)}
          </option>
        ))}
      </select>
      {loading && (
        <span className="text-xs text-gray-500 animate-pulse">Chargement...</span>
      )}
    </div>
  );
}

function formatEditionLabel(ed: Edition): string {
  try {
    const d = new Date(ed.bucket);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return ed.title || ed.bucket;
  }
}
