import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string;
  children?: React.ReactNode;
}

export const EmptyState = ({
  icon,
  title,
  subtitle,
  className,
  children,
}: EmptyStateProps) => (
  <div
    className={`flex flex-col items-center justify-center text-center ${className ?? ""}`}
  >
    <div className="flex h-16 w-16 items-center justify-center kk-radius-md bg-[var(--kk-smoke)]">
      {icon}
    </div>
    <div className="mt-4 text-lg font-medium text-[var(--kk-ink)]">{title}</div>
    <div className="mt-1 text-sm text-[var(--kk-ash)]">{subtitle}</div>
    {children}
  </div>
);
