"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Pencil, Plus, Trash2, Check, X, Tag as TagIcon } from "lucide-react";
import { getAllTags, createTag, updateTag, deleteTag, countTransactionsWithTag, removeTagFromAllTransactions } from "@/src/db/db";
import type { Tag } from "@/src/types";
import { useEscapeKey } from "@/src/hooks/useEscapeKey";
import { useBackButton } from "@/src/hooks/useBackButton";
import { TAG_DEFAULT_COLOR, TAG_CREATE_ERROR, sortTagsByName, ColorPickerButton } from "@/src/components/TagBadge";
import { useFocusOnOpen } from "@/src/hooks/useFocusOnOpen";

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onTagsChanged?: () => void;
}

interface TagRowProps {
  tag: Tag;
  onUpdated: (tag: Tag) => void;
  onDeleted: (id: string) => void;
}

const TagRow = React.memo(({ tag, onUpdated, onDeleted }: TagRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkedCount, setLinkedCount] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useFocusOnOpen(isEditing, inputRef);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaveError(null);
    try {
      await updateTag(tag.id, { name: trimmed, color });
      onUpdated({ ...tag, name: trimmed, color });
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save tag.");
    }
  }, [draft, color, tag, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      const count = await countTransactionsWithTag(tag.id);
      setLinkedCount(count);
      setConfirmDelete(true);
      return;
    }
    await removeTagFromAllTransactions(tag.id);
    await deleteTag(tag.id);
    onDeleted(tag.id);
  }, [confirmDelete, tag, onDeleted]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); void handleSave(); }
    if (e.key === "Escape") { setIsEditing(false); setDraft(tag.name); setColor(tag.color); }
  }, [handleSave, tag.name, tag.color]);

  return (
    <div className="rounded-[var(--kk-radius-md)] border border-[var(--kk-smoke)] bg-white p-3">
      {isEditing ? (
        <div className="space-y-2.5">
          <div className="flex flex-col gap-1.5">
            {saveError && (
              <p className="text-[11px] text-[var(--kk-danger)]">{saveError}</p>
            )}
          <div className="flex items-center gap-2">
            <ColorPickerButton value={color} onChange={setColor} />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setSaveError(null); }}
              onKeyDown={handleKeyDown}
              maxLength={24}
              className={`min-w-0 flex-1 rounded-lg border bg-[var(--kk-cream)] px-3 py-1.5 text-sm text-[var(--kk-ink)] outline-none ${saveError ? "border-[var(--kk-danger)] focus:border-[var(--kk-danger)]" : "border-[var(--kk-smoke-heavy)] focus:border-[var(--kk-ember)]"}`}
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-sage-bg)] text-[var(--kk-sage)]"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setIsEditing(false); setDraft(tag.name); setColor(tag.color); }}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--kk-ash)] hover:bg-[var(--kk-smoke)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <span className="truncate text-sm font-medium text-[var(--kk-ink)]">{tag.name}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => { setIsEditing(true); setConfirmDelete(false); }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--kk-ash)] hover:bg-[var(--kk-smoke)] active:bg-[var(--kk-smoke)] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <div className="flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="flex h-8 items-center justify-center rounded-full bg-[var(--kk-danger)]/10 px-2 text-xs font-semibold text-[var(--kk-danger)] transition-colors"
                  >
                    Delete?
                  </button>
                  {linkedCount ? (
                    <span className="text-[10px] text-[var(--kk-ash)] pr-1">removes from {linkedCount} txn{linkedCount !== 1 ? "s" : ""}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setLinkedCount(null); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--kk-ash)] hover:bg-[var(--kk-smoke)] transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--kk-ash)] hover:bg-[var(--kk-smoke)] active:bg-[var(--kk-smoke)] transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

TagRow.displayName = "TagRow";

