import { Link } from "react-router-dom";
import { Store } from "lucide-react";

interface AuthShellProps {
  children: React.ReactNode;
  /** Optional footer node beneath the card (e.g. "Already have an account?"). */
  footer?: React.ReactNode;
}

/**
 * Full-viewport auth chrome shared by every /vendor/signup and /vendor/login
 * screen. Keeps the brand mark, background, and vertical centering identical
 * across both flows so users never feel they've landed in a different app.
 */
export function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Store className="h-4 w-4" />
            Vendor Connect
          </Link>
          <a
            href="https://illuxus.com"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            illuxus
          </a>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {children}
          {footer ? (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
