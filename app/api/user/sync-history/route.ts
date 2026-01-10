import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getFitbitActivityTimeSeries } from "@/lib/fitbit";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 1. Get access token from DB
        // Note: In a production app, we should handle token refresh here if it's expired.
        // For this prototype, we assume the token from the last login is still valid or user just logged in.
        const { data: user } = await supabaseAdmin
            .from("users")
            .select("access_token")
            .eq("id", (session.user as any).id)
            .single();

        if (!user || !user.access_token) {
            return NextResponse.json({ error: "No Fitbit access token found. Please sign in again." }, { status: 400 });
        }

        // 2. Fetch history from Fitbit (1 year)
        const stepsSeries = await getFitbitActivityTimeSeries(user.access_token, '1y');

        // stepsSeries is array of { dateTime: 'YYYY-MM-DD', value: 'string_number' }

        if (!stepsSeries || !Array.isArray(stepsSeries)) {
            throw new Error("Invalid response from Fitbit");
        }

        // 3. Prepare upsert data
        const userId = (session.user as any).id;
        const records = stepsSeries.map((entry: any) => ({
            user_id: userId,
            date: entry.dateTime,
            steps: parseInt(entry.value, 10),
            updated_at: new Date().toISOString()
        }));

        // 4. Upsert to daily_steps
        const { error } = await supabaseAdmin
            .from("daily_steps")
            .upsert(records, { onConflict: 'user_id,date' });

        if (error) {
            console.error("Supabase upsert error:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true, count: records.length });

    } catch (error: any) {
        console.error("Sync history error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
