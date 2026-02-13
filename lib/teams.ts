import { reportError } from './errors';

interface RankingUser {
    name?: string | null;
    username?: string | null;
}

interface TeamsRankingEntry {
    steps: number;
    users?: RankingUser;
}

export async function sendTeamsNotification(rankings: TeamsRankingEntry[]) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

    if (!webhookUrl) {
        console.warn('TEAMS_WEBHOOK_URL is not set');
        return;
    }

    const topRankings = rankings.slice(0, 10);
    const facts = topRankings.map((r, i) => ({
        // 🛡️ Sentinel: Prefer name or username, fallback to 'Anonymous' (avoid email)
        title: `#${i + 1} ${r.users?.name || r.users?.username || 'Anonymous'}`,
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
            reportError('sendTeamsNotification', new Error(`Teams webhook failed: ${res.status}`));
        }
    } catch (error: unknown) {
        reportError('sendTeamsNotification', error);
    }
}

export async function sendBadgeNotification(username: string, badgeName: string, badgeImageUrl: string | null, badgeDescription: string) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

    if (!webhookUrl) {
        console.warn('TEAMS_WEBHOOK_URL is not set');
        return;
    }

    const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "FFD700", // Gold
        "summary": "New Badge Unlocked!",
        "sections": [{
            "activityTitle": "🎉 Badge Unlocked!",
            "activitySubtitle": `${username} has earned a new badge`,
            "activityImage": badgeImageUrl || "https://img.icons8.com/color/48/000000/medal.png",
            "facts": [
                {
                    "name": "Badge",
                    "value": badgeName
                },
                {
                    "name": "Description",
                    "value": badgeDescription
                }
            ],
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
            reportError('sendBadgeNotification', new Error(`Teams badge webhook failed: ${res.status}`));
        }
    } catch (error: unknown) {
        reportError('sendBadgeNotification', error);
    }
}
