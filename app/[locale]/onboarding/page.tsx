export const runtime = 'edge';

import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

/**
 * /onboarding → /setup へリダイレクト
 * セットアップフローは /setup に統一
 */
export default function OnboardingRedirect() {
    redirect("/setup");
}

