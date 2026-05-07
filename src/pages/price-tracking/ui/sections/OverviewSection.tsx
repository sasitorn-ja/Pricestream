import { Bell, BellDot, MoonStar, SunMedium } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { appShellClass, summaryCardClass } from "../../../../components/ui/styles";
import { cn } from "../../../../lib/utils";

type OverviewSectionProps = {
  dashboardLabel: string;
  baselineStart: string;
  baselineEnd: string;
  campaignStart: string;
  avgIncreaseLabel: string;
  targetHitShareLabel: string;
  summaryDateRange: string;
  dashboardLoading: boolean;
  showDashboardSlowNotice: boolean;
  themeMode: "dark" | "light";
  pendingNotificationCount: number;
  notificationLabel: string;
  hasDashboardAlert: boolean;
  onToggleTheme: () => void;
  onOpenNotifications: () => void;
  onOpenCalcHelp: (key: "baselineDefinition" | "totalIncrease" | "averageToTarget") => void;
};

export function OverviewSection({
  dashboardLabel,
  baselineStart,
  baselineEnd,
  campaignStart,
  avgIncreaseLabel,
  targetHitShareLabel,
  summaryDateRange,
  dashboardLoading,
  showDashboardSlowNotice,
  themeMode,
  pendingNotificationCount,
  notificationLabel,
  hasDashboardAlert,
  onToggleTheme,
  onOpenNotifications,
  onOpenCalcHelp
}: OverviewSectionProps) {
  return (
    <div className={appShellClass}>
      <header>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <h1 className="m-0 text-[clamp(1.55rem,2.6vw,2.25rem)] font-black leading-tight text-[var(--foreground)]">
              {dashboardLabel}
            </h1>
            <p className="m-0 text-sm leading-6 text-[var(--muted-foreground)] md:text-[0.95rem]">
              NP_AVG = net price | Baseline {baselineStart} ถึง {baselineEnd} | ติดตามตั้งแต่ {campaignStart}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start xl:self-center">
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "relative h-10 w-10 rounded-[14px] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)]",
                pendingNotificationCount > 0 && "border-[var(--primary)] bg-[var(--primary-soft)]"
              )}
              onClick={onOpenNotifications}
              aria-label={notificationLabel}
              title={notificationLabel}
            >
              {hasDashboardAlert ? <BellDot className="size-4.5" /> : <Bell className="size-4.5" />}
              {pendingNotificationCount > 0 ? (
                <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-bold text-[var(--primary-foreground)]">
                  {pendingNotificationCount > 9 ? "9+" : pendingNotificationCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-[14px] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)]"
              onClick={onToggleTheme}
              aria-label={themeMode === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
              title={themeMode === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {themeMode === "dark" ? <SunMedium className="size-4.5" /> : <MoonStar className="size-4.5" />}
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <article className={summaryCardClass}>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="absolute top-0 right-0 h-8 rounded-xl px-3 text-xs"
              onClick={() => onOpenCalcHelp("totalIncrease")}
            >
              วิธีคำนวณ
            </Button>
            <div>
              <span className="block max-w-[calc(100%-88px)] text-sm text-[var(--muted-foreground)]">
                Avg increase
              </span>
              <strong className="mt-1 block text-[1.7rem] font-black leading-tight text-[var(--foreground)]">
                {avgIncreaseLabel} บาท B/CU
              </strong>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">คำนวณจากข้อมูล {summaryDateRange}</p>
        </article>
        <article className={summaryCardClass}>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="absolute top-0 right-0 h-8 rounded-xl px-3 text-xs"
              onClick={() => onOpenCalcHelp("averageToTarget")}
            >
              วิธีคำนวณ
            </Button>
            <div>
              <span className="block max-w-[calc(100%-88px)] text-sm text-[var(--muted-foreground)]">
                Average to target
              </span>
              <strong className="mt-1 block text-[1.7rem] font-black leading-tight text-[var(--foreground)]">
                {targetHitShareLabel}
              </strong>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
            สัดส่วนโครงการที่ขึ้นถึง 300 บาท B/CU ขึ้นไป {summaryDateRange}
          </p>
        </article>
      </section>

      {dashboardLoading ? (
        <div className="rounded-[18px] border border-[var(--border-strong)] bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          {showDashboardSlowNotice
            ? "ข้อมูลกำลังคำนวณนานกว่าปกติ แสดงข้อมูลเดิมไว้ก่อนจนกว่าจะโหลดเสร็จ"
            : "กำลังอัปเดตข้อมูลตาม filter..."}
        </div>
      ) : null}
    </div>
  );
}
