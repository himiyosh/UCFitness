import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { refreshFitbitToken } from '@/lib/fitbit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
        return NextResponse.json({ error: 'username parameter is required' }, { status: 400 });
    }

    const report: any = {
        username,
        timestamp: new Date().toISOString(),
        steps: [],
    };

    try {
        // 1. Fetch User from DB
        report.steps.push('Fetching user from DB...');
        const { data: user, error: dbError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (dbError || !user) {
            report.steps.push('User not found in DB');
            report.dbError = dbError;
            return NextResponse.json(report, { status: 404 });
        }

        report.user = {
            id: user.id,
            provider: user.provider,
            has_access_token: !!user.access_token,
            has_refresh_token: !!user.refresh_token,
            token_expires_at: user.token_expires_at,
            token_expires_date: user.token_expires_at ? new Date(user.token_expires_at * 1000).toISOString() : null,
            updated_at: user.updated_at,
        };

        if (user.provider !== 'fitbit') {
            report.steps.push('Provider is not fitbit');
            return NextResponse.json(report);
        }

        if (!user.access_token) {
            report.steps.push('No access token found');
            return NextResponse.json(report);
        }

        // 2. Test Validity (Fetch Profile)
        report.steps.push('Testing token validity (fetching profile)...');
        let accessToken = user.access_token;

        let profileRes = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        report.profileCheck = {
            status: profileRes.status,
            statusText: profileRes.statusText,
        };

        if (profileRes.status === 401) {
            report.steps.push('Token expired (401). Attempting refresh...');

            try {
                if (!user.refresh_token) {
                    throw new Error('No refresh token available');
                }

                const newTokens = await refreshFitbitToken(user.refresh_token);
                report.steps.push('Refresh successful');

                // Update DB with new tokens (Optional for debug, but good to test write)
                // For safety in this debug tool, we might NOT want to write to DB unless intended,
                // but if we want to separate "check" from "fix", maybe we shouldn't write.
                // However, if the token IS expired, we probably WANT to fix it.
                // Let's update it to help the user.

                const { error: updateError } = await supabaseAdmin
                    .from('users')
                    .update({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        token_expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', user.id);

                if (updateError) {
                    report.steps.push('Failed to save new tokens to DB');
                    report.dbUpdateError = updateError;
                } else {
                    report.steps.push('New tokens saved to DB');
                    accessToken = newTokens.access_token; // Use new token for next step

                    // Retry Profile
                    profileRes = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    report.profileCheckRetry = {
                        status: profileRes.status,
                        statusText: profileRes.statusText,
                    };
                }

            } catch (refreshError: any) {
                report.steps.push('Refresh failed');
                report.refreshError = refreshError.message || refreshError;
            }
        }

        if (profileRes.ok) {
            const profileData = await profileRes.json();
            report.fitbitUser = {
                encodedId: profileData.user.encodedId,
                fullName: profileData.user.fullName,
                timezone: profileData.user.timezone,
                avatar: profileData.user.avatar,
                profileUrl: `https://www.fitbit.com/user/${profileData.user.encodedId}`,
            };
        } else {
            const errorText = await profileRes.text();
            report.profileErrorBody = errorText;
        }

        // 3. Test Activity Data (Today's Steps)
        report.steps.push('Testing activity data (today\'s steps)...');
        const date = new Date().toISOString().split('T')[0];
        const stepsRes = await fetch(
            `https://api.fitbit.com/1/user/-/activities/date/${date}.json`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        report.stepsCheck = {
            status: stepsRes.status,
            statusText: stepsRes.statusText,
            rateLimitLimit: stepsRes.headers.get('fitbit-rate-limit-limit'),
            rateLimitRemaining: stepsRes.headers.get('fitbit-rate-limit-remaining'),
            rateLimitReset: stepsRes.headers.get('fitbit-rate-limit-reset'),
        };

        if (stepsRes.ok) {
            const stepsData = await stepsRes.json();
            report.stepsDataSummary = stepsData.summary;
            report.stepsDataRaw = stepsData; // Include full raw data
        } else {
            const errorText = await stepsRes.text();
            report.stepsErrorBody = errorText;
        }

        // 4. Test Lifetime Stats (To verify if account is active at all)
        report.steps.push('Testing lifetime stats...');
        const lifetimeRes = await fetch(
            `https://api.fitbit.com/1/user/-/activities.json`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        report.lifetimeCheck = {
            status: lifetimeRes.status,
            statusText: lifetimeRes.statusText,
        };

        if (lifetimeRes.ok) {
            const lifetimeData = await lifetimeRes.json();
            report.lifetimeStats = lifetimeData.lifetime;
        }

        // 5. Check Recent History (Last 7 days)
        // This helps identify if sync stopped recently or has been dead for a while.
        report.steps.push('Testing recent history (7 days)...');
        const historyRes = await fetch(
            `https://api.fitbit.com/1/user/-/activities/steps/date/today/1w.json`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (historyRes.ok) {
            const historyData = await historyRes.json();
            report.recentHistory = historyData['activities-steps'];
        }

    } catch (error: any) {
        report.steps.push('Unexpected error');
        report.error = error.message || error;
    }

    return NextResponse.json(report);
}

export const runtime = 'edge';