export const TagManager = React.memo(({ isOpen, onClose, onTagsChanged }: TagManagerProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_DEFAULT_COLOR);
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(isOpen, onClose);
  useBackButton(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    getAllTags().then(setTags);
  }, [isOpen]);

  useFocusOnOpen(isCreating, newInputRef);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || isSaving) return;
    setIsSaving(true);
    setCreateError(null);
    try {
      const tag = await createTag(trimmed, newColor);
      setTags((prev) => sortTagsByName([...prev, tag]));
      setNewName("");
      setNewColor(TAG_DEFAULT_COLOR);
      setIsCreating(false);
      onTagsChanged?.();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : TAG_CREATE_ERROR);
    } finally {
      setIsSaving(false);
    }
  }, [newName, newColor, isSaving, onTagsChanged]);

  const handleUpdated = useCallback((updated: Tag) => {
    setTags((prev) => sortTagsByName(prev.map((t) => (t.id === updated.id ? updated : t))));
    onTagsChanged?.();
  }, [onTagsChanged]);

  const handleDeleted = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    onTagsChanged?.();
  }, [onTagsChanged]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 320 }}
          className="fixed inset-0 z-[70] flex flex-col bg-[var(--kk-paper)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex-shrink-0 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)] px-4 py-4 safe-area-top">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="kk-icon-btn flex-shrink-0"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold font-[family:var(--font-display)] text-[var(--kk-ink)]">
                  Tags
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-lg px-4 py-4 space-y-3">

              {/* Create form */}
              <AnimatePresence>
                {isCreating && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-[var(--kk-radius-md)] border border-[var(--kk-ember)]/40 bg-white p-3 space-y-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--kk-ash)]">
                        New Tag
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {createError && (
                          <p className="text-[11px] text-[var(--kk-danger)]">{createError}</p>
                        )}
                      <div className="flex items-center gap-2">
                        <ColorPickerButton value={newColor} onChange={(v) => { setNewColor(v); setCreateError(null); }} />
                        <input
                          ref={newInputRef}
                          value={newName}
                          onChange={(e) => { setNewName(e.target.value); setCreateError(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); void handleCreate(); }
                            if (e.key === "Escape") { setIsCreating(false); setNewName(""); setCreateError(null); }
                          }}
                          placeholder="Tag name…"
                          maxLength={24}
                          className={`min-w-0 flex-1 rounded-lg border bg-[var(--kk-cream)] px-3 py-2 text-sm text-[var(--kk-ink)] outline-none ${createError ? "border-[var(--kk-danger)]" : "border-[var(--kk-smoke-heavy)] focus:border-[var(--kk-ember)]"}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreate()}
                          disabled={!newName.trim() || isSaving}
                          className="flex-shrink-0 rounded-full bg-[var(--kk-ember)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsCreating(false); setNewName(""); setCreateError(null); }}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--kk-ash)] hover:bg-[var(--kk-smoke)]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tag list */}
              {tags.length === 0 && !isCreating ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--kk-smoke-heavy)] py-12">
                  <TagIcon className="h-8 w-8 text-[var(--kk-ash)]" />
                  <div className="text-center">
                    <div className="text-sm font-semibold text-[var(--kk-ink)]">No tags yet</div>
                    <div className="mt-1 text-xs text-[var(--kk-ash)]">
                      Create tags to organize expenses your way
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="kk-btn-primary flex items-center gap-1.5 px-4 py-2.5 text-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create first tag
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* "Add tag" inline row — always at top */}
                  {!isCreating && (
                    <button
                      type="button"
                      onClick={() => setIsCreating(true)}
                      className="flex w-full items-center gap-2 rounded-[var(--kk-radius-md)] border border-dashed border-[var(--kk-smoke-heavy)] bg-transparent px-3 py-2.5 text-sm text-[var(--kk-ash)] transition-colors hover:border-[var(--kk-ember)] hover:text-[var(--kk-ember)] active:opacity-70"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add tag
                    </button>
                  )}
                  {tags.map((tag) => (
                    <TagRow
                      key={tag.id}
                      tag={tag}
                      onUpdated={handleUpdated}
                      onDeleted={handleDeleted}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

TagManager.displayName = "TagManager";
