export const runtime = 'edge';

import { NextResponse } from 'next/server';

import { getJSTDateString } from '@/lib/date-utils';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

import type { GroupChallengeSettlementRpcRow } from '@/types/database';

export const dynamic = 'force-dynamic';

const CANDIDATE_LIMIT = 20;
const SUCCESS_STATUSES = ['settled', 'already_settled'] as const;
const FAILURE_STATUSES = ['not_found', 'invalid_type', 'not_ended'] as const;
const SETTLEMENT_STATUSES = [...SUCCESS_STATUSES, ...FAILURE_STATUSES] as const;

type SettlementStatus = GroupChallengeSettlementRpcRow['status'];
type OutcomeKey = 'settled' | 'alreadySettled' | 'notFound' | 'invalidType'
    | 'notEnded' | 'rpcError' | 'invalidShape' | 'unknownStatus';

type SettlementOutcomes = Record<OutcomeKey, number>;

type ParsedSettlementResult = { kind: 'valid'; status: SettlementStatus }
    | { kind: 'invalidShape' } | { kind: 'unknownStatus' };

function createOutcomes(): SettlementOutcomes {
    return {
        settled: 0, alreadySettled: 0,
        notFound: 0, invalidType: 0, notEnded: 0,
        rpcError: 0, invalidShape: 0, unknownStatus: 0,
    };
}

function isSettlementStatus(value: string): value is SettlementStatus {
    return SETTLEMENT_STATUSES.some((status) => status === value);
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseSettlementResult(data: unknown): ParsedSettlementResult {
    if (!Array.isArray(data) || data.length !== 1) {
        return { kind: 'invalidShape' };
    }

    const row: unknown = data[0];
    if (!row || typeof row !== 'object') {
        return { kind: 'invalidShape' };
    }

    const result = row as Record<string, unknown>;
    if (typeof result.status !== 'string') {
        return { kind: 'invalidShape' };
    }
    if (!isSettlementStatus(result.status)) {
        return { kind: 'unknownStatus' };
    }

    const metrics = [result.total_steps, result.member_count, result.rewarded_count];
    const hasSettledShape =
        typeof result.is_completed === 'boolean'
        && metrics.every(isNonNegativeInteger)
        && typeof result.settled_at === 'string'
        && result.settled_at.length > 0;
    const hasRejectedShape =
        result.is_completed === null
        && metrics.every((value) => value === null)
        && result.settled_at === null;

    if (
        (SUCCESS_STATUSES.some((status) => status === result.status) && !hasSettledShape)
        || (FAILURE_STATUSES.some((status) => status === result.status) && !hasRejectedShape)
    ) {
        return { kind: 'invalidShape' };
    }

    return { kind: 'valid', status: result.status };
}

function outcomeKeyForStatus(status: SettlementStatus): OutcomeKey {
    switch (status) {
        case 'settled':
            return 'settled';
        case 'already_settled':
            return 'alreadySettled';
        case 'not_found':
            return 'notFound';
        case 'invalid_type':
            return 'invalidType';
        case 'not_ended':
            return 'notEnded';
    }
}

function safeErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return undefined;
    }
    return typeof error.code === 'string' && /^[A-Z0-9_]{1,20}$/i.test(error.code)
        ? error.code : undefined;
}

/**
 * GET /api/cron/group-challenge-settlement
 * 終了済みの未精算GROUP challengeを固定件数ずつ精算する。
 */
export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const today = getJSTDateString();
        const { data: candidates, error: candidateError } = await supabaseAdmin
            .from('challenges')
            .select('id')
            .eq('type', 'GROUP')
            .is('settled_at', null)
            .lt('end_date', today)
            .order('end_date', { ascending: true })
            .order('id', { ascending: true })
            .limit(CANDIDATE_LIMIT);

        if (candidateError) {
            reportError(
                'cron/group-challenge-settlement:candidates',
                new Error('Settlement candidate query failed'),
                { errorCode: safeErrorCode(candidateError) },
            );
            return NextResponse.json(
                { success: false, error: 'Internal Server Error' }, { status: 500 },
            );
        }

        const outcomes = createOutcomes();
        const candidateRows = candidates ?? [];

        for (const [candidateIndex, candidate] of candidateRows.entries()) {
            let rpcResult;
            try {
                rpcResult = await supabaseAdmin.rpc('settle_group_challenge', {
                    p_challenge_id: candidate.id,
                });
            } catch {
                outcomes.rpcError++;
                reportError(
                    'cron/group-challenge-settlement:rpc',
                    new Error('Settlement RPC request failed'),
                    { candidateIndex },
                );
                continue;
            }

            if (rpcResult.error) {
                outcomes.rpcError++;
                reportError(
                    'cron/group-challenge-settlement:rpc',
                    new Error('Settlement RPC failed'),
                    { candidateIndex, errorCode: safeErrorCode(rpcResult.error) },
                );
                continue;
            }

            const parsed = parseSettlementResult(rpcResult.data);
            if (parsed.kind !== 'valid') {
                outcomes[parsed.kind]++;
                reportError(
                    'cron/group-challenge-settlement:result',
                    new Error('Settlement RPC returned an invalid result'),
                    { candidateIndex, resultKind: parsed.kind },
                );
                continue;
            }

            outcomes[outcomeKeyForStatus(parsed.status)]++;
        }

        const failed =
            outcomes.notFound
            + outcomes.invalidType
            + outcomes.notEnded
            + outcomes.rpcError
            + outcomes.invalidShape
            + outcomes.unknownStatus;
        const response = {
            success: failed === 0,
            candidates: candidateRows.length,
            processed: candidateRows.length,
            failed,
            outcomes,
        };

        return NextResponse.json(response, { status: failed === 0 ? 200 : 500 });
    } catch (error: unknown) {
        reportError('cron/group-challenge-settlement', error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' }, { status: 500 },
        );
    }
}
