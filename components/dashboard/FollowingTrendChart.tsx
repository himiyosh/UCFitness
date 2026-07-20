"use client";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
export interface FollowingComparisonUser {
  userId: string;
  name: string | null;
  image: string | null;
  username: string | null;
  isMe: boolean;
  totalSteps: number;
  dailySteps: { date: string; steps: number; hasRecord: boolean }[];
}
interface TrendPoint {
  date: string;
  [userId: string]: string | number | null;
}
interface FollowingTrendChartProps {
  users: readonly FollowingComparisonUser[];
  dates: readonly string[];
}
export const FOLLOWING_SERIES_COLORS = [
  "var(--color-primary-strong)", "var(--color-success-strong)", "var(--color-reward-strong)",
  "var(--color-competition-strong)", "var(--color-primary-strong)",
] as const;
const SERIES_STYLES = ["solid", "dashed", "dotted", "double", "groove"] as const;
const SERIES_DASHES = [undefined, "6 3", "2 2", "8 3 2 3", "10 3"] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export function parseFollowingComparisonPayload(
  value: unknown,
): { users: FollowingComparisonUser[]; dates: string[] } | null {
  if (!isRecord(value) || !Array.isArray(value.comparison)) return null;
  const dates = Array.isArray(value.dates) && value.dates.every((date) => typeof date === "string")
    ? value.dates : value.comparison.length === 0 ? [] : null;
  if (dates === null) return null;
  const users: FollowingComparisonUser[] = [];
  for (const item of value.comparison) {
    if (!isRecord(item) || typeof item.userId !== "string" || typeof item.isMe !== "boolean" ||
      typeof item.totalSteps !== "number" || !Array.isArray(item.dailySteps)) return null;
    const dailySteps: FollowingComparisonUser["dailySteps"] = [];
    for (const entry of item.dailySteps) {
      if (!isRecord(entry) || typeof entry.date !== "string" ||
        typeof entry.steps !== "number") return null;
      dailySteps.push({ date: entry.date, steps: entry.steps, hasRecord: entry.hasRecord === true });
    }
    users.push({
      userId: item.userId, isMe: item.isMe, totalSteps: item.totalSteps, dailySteps,
      name: typeof item.name === "string" ? item.name : null,
      image: typeof item.image === "string" ? item.image : null,
      username: typeof item.username === "string" ? item.username : null,
    });
  }
  return { users, dates };
}
export function buildFollowingTrendData(
  users: readonly FollowingComparisonUser[],
  dates: readonly string[],
): TrendPoint[] {
  return dates.map((date) => {
    const point: TrendPoint = { date };
    users.forEach((user) => {
      const entry = user.dailySteps.find((day) => day.date === date);
      point[user.userId] = entry?.hasRecord === true ? entry.steps : null;
    });
    return point;
  });
}
export function getFollowingTrendValue(point: TrendPoint, userId: string): number | null {
  const value = point[userId];
  return typeof value === "number" ? value : null;
}
export default function FollowingTrendChart({ users, dates }: FollowingTrendChartProps) {
  const t = useTranslations("Follow");
  const locale = useLocale();
  const shown = users.slice(0, 5);
  const points = buildFollowingTrendData(shown, dates);
  const numbers = new Intl.NumberFormat(locale);
  const dateFormat = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    month: "numeric", day: "numeric", timeZone: "UTC",
  });
  const formatDate = (date: string): string =>
    dateFormat.format(new Date(`${date}T00:00:00Z`));
  const userName = (user: FollowingComparisonUser): string =>
    user.name ?? user.username ?? t("unknownUser");
  const valueText = (point: TrendPoint, user: FollowingComparisonUser): string => {
    const value = getFollowingTrendValue(point, user.userId);
    return value === null ? t("stepsNotRecorded") : `${numbers.format(value)} ${t("stepsUnit")}`;
  };
  const tooltip = ({ active, label }: { active?: boolean; label?: string | number }) => {
    const point = typeof label === "string" ? points.find((row) => row.date === label) : null;
    if (!active || !point) return null;
    return (
      <div className="midnight-solid-panel max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-[var(--color-border)] bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">{formatDate(point.date)}</p>
        <ul className="space-y-1">{shown.map((user) => (
          <li key={user.userId} className="flex min-w-0 gap-2 text-xs">
            <span className="min-w-0 flex-1 break-words text-[var(--color-text-muted)]">{userName(user)}</span>
            <span className="shrink-0 tabular-nums text-[var(--color-text)]">{valueText(point, user)}</span>
          </li>
        ))}</ul>
      </div>
    );
  };
  if (points.length === 0 || shown.length === 0) return null;
  return (
    <section aria-label={t("dailyTrend")} className="mt-3 border-t border-[var(--color-border)] pt-3">
      <h4 className="text-xs font-bold text-[var(--color-text-muted)]">{t("dailyTrend")}</h4>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("trendExplanation")}</p>
      <div className="mt-2 h-44 min-w-0 overflow-visible" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={points} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, "auto"]} tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickFormatter={(value: number) => value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`}
              tickLine={false} axisLine={false} width={42} />
            <Tooltip content={tooltip} filterNull={false} cursor={{ stroke: "var(--color-border)" }} />
            {shown.map((user, index) => (
              <Line key={user.userId} type="linear" dataKey={user.userId} name={userName(user)}
                stroke={FOLLOWING_SERIES_COLORS[index % FOLLOWING_SERIES_COLORS.length]}
                strokeDasharray={SERIES_DASHES[index % SERIES_DASHES.length]}
                strokeWidth={user.isMe ? 3 : 2} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1" aria-label={t("stepComparison")}>
        {shown.map((user, index) => (
          <li key={user.userId} className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span aria-hidden="true" className="h-0 w-5 shrink-0 border-t-2"
              style={{ borderTopColor: FOLLOWING_SERIES_COLORS[index % FOLLOWING_SERIES_COLORS.length],
                borderTopStyle: SERIES_STYLES[index % SERIES_STYLES.length] }} />
            <span className="min-w-0 break-words">{userName(user)}</span>
          </li>
        ))}
      </ul>
      <div className="sr-only"><table>
        <caption>{t("comparisonTableCaption")}</caption>
        <thead><tr><th scope="col">{t("date")}</th>{shown.map((user) =>
          <th key={user.userId} scope="col">{userName(user)}</th>)}</tr></thead>
        <tbody>{points.map((point) => <tr key={point.date}>
          <th scope="row">{point.date}</th>
          {shown.map((user) => <td key={user.userId}>{valueText(point, user)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>
  );
}
