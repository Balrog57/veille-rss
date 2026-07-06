import type { Article } from '@/lib/types';

interface Props {
  article: Article;
  dragHandleProps?: Record<string, any>;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

export default function ArticleCard({ article, dragHandleProps, isDragging, style }: Props) {
  const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect fill="#333" width="120" height="80"/><text fill="#666" font-size="12" font-family="sans-serif" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">Pas d&apos;image</text></svg>'
  );

  const pubDate = formatDate(article.pub_date);

  return (
    <article
      className={`bg-zinc-800/80 border border-zinc-700/60 rounded-xl overflow-hidden transition-all duration-200 hover:border-zinc-600 ${
        isDragging ? 'opacity-50 shadow-lg shadow-amber-500/10 scale-[1.02]' : ''
      }`}
      style={style}
    >
      {/* Drag handle */}
      <div
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border-b border-zinc-700/40 cursor-grab active:cursor-grabbing select-none"
        {...dragHandleProps}
      >
        <span className="text-zinc-500 text-xs">⠿</span>
        <span className="text-xs text-zinc-500 truncate">{article.source}</span>
        <span className="ml-auto text-xs text-zinc-600">{pubDate}</span>
      </div>

      <div className="flex gap-4 p-4">
        {/* Image */}
        {article.image_url ? (
          <img
            src={article.image_url}
            alt=""
            className="w-[120px] h-[80px] object-cover rounded-lg flex-shrink-0 bg-zinc-700"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallbackImage;
            }}
          />
        ) : (
          <div className="w-[120px] h-[80px] flex-shrink-0 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-600 text-xs">
            Pas d&apos;image
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-100 mb-1 line-clamp-2">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-400 transition-colors"
            >
              {article.title || 'Sans titre'}
            </a>
          </h3>

          <div className="text-sm text-gray-300 leading-relaxed">
            {article.summary_fallback ? (
              <div className="flex items-start gap-2">
                <span className="inline-block px-1.5 py-0.5 bg-zinc-700 text-zinc-400 text-[10px] font-medium rounded mt-0.5 flex-shrink-0">
                  DESCRIPTION
                </span>
                <p className="line-clamp-3">{article.description || 'Aucune description disponible.'}</p>
              </div>
            ) : (
              <p className="line-clamp-3">{article.summary || 'Aucun résumé disponible.'}</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return '';
  }
}
