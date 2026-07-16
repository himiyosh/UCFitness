export interface MissionTemplate {
    type: string;
    title: string;
    description: string;
    rewardUc: number;
}

const STEP_THRESHOLDS: Readonly<Record<string, number>> = {
    WALK_100: 100,
    WALK_500: 500,
    WALK_1K: 1000,
    WALK_3K: 3000,
    WALK_5K: 5000,
    WALK_8K: 8000,
    WALK_10K: 10000,
    WALK_15K: 15000,
};

const MISSION_POOL: readonly MissionTemplate[] = [
    { type: 'WALK_100', title: 'まず100歩から', description: '今日100歩以上歩く', rewardUc: 5 },
    { type: 'WALK_500', title: '500歩の小さな一歩', description: '今日500歩以上歩く', rewardUc: 10 },
    { type: 'WALK_1K', title: '1,000歩を歩こう', description: '今日1,000歩以上歩く', rewardUc: 15 },
    { type: 'WALK_3K', title: '3,000歩を歩こう', description: '今日3,000歩以上歩く', rewardUc: 30 },
    { type: 'WALK_5K', title: '5,000歩チャレンジ', description: '今日5,000歩以上歩く', rewardUc: 50 },
    { type: 'WALK_8K', title: '8,000歩を目指せ', description: '今日8,000歩以上歩く', rewardUc: 80 },
    { type: 'WALK_10K', title: '10,000歩の壁を越えよう', description: '今日10,000歩以上歩く', rewardUc: 100 },
    { type: 'WALK_15K', title: '15,000歩マスター', description: '今日15,000歩以上歩く', rewardUc: 150 },
    { type: 'LOGIN', title: 'ログインしよう', description: 'UCFitnessにログインする', rewardUc: 10 },
];

export function evaluateMission(missionType: string, todaySteps: number): boolean {
    const threshold = STEP_THRESHOLDS[missionType];
    if (threshold !== undefined) return todaySteps >= threshold;
    return missionType === 'LOGIN';
}

export function generateDailyMissions(
    date: string,
    recentAverageSteps: number = 0,
): MissionTemplate[] {
    const loginMission = getMissionByType('LOGIN');
    if (recentAverageSteps < 1000) {
        return [loginMission, getMissionByType('WALK_100'), getMissionByType('WALK_500')];
    }
    if (recentAverageSteps < 3000) {
        return [loginMission, getMissionByType('WALK_500'), getMissionByType('WALK_1K')];
    }
    if (recentAverageSteps < 5000) {
        return [loginMission, getMissionByType('WALK_1K'), getMissionByType('WALK_3K')];
    }
    if (recentAverageSteps < 8000) {
        return [loginMission, getMissionByType('WALK_3K'), getMissionByType('WALK_5K')];
    }

    const numericSeed = Number(date.replace(/-/g, ''));
    const easyMissionTypes = new Set(['WALK_1K', 'WALK_3K', 'WALK_5K']);
    const easyMissions = MISSION_POOL.filter((mission) => easyMissionTypes.has(mission.type));
    const hardMissions = MISSION_POOL.filter(
        (mission) => mission.type.startsWith('WALK_') && mission.rewardUc > 50,
    );
    return [
        loginMission,
        easyMissions[numericSeed % easyMissions.length],
        hardMissions[(numericSeed * 7) % hardMissions.length],
    ];
}

function getMissionByType(type: string): MissionTemplate {
    const mission = MISSION_POOL.find((candidate) => candidate.type === type);
    if (!mission) throw new Error(`Unknown mission type: ${type}`);
    return mission;
}
