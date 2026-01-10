export async function getFitbitSteps(accessToken: string, date: string = 'today') {
    const response = await fetch(
        `https://api.fitbit.com/1/user/-/activities/date/${date}.json`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fitbit API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.summary.steps;
}

export async function getFitbitActivityTimeSeries(accessToken: string, range: '1w' | '1m' | '1y' = '1m') {
    const response = await fetch(
        `https://api.fitbit.com/1/user/-/activities/steps/date/today/${range}.json`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Fitbit API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data['activities-steps'];
}

export async function refreshFitbitToken(refreshToken: string) {
    const basicAuth = Buffer.from(`${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`).toString('base64');

    const response = await fetch('https://api.fitbit.com/oauth2/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh Fitbit token: ${response.statusText} - ${errorText}`);
    }

    return response.json();
}

export async function getFitbitProfile(accessToken: string) {
    const response = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        // If 401, the caller should handle refresh
        if (response.status === 401) {
            throw new Error("Unauthorized");
        }
        const errorText = await response.text();
        throw new Error(`Fitbit API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.user;
}
