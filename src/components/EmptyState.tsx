import * as React from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Optional Lucide icon or any React node rendered above the message. */
  icon?: React.ReactNode;
  /** Primary line — one short sentence. */
  message: string;
  /** Optional supporting line under the message. */
  hint?: string;
  className?: string;
}

/**
 * Muted single-card empty state used across every tab. Matches the design
 * language of the screenshots: bordered card, centered muted text, no shadow.
 */
export function EmptyState({ icon, message, hint, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-muted-foreground/60" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint ? <p className="text-xs text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}
