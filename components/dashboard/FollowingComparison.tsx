"use client";

import { useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import FollowingTrendChart, {
  FOLLOWING_SERIES_COLORS,
  parseFollowingComparisonPayload,
} from "@/components/dashboard/FollowingTrendChart";
import UserAvatar from "@/components/UserAvatar";

import type { FollowingComparisonUser } from "@/components/dashboard/FollowingTrendChart";

// ============================================
// FollowingComparison — フォロー中ユーザーとの歩数比較グラフ
// ============================================

export default function FollowingComparison() {
  const t = useTranslations("Follow");
  const [data, setData] = useState<FollowingComparisonUser[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [period, setPeriod] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(false);

    fetch(`/api/user/following-comparison?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((json: unknown) => {
        if (!cancelled) {
          const payload = parseFollowingComparisonPayload(json);
          if (payload === null) throw new Error("invalid comparison response");
          setData(payload.users);
          setDates(payload.dates);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, retryCount]);

  // 最大歩数（バーの最大幅の基準）
  const maxSteps = useMemo(() => {
    return Math.max(1, ...data.map((u) => u.totalSteps));
  }, [data]);

  if (isLoading) {
    return (
      <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="h-5 bg-gray-200 rounded w-40 animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
              <div className="flex-1 h-4 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex flex-col items-center py-8 text-center" role="alert">
          <span className="text-4xl mb-3">⚠️</span>
          <p className="font-semibold text-gray-700">{t("comparisonError")}</p>
          <button
            onClick={() => setRetryCount((count) => count + 1)}
            className="mt-4 min-h-11 px-4 py-2 rounded-lg text-white text-sm font-medium hover:scale-105 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
            style={{ background: "var(--theme-primary)" }}
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (data.length <= 1) {
    return null; // 自分だけでは比較できない
  }

  return (
    <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-visible hover:shadow-lg transition-shadow">
      {/* ヘッダー */}
      <div className="px-5 pt-5 pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[var(--theme-primary-light)] rounded-lg">
            <svg
              className="w-4 h-4 text-[var(--theme-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-gray-900">
            📊 {t("stepComparison")}
          </h3>
        </div>

        {/* 期間切替ボタン */}
        <div className="flex self-end rounded-lg border border-gray-200 overflow-hidden sm:self-auto">
          <button
            onClick={() => setPeriod("WEEKLY")}
            aria-pressed={period === "WEEKLY"}
            className={`min-h-11 px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text)] focus-visible:ring-inset ${
              period === "WEEKLY"
                ? "bg-[var(--theme-primary)] text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t("weekly")}
          </button>
          <button
            onClick={() => setPeriod("MONTHLY")}
            aria-pressed={period === "MONTHLY"}
            className={`min-h-11 px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text)] focus-visible:ring-inset ${
              period === "MONTHLY"
                ? "bg-[var(--theme-primary)] text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t("monthly")}
          </button>
        </div>
      </div>

      {/* バーチャートで比較 */}
      <div className="px-5 pb-5 space-y-3">
        {data.map((user, index) => {
          const barWidth =
            maxSteps > 0 ? (user.totalSteps / maxSteps) * 100 : 0;
          const color =
            FOLLOWING_SERIES_COLORS[
              index % FOLLOWING_SERIES_COLORS.length
            ];

          return (
            <div key={user.userId} className="flex items-center gap-3">
              <UserAvatar src={user.image} name={user.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p
                    className={`text-xs font-semibold truncate ${user.isMe ? "text-[var(--color-primary-strong)]" : "text-gray-700"}`}
                  >
                    {user.isMe ? `⭐ ${user.name}` : user.name}
                  </p>
                  <p className="text-xs font-bold text-gray-900 tabular-nums ml-2 flex-shrink-0">
                    {user.totalSteps.toLocaleString()}
                  </p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${barWidth}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-5">
        <FollowingTrendChart users={data} dates={dates} />
      </div>
    </div>
  );
}
