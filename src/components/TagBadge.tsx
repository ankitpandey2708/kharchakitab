"use client";

import React from "react";
import type { Tag } from "@/src/types";

export const TAG_DEFAULT_COLOR = "#ff6b35";
export const TAG_CREATE_ERROR = "Could not create tag.";

export const sortTagsByName = <T extends { name: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => a.name.localeCompare(b.name));

interface TagBadgeProps {
  tag: Tag;
  size?: "sm" | "xs";
  onRemove?: () => void;
}

export const TagBadge = React.memo(({ tag, size = "sm", onRemove }: TagBadgeProps) => {
  const isXs = size === "xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${
        isXs ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{
        backgroundColor: `${tag.color}18`,
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      <span
        className={`rounded-full flex-shrink-0 ${isXs ? "h-1.5 w-1.5" : "h-2 w-2"}`}
        style={{ backgroundColor: tag.color }}
      />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 leading-none opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Remove tag ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
});

TagBadge.displayName = "TagBadge";

interface ColorPickerButtonProps {
  value: string;
  onChange: (color: string) => void;
}

export const ColorPickerButton = React.memo(({ value, onChange }: ColorPickerButtonProps) => (
  <label className="flex-shrink-0 cursor-pointer" title="Pick color">
    <span
      className="block h-7 w-7 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-110"
      style={{ backgroundColor: value, outline: `2px solid ${value}40` }}
    />
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sr-only"
    />
  </label>
));
ColorPickerButton.displayName = "ColorPickerButton";
