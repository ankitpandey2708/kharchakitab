// PERF-RERENDER: Wrapped in React.memo to prevent re-renders when parent updates but category prop stays the same

import { memo } from "react";
import { CATEGORY_ICON_MAP, type CategoryKey } from "@/src/config/categories";

interface CategoryIconProps {
  category: string;
  className?: string;
}

export const CategoryIcon = memo(({ category, className }: CategoryIconProps) => {
  const key = Object.prototype.hasOwnProperty.call(CATEGORY_ICON_MAP, category)
    ? (category as CategoryKey)
    : "Other";
  const Icon = CATEGORY_ICON_MAP[key];
  return <Icon className={className} />;
});

CategoryIcon.displayName = "CategoryIcon";
