export async function getFitbitSteps(accessToken: string, date: string = new Date().toISOString().split('T')[0]) {
    try {
        const res = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!res.ok) {
            console.error('Fitbit API Error:', res.status, res.statusText);
            // Handle token expiration/refresh logic here if needed, or throw
            const text = await res.text();
            console.error('Body:', text);
            return 0;
        }

        const data = await res.json();
        const steps = data.summary?.steps || 0;
        return steps;
    } catch (error) {
        console.error('Failed to fetch Fitbit steps:', error);
        return 0;
    }
}
