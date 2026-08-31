import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  CalendarDays,
  Circle,
  Clock,
  DollarSign,
  Star,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { useVendorDashboardStats } from "@/hooks/useVendorDashboardStats";
import { useMyReviews } from "@/hooks/useMyReviews";
import { useMyBookings } from "@/hooks/useMyBookings";
import { formatMoneyCents } from "@/lib/utils";

interface OverviewTabProps {
  /** Switch to another dashboard tab. Wired from VendorDashboardPage so the
   *  "Complete profile" CTA on this tab can jump to the Profile tab. */
  onSwitchTab?: (tab: string) => void;
}

/**
 * Overview tab — landing page for the dashboard.
 *
 * Layout mirrors the screenshot:
 *   [ OPEN REQUESTS ] [ PENDING QUOTES ] [ BOOKINGS ] [ REVENUE (MO) ]
 *   [ Upcoming bookings              ] [ Profile strength           ]
 *   [ Recent reviews (full width)                                    ]
 */
export default function OverviewTab({ onSwitchTab }: OverviewTabProps) {
  const { vendor } = useVendorAuth();
  const { data: stats, isLoading: statsLoading } = useVendorDashboardStats();
  const { data: reviews = [], isLoading: reviewsLoading } = useMyReviews();
  const { data: bookings = [] } = useMyBookings();

  const strength = computeProfileStrength(vendor);
  const upcoming = bookings.filter(
    (b) =>
      (b.status === "confirmed" || b.status === "in_progress") && b.event_date,
  );

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Open requests"
          value={statsLoading ? "—" : stats?.openRequests ?? 0}
          icon={Briefcase}
        />
        <KpiTile
          label="Pending quotes"
          value={statsLoading ? "—" : stats?.pendingQuotes ?? 0}
          icon={Clock}
        />
        <KpiTile
          label="Bookings"
          value={statsLoading ? "—" : stats?.bookings ?? 0}
          icon={Calendar}
        />
        <KpiTile
          label="Revenue (mo)"
          value={
            statsLoading
              ? "—"
              : formatMoneyCents(stats?.revenueThisMonth ?? 0, stats?.currency)
          }
          icon={DollarSign}
        />
      </div>

      {/* Upcoming + Profile strength */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4" />
              Upcoming bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nothing scheduled. When organizers accept a quote, bookings appear here.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {upcoming.slice(0, 5).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div className="min-w-0 pr-4">
                      <div className="truncate font-medium text-foreground">
                        {b.summary}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.event_date}
                      </div>
                    </div>
                    <div className="num shrink-0 text-sm font-medium">
                      {formatMoneyCents(b.total, b.currency)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              Profile strength
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium text-foreground">
                {strength.percent}% complete
              </div>
              <div className="text-xs text-muted-foreground">
                {strength.remaining.length} more{" "}
                {strength.remaining.length === 1 ? "step" : "steps"}
              </div>
            </div>
            <Progress value={strength.percent} />
            <ul className="space-y-2 pt-2">
              {strength.items.map((it) => (
                <li
                  key={it.label}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Circle
                    className={
                      it.done
                        ? "h-3.5 w-3.5 fill-foreground text-foreground"
                        : "h-3.5 w-3.5 text-muted-foreground/50"
                    }
                  />
                  <span className={it.done ? "text-foreground line-through decoration-muted-foreground/40" : ""}>
                    {it.label}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => onSwitchTab?.("profile")}
            >
              Complete profile
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent reviews */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Star className="h-4 w-4" />
            Recent reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviewsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No reviews yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {reviews.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={
                          i < r.rating
                            ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                            : "h-3.5 w-3.5 text-muted-foreground/30"
                        }
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground">{r.comment ?? "—"}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {r.booking_event_date
                        ? `Event on ${r.booking_event_date}`
                        : "Booking"}
                      {" · "}
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function KpiTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between">
          <span className="eyebrow">{label}</span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="num text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

interface StrengthChecklistItem {
  label: string;
  done: boolean;
}

interface StrengthResult {
  percent: number;
  items: StrengthChecklistItem[];
  remaining: StrengthChecklistItem[];
}

function computeProfileStrength(
  vendor: ReturnType<typeof useVendorAuth>["vendor"],
): StrengthResult {
  const checks: StrengthChecklistItem[] = [
    { label: "Upload logo", done: !!vendor?.logo_url },
    { label: "Upload cover image", done: !!vendor?.cover_url },
    { label: "Write your bio", done: !!(vendor?.bio && vendor.bio.trim().length > 20) },
    { label: "Add website", done: !!vendor?.website },
    { label: "Years of experience", done: !!vendor?.years_experience },
    { label: "Set response time", done: !!vendor?.response_time_hours },
    { label: "Add a tagline", done: !!vendor?.tagline },
  ];

  const doneCount = checks.filter((c) => c.done).length;
  const percent = Math.round((doneCount / checks.length) * 100);
  const remaining = checks.filter((c) => !c.done);

  return {
    percent,
    items: checks.slice(0, 5),
    remaining,
  };
}
