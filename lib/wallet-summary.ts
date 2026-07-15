import { BASE_RATE, GOAL_BONUS_RATE } from '@/lib/constants';

export interface WalletTransactionAmount {
    date: string;
    amount: number;
}

export interface WalletTransactionSummary {
    earned: number;
    spent: number;
    net: number;
}

export interface WalletNextReward {
    steps: number;
    baseUc: number;
    goalBonusUc: number;
}

export function summarizeWalletTransactions(
    transactions: WalletTransactionAmount[],
    date?: string,
): WalletTransactionSummary {
    let earned = 0;
    let spent = 0;

    for (const transaction of transactions) {
        if (date && transaction.date !== date) {
            continue;
        }
        if (transaction.amount > 0) {
            earned += transaction.amount;
        } else if (transaction.amount < 0) {
            spent += Math.abs(transaction.amount);
        }
    }

    return {
        earned,
        spent,
        net: earned - spent,
    };
}

export function getNextWalletReward(
    currentSteps: number | null,
    stepGoal: number | null,
): WalletNextReward | null {
    if (
        currentSteps === null
        || stepGoal === null
        || !Number.isFinite(currentSteps)
        || !Number.isFinite(stepGoal)
        || currentSteps < 0
        || stepGoal <= 0
    ) {
        return null;
    }

    const remainingToGoal = Math.max(0, stepGoal - currentSteps);
    const steps = remainingToGoal > 0
        ? Math.min(100, remainingToGoal)
        : 100;
    const reachesGoal = remainingToGoal > 0 && steps === remainingToGoal;

    return {
        steps,
        baseUc: Math.floor(steps * BASE_RATE),
        goalBonusUc: reachesGoal
            ? Math.floor(stepGoal * BASE_RATE * GOAL_BONUS_RATE)
            : 0,
    };
}
