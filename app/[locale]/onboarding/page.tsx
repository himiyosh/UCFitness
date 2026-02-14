export const runtime = 'edge';

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import UsernameForm from "@/components/UsernameForm";
import Footer from '@/components/Footer';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect("/");
    }

    // Check if user already has a username
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("username")
        .eq("id", (session.user as any).id)
        .single();

    if (user?.username) {
        redirect("/"); // Already setup, go to dashboard
    }

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
                    Welcome to UC Fitness!
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Please set a unique User ID to get started.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <UsernameForm isOnboarding={true} />
                </div>
            </div>
            <Footer />
        </main>
    );
}

