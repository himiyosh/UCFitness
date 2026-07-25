"use client";
import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { clearPushRecipientState, synchronizePushRecipientForSession } from "@/lib/push-recipient-state";
import type { ReactNode } from "react";
function PushRecipientLifecycle(): ReactNode {
    const { data: session, status } = useSession();
    const t = useTranslations("Notifications");
    const appliedUserRef = useRef<string | null>(), requestRef = useRef(0);
    const [retryKey, setRetryKey] = useState(0), [failed, setFailed] = useState(false);
    const userId = status === "authenticated" ? String(session?.user?.id ?? "") :
        status === "unauthenticated" ? null : undefined;
    useEffect(() => {
        if (userId === undefined) { requestRef.current += 1; return; }
        if (appliedUserRef.current === userId && retryKey === 0) return;
        const requestId = ++requestRef.current, controller = new AbortController(); setFailed(false);
        void (async () => {
            try {
                if (userId === "") throw new Error("Invalid session");
                if (userId === null) await clearPushRecipientState();
                else await synchronizePushRecipientForSession(controller.signal);
                if (requestRef.current === requestId) appliedUserRef.current = userId;
            } catch { if (requestRef.current === requestId) setFailed(true); }
        })();
        return () => controller.abort();
    }, [retryKey, userId]);
    if (!failed) return null;
    return (
        <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[100] mx-auto max-w-md rounded-xl border border-[var(--color-danger)] bg-[var(--color-surface)] p-3 shadow-lg" role="alert">
            <p className="text-sm font-semibold text-[var(--color-danger)]">{t("recipientSyncError")}</p>
            <button type="button" onClick={() => setRetryKey((value) => value + 1)}
                className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
                {t("retryRecipientSync")}</button>
        </div>
    );
}
export const AuthProvider = ({ children }: { children: ReactNode }) => (
    <SessionProvider><PushRecipientLifecycle />{children}</SessionProvider>
);
