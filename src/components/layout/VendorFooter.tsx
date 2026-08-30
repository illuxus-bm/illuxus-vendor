import { illuxusOrigin } from "@/lib/utils";

/**
 * Global footer mirroring the illuxus main-app footer so both products share
 * the same trust surface. Links point at the main app so nothing here needs
 * to be re-built inside the vendor portal.
 */
export function VendorFooter() {
  const origin = illuxusOrigin();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border/60 bg-background">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-4 sm:px-6">
        <div className="space-y-2">
          <div className="text-lg font-semibold tracking-tight text-foreground">
            illuxus
          </div>
          <p className="text-sm text-muted-foreground">
            The modern event platform.
          </p>
        </div>

        <FooterCol title="Product">
          <FooterLink href={`${origin}/features`}>Features</FooterLink>
          <FooterLink href={`${origin}/pricing`}>Pricing</FooterLink>
        </FooterCol>

        <FooterCol title="Company">
          <FooterLink href={`${origin}/about`}>About</FooterLink>
          <FooterLink href={`${origin}/contact`}>Contact</FooterLink>
        </FooterCol>

        <FooterCol title="Legal">
          <FooterLink href={`${origin}/privacy`}>Privacy</FooterLink>
          <FooterLink href={`${origin}/terms`}>Terms</FooterLink>
        </FooterCol>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          © {year} illuxus. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="eyebrow text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="block text-sm text-accent hover:underline"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}
