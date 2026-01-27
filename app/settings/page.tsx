import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import UserMenu from "@/components/UserMenu";
import Link from "next/link";
import Breadcrumbs from "@/components/Breadcrumbs";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export default async function SettingsPage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect("/");
    }

    // Fetch current user data
    const { data: user } = await supabase
        .from("users")
        .select("name, image, username, is_custom_image, step_goal, banner_url")
        .eq("id", (session.user as any).id)
        .single();

    if (!user) {
        return <div>User not found</div>;
    }

    return (
        <main className="min-h-screen bg-white">
            {/* Header (Consistent with Profile) */}
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:opacity-80 transition-opacity">
                                UCFitness
                            </h1>
                        </Link>
                    </div>
                    <UserMenu user={session.user} />
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-6">
                    <Breadcrumbs items={[{ label: 'Settings' }]} />
                    <h1 className="text-3xl font-bold text-gray-900 mt-2">Settings</h1>
                    <p className="text-gray-500">Manage your profile and preferences.</p>
                </div>

                <SettingsForm user={user} />
            </div>
        </main>
    );
}
