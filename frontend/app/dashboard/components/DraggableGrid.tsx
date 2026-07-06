'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Article } from '@/lib/types';
import { updateArticlePosition } from '@/lib/api';
import ArticleCard from './ArticleCard';

interface Props {
  articles: Article[];
  onReorder?: (articles: Article[]) => void;
}

function SortableArticle({ article }: { article: Article }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id });

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition]
  );

  return (
    <div ref={setNodeRef} style={style}>
      <ArticleCard
        article={article}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}

export default function DraggableGrid({ articles, onReorder }: Props) {
  const [items, setItems] = useState<Article[]>(articles);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync items when articles reference changes (edition switch)
  useEffect(() => {
    setItems(articles);
  }, [articles]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setItems((prev) => {
        const oldIndex = prev.findIndex((a) => a.id === active.id);
        const newIndex = prev.findIndex((a) => a.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const newItems = [...prev];
        const [removed] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, removed);

        // Persist new positions
        setSaving(true);
        Promise.all(
          newItems.map((article, idx) =>
            updateArticlePosition(article.id, idx).catch((err) =>
              console.error('Failed to update position:', err)
            )
          )
        ).finally(() => {
          setSaving(false);
        });

        if (onReorder) onReorder(newItems);
        return newItems;
      });
    },
    [onReorder]
  );

  const activeArticle = useMemo(
    () => items.find((a) => a.id === activeId) || null,
    [items, activeId]
  );

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <p className="text-lg">Aucun article dans cette édition.</p>
        <p className="text-sm mt-2">Attendez le prochain cycle de collecte ou déclenchez une collecte manuelle.</p>
      </div>
    );
  }

  return (
    <div>
      {saving && (
        <div className="fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-gray-400 shadow-lg z-50">
          Sauvegarde...
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {items.map((article) => (
              <SortableArticle key={article.id} article={article} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeArticle && (
            <div className="opacity-90">
              <ArticleCard article={activeArticle} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
