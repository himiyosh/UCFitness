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
        throw new Error(`Fitbit API error: ${response.statusText}`);
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
