export async function sendTeamsNotification(rankings: any[]) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

    if (!webhookUrl) {
        console.warn('TEAMS_WEBHOOK_URL is not set');
        return;
    }

    const topRankings = rankings.slice(0, 10);
    const facts = topRankings.map((r, i) => ({
        title: `#${i + 1} ${r.users?.name || r.users?.email}`,
        value: `${r.steps.toLocaleString()} steps`,
    }));

    const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "0076D7",
        "summary": "Daily Step Ranking",
        "sections": [{
            "activityTitle": "🏆 Daily Step Leaderboard",
            "activitySubtitle": `Updated: ${new Date().toLocaleTimeString()}`,
            "activityImage": "https://img.icons8.com/color/48/000000/trophy.png",
            "facts": facts,
            "markdown": true
        }]
    };

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card),
        });

        if (!res.ok) {
            console.error('Failed to send Teams notification:', res.status, res.statusText);
        }
    } catch (error) {
        console.error('Error sending Teams notification:', error);
    }
}
