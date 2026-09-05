import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Lightweight Checkbox with an API that matches shadcn/Radix's
 * (`checked` + `onCheckedChange`), but backed by a plain native
 * `<input type="checkbox">`. The vendor project intentionally doesn't
 * install `@radix-ui/react-checkbox` — writing a native wrapper keeps
 * the dependency graph slim and avoids yet another Radix moving part.
 *
 * `checked` accepts boolean only. If you need indeterminate later, add
 * an `"indeterminate"` value here and set `input.indeterminate = true`
 * via a ref in useEffect.
 */
export interface CheckboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "checked" | "onChange"
  > {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { className, checked, onCheckedChange, disabled, id, ...props },
    ref,
  ) {
    return (
      <label
        className={cn(
          "peer relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow bg-background cursor-pointer",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          checked && "bg-primary text-primary-foreground border-primary",
          className,
        )}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked ?? false}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="absolute inset-0 h-full w-full cursor-inherit opacity-0"
          {...props}
        />
        {checked && (
          <Check className="h-3 w-3 text-primary-foreground pointer-events-none" />
        )}
      </label>
    );
  },
);
