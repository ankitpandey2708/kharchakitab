"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Tag as TagIcon } from "lucide-react";
import { getAllTags, createTag } from "@/src/db/db";
import type { Tag } from "@/src/types";
import { TagBadge, TAG_DEFAULT_COLOR, TAG_CREATE_ERROR, sortTagsByName, ColorPickerButton } from "@/src/components/TagBadge";
import { useFocusOnOpen } from "@/src/hooks/useFocusOnOpen";
import { ScrollFade } from "@/src/components/ScrollFade";

interface TagPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onTagCreated?: () => void;
}

export const TagPicker = React.memo(({ selectedIds, onChange, onTagCreated }: TagPickerProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_DEFAULT_COLOR);
  const [isLoading, setIsLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadTags = useCallback(async () => {
    const all = await getAllTags();
    setTags(all);
    return all;
  }, []);

  useEffect(() => { void loadTags(); }, [loadTags]);

  // On mount, purge stale IDs (tags that were deleted since this tx was saved)
  const didPurge = useRef(false);
  useEffect(() => {
    if (didPurge.current || selectedIds.length === 0) return;
    didPurge.current = true;
    getAllTags().then((all) => {
      const validIds = new Set(all.map((t) => t.id));
      const cleaned = selectedIds.filter((id) => validIds.has(id));
      if (cleaned.length !== selectedIds.length) onChange(cleaned);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusOnOpen(isCreating, inputRef);

  const toggle = useCallback((id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else if (selectedIds.length < 3) {
      onChange([...selectedIds, id]);
    }
  }, [selectedIds, onChange]);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || isLoading) return;
    if (selectedIds.length >= 3) {
      setCreateError("Max 3 tags per expense.");
      return;
    }
    setIsLoading(true);
    setCreateError(null);
    try {
      const tag = await createTag(trimmed, newColor);
      setTags((prev) => sortTagsByName([...prev, tag]));
      onChange([...selectedIds, tag.id]);
      setNewName("");
      setNewColor(TAG_DEFAULT_COLOR);
      setIsCreating(false);
      onTagCreated?.();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : TAG_CREATE_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [newName, newColor, selectedIds, onChange, isLoading, onTagCreated]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); void handleCreate(); }
    if (e.key === "Escape") { setIsCreating(false); setNewName(""); setCreateError(null); }
  }, [handleCreate]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
          Tags
        </div>
        <button
          type="button"
          onClick={() => setIsCreating((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-semibold text-[var(--kk-ember)] hover:opacity-80 transition-opacity"
        >
          <Plus className="h-3 w-3" />
          New tag
        </button>
      </div>

      {isCreating && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--kk-smoke-heavy)] bg-[var(--kk-cream)] p-2.5">
          <ColorPickerButton value={newColor} onChange={setNewColor} />
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setCreateError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Tag name…"
            maxLength={24}
            className={`min-w-0 flex-1 bg-transparent text-sm placeholder:text-[var(--kk-ash)] outline-none ${createError ? "text-[var(--kk-danger)]" : "text-[var(--kk-ink)]"}`}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!newName.trim() || isLoading}
            className="rounded-full bg-[var(--kk-ember)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40 transition-opacity"
          >
            Add
          </button>
        </div>
      )}
      {createError && (
        <p className="text-[11px] text-[var(--kk-danger)]">{createError}</p>
      )}

      {tags.length === 0 && !isCreating ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--kk-smoke-heavy)] px-3 py-2.5 text-xs text-[var(--kk-ash)]">
          <TagIcon className="h-3.5 w-3.5 flex-shrink-0" />
          No tags yet — create one to organize expenses
        </div>
      ) : (
        <div className="space-y-1.5">
          <ScrollFade className="pb-0.5">
          <div className="flex gap-1.5 pr-6">
            {tags.map((tag) => {
              const isSelected = selectedIds.includes(tag.id);
              const atLimit = !isSelected && selectedIds.length >= 3;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className={`flex-shrink-0 transition-all ${isSelected
                      ? "opacity-100"
                      : atLimit
                        ? "opacity-25 cursor-not-allowed"
                        : "opacity-50 hover:opacity-80"
                    }`}
                >
                  <TagBadge tag={tag} size="sm" />
                </button>
              );
            })}
          </div>
          </ScrollFade>
          {selectedIds.length >= 3 && (
            <p className="text-[11px] text-[var(--kk-ash)]">Max 3 tags per expense</p>
          )}
        </div>
      )}
    </div>
  );
});

TagPicker.displayName = "TagPicker";
