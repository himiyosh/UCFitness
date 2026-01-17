import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getFitbitActivityTimeSeries, refreshFitbitToken } from "@/lib/fitbit";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 1. Get access token from DB
        const { data: user } = await supabaseAdmin
            .from("users")
            .select("id, access_token, refresh_token")
            .eq("id", (session.user as any).id)
            .single();

        if (!user || !user.access_token) {
            return NextResponse.json({ error: "No Fitbit access token found. Please sign in again." }, { status: 400 });
        }

        let accessToken = user.access_token;
        let stepsSeries: any[] = [];

        // 2. Fetch history from Fitbit (1 year) with Retry Logic
        try {
            stepsSeries = await getFitbitActivityTimeSeries(accessToken, '1y');
        } catch (error: any) {
            // Check for unauthorized/expired token
            if (error.message?.includes("Unauthorized") || error.message?.includes("401")) {
                console.log("Token expired during history sync, refreshing...");

                if (!user.refresh_token) {
                    throw new Error("Token expired and no refresh token available. Please sign in again.");
                }

                try {
                    const newTokens = await refreshFitbitToken(user.refresh_token);
                    accessToken = newTokens.access_token;

                    // Update tokens in DB
                    await supabaseAdmin.from("users").update({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        token_expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
                        updated_at: new Date().toISOString()
                    }).eq("id", user.id);

                    // Retry fetch with new token
                    stepsSeries = await getFitbitActivityTimeSeries(accessToken, '1y');

                } catch (refreshError) {
                    console.error("Failed to refresh token:", refreshError);
                    throw new Error("Session expired. Please sign out and sign in again.");
                }
            } else {
                // Other errors
                throw error;
            }
        }

        if (!stepsSeries || !Array.isArray(stepsSeries)) {
            throw new Error("Invalid response from Fitbit");
        }

        // 3. Prepare upsert data
        const userId = user.id;
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

export const runtime = 'edge';
