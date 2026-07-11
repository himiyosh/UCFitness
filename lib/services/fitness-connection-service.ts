import { revokeGoogleHealthToken } from '@/lib/api/google-health';
import { AppError, reportError } from '@/lib/errors';
import { decryptFitnessToken, encryptFitnessToken } from '@/lib/fitness-token-crypto';
import { supabaseAdmin } from '@/lib/supabase';

import type { FitnessTokenContext } from '@/lib/fitness-token-crypto';

export type FitnessConnectionStatus =
    | 'active'
    | 'disconnected'
    | 'reauthorization_required'
    | 'error';

interface FitnessConnectionRow {
    user_id: string;
    provider_user_id: string | null;
    legacy_provider_user_id: string | null;
    access_token_encrypted: string | null;
    refresh_token_encrypted: string | null;
    access_token_expires_at: number | null;
    scopes: string[];
    status: FitnessConnectionStatus;
    last_error_code: string | null;
    last_synced_at: string | null;
    history_synced_at: string | null;
    connected_at: string;
}

export interface FitnessConnectionSummary {
    status: FitnessConnectionStatus;
    scopes: string[];
    lastErrorCode: string | null;
    lastSyncedAt: string | null;
    connectedAt: string;
}

export interface GoogleHealthConnection {
    userId: string;
    providerUserId: string;
    legacyProviderUserId: string | null;
    accessToken: string;
    refreshToken: string | null;
    accessTokenExpiresAt: number | null;
    scopes: string[];
    historySyncedAt: string | null;
}

export interface GoogleHealthSyncSelection {
    userId: string;
    status: FitnessConnectionStatus;
    connection: GoogleHealthConnection | null;
    historySyncedAt?: string | null;
}

export interface GoogleHealthSyncClaim {
    claimId: string;
    historySyncedAt: string | null;
}

export interface SaveGoogleHealthConnectionInput {
    userId: string;
    providerUserId: string;
    legacyProviderUserId: string | null;
    accessToken: string;
    refreshToken: string | null;
    accessTokenExpiresAt: number;
    scopes: string[];
}

export interface UpdateGoogleHealthTokensInput {
    accessToken: string;
    refreshToken: string | null;
    accessTokenExpiresAt: number;
    scopes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConnectionStatus(value: unknown): value is FitnessConnectionStatus {
    return value === 'active'
        || value === 'disconnected'
        || value === 'reauthorization_required'
        || value === 'error';
}

function parseConnectionRow(value: unknown): FitnessConnectionRow {
    if (
        !isRecord(value)
        || typeof value.user_id !== 'string'
        || (value.provider_user_id !== null && typeof value.provider_user_id !== 'string')
        || (value.legacy_provider_user_id !== null && typeof value.legacy_provider_user_id !== 'string')
        || (value.access_token_encrypted !== null && typeof value.access_token_encrypted !== 'string')
        || (value.refresh_token_encrypted !== null && typeof value.refresh_token_encrypted !== 'string')
        || (value.access_token_expires_at !== null && typeof value.access_token_expires_at !== 'number')
        || !Array.isArray(value.scopes)
        || !value.scopes.every((scope) => typeof scope === 'string')
        || !isConnectionStatus(value.status)
        || (value.last_error_code !== null && typeof value.last_error_code !== 'string')
        || (value.last_synced_at !== null && typeof value.last_synced_at !== 'string')
        || (value.history_synced_at !== null && typeof value.history_synced_at !== 'string')
        || typeof value.connected_at !== 'string'
    ) {
        throw new AppError(
            'Fitness connection row has an invalid shape',
            'FITNESS_CONNECTION_INVALID_ROW',
        );
    }

    return {
        user_id: value.user_id,
        provider_user_id: value.provider_user_id,
        legacy_provider_user_id: value.legacy_provider_user_id,
        access_token_encrypted: value.access_token_encrypted,
        refresh_token_encrypted: value.refresh_token_encrypted,
        access_token_expires_at: value.access_token_expires_at,
        scopes: value.scopes,
        status: value.status,
        last_error_code: value.last_error_code,
        last_synced_at: value.last_synced_at,
        history_synced_at: value.history_synced_at,
        connected_at: value.connected_at,
    };
}

function createDatabaseError(operation: string, cause: unknown): AppError {
    return new AppError(
        'Fitness connection database operation failed',
        'FITNESS_CONNECTION_DATABASE_ERROR',
        { operation },
        cause,
    );
}

function getDatabaseErrorMessage(error: unknown): string {
    return isRecord(error) && typeof error.message === 'string'
        ? error.message
        : '';
}

function createTokenContext(
    userId: string,
    tokenType: FitnessTokenContext['tokenType'],
): FitnessTokenContext {
    return {
        userId,
        provider: 'google_health',
        tokenType,
    };
}

function assertGoogleHealthSyncMutation(
    operation: string,
    userId: string,
    result: unknown,
): void {
    if (result !== true) {
        throw new AppError(
            'Google Health sync lease is no longer active',
            'FITNESS_CONNECTION_SYNC_LEASE_LOST',
            { operation, userId },
        );
    }
}

async function markGoogleHealthDecryptionFailure(
    userId: string,
    error: unknown,
): Promise<GoogleHealthSyncSelection> {
    reportError('fitnessConnection:decryptSyncSelection', error, { userId });
    return {
        userId,
        status: 'error',
        connection: null,
    };
}

async function decryptGoogleHealthConnection(row: FitnessConnectionRow): Promise<GoogleHealthConnection> {
    if (!row.provider_user_id || !row.access_token_encrypted) {
        throw new AppError(
            'Active Google Health connection is missing credentials',
            'GOOGLE_HEALTH_CONNECTION_INCOMPLETE',
            { userId: row.user_id },
        );
    }

    const [accessToken, refreshToken] = await Promise.all([
        decryptFitnessToken(
            row.access_token_encrypted,
            createTokenContext(row.user_id, 'access'),
        ),
        row.refresh_token_encrypted
            ? decryptFitnessToken(
                row.refresh_token_encrypted,
                createTokenContext(row.user_id, 'refresh'),
            )
            : Promise.resolve(null),
    ]);

    return {
        userId: row.user_id,
        providerUserId: row.provider_user_id,
        legacyProviderUserId: row.legacy_provider_user_id,
        accessToken,
        refreshToken,
        accessTokenExpiresAt: row.access_token_expires_at,
        scopes: row.scopes,
        historySyncedAt: row.history_synced_at,
    };
}

async function createGoogleHealthSyncSelection(
    row: FitnessConnectionRow,
): Promise<GoogleHealthSyncSelection> {
    if (row.status !== 'active') {
        return {
            userId: row.user_id,
            status: row.status,
            connection: null,
            ...(row.history_synced_at
                ? { historySyncedAt: row.history_synced_at }
                : {}),
        };
    }

    try {
        return {
            userId: row.user_id,
            status: row.status,
            connection: await decryptGoogleHealthConnection(row),
        };
    } catch (error: unknown) {
        return markGoogleHealthDecryptionFailure(row.user_id, error);
    }
}

const CONNECTION_SELECT = [
    'user_id',
    'provider_user_id',
    'legacy_provider_user_id',
    'access_token_encrypted',
    'refresh_token_encrypted',
    'access_token_expires_at',
    'scopes',
    'status',
    'last_error_code',
    'last_synced_at',
    'history_synced_at',
    'connected_at',
].join(', ');

export async function getGoogleHealthConnectionSummary(
    userId: string,
): Promise<FitnessConnectionSummary | null> {
    const { data, error } = await supabaseAdmin
        .from('fitness_connections')
        .select(CONNECTION_SELECT)
        .eq('user_id', userId)
        .eq('provider', 'google_health')
        .maybeSingle();

    if (error) {
        throw createDatabaseError('getSummary', error);
    }
    if (!data) {
        return null;
    }

    const row = parseConnectionRow(data);
    return {
        status: row.status,
        scopes: row.scopes,
        lastErrorCode: row.last_error_code,
        lastSyncedAt: row.last_synced_at,
        connectedAt: row.connected_at,
    };
}

export async function verifyGoogleHealthMigrationIdentity(
    userId: string,
    legacyProviderUserId: string | null,
): Promise<void> {
    if (!legacyProviderUserId) {
        return;
    }

    const { data, error } = await supabaseAdmin
        .from('user_auth_identities')
        .select('provider_account_id')
        .eq('user_id', userId)
        .eq('provider', 'fitbit')
        .maybeSingle();

    if (error) {
        throw createDatabaseError('verifyMigrationIdentity', error);
    }
    if (
        data
        && isRecord(data)
        && typeof data.provider_account_id === 'string'
        && data.provider_account_id !== legacyProviderUserId
    ) {
        throw new AppError(
            'Google Health account does not match the linked Fitbit identity',
            'GOOGLE_HEALTH_LEGACY_IDENTITY_MISMATCH',
            { userId },
        );
    }
}

export async function getActiveGoogleHealthConnection(
    userId: string,
): Promise<GoogleHealthConnection | null> {
    const selection = await getGoogleHealthSyncSelection(userId);
    return selection?.connection ?? null;
}

export async function getGoogleHealthSyncSelection(
    userId: string,
): Promise<GoogleHealthSyncSelection | null> {
    const { data, error } = await supabaseAdmin
        .from('fitness_connections')
        .select(CONNECTION_SELECT)
        .eq('user_id', userId)
        .eq('provider', 'google_health')
        .maybeSingle();

    if (error) {
        throw createDatabaseError('getSyncSelection', error);
    }
    if (!data) {
        return null;
    }

    try {
        const row = parseConnectionRow(data);
        return createGoogleHealthSyncSelection(row);
    } catch (parseError: unknown) {
        reportError('fitnessConnection:parseUserSyncSelection', parseError, {
            userId,
        });
        return {
            userId,
            status: 'error',
            connection: null,
        };
    }
}

export async function getAllGoogleHealthSyncSelections(): Promise<GoogleHealthSyncSelection[]> {
    const pageSize = 500;
    const rows: FitnessConnectionRow[] = [];
    const invalidSelections: GoogleHealthSyncSelection[] = [];

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabaseAdmin
            .from('fitness_connections')
            .select(CONNECTION_SELECT)
            .eq('provider', 'google_health')
            .order('user_id', { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (error) {
            throw createDatabaseError('getAllSyncSelections', error);
        }
        if (!data || data.length === 0) {
            break;
        }

        for (const value of data) {
            try {
                rows.push(parseConnectionRow(value));
            } catch (parseError: unknown) {
                reportError('fitnessConnection:parseSyncSelection', parseError);
                if (isRecord(value) && typeof value.user_id === 'string') {
                    invalidSelections.push({
                        userId: value.user_id,
                        status: 'error',
                        connection: null,
                    });
                }
            }
        }
        if (data.length < pageSize) {
            break;
        }
    }

    const validSelections = await Promise.all(rows.map(createGoogleHealthSyncSelection));
    return [...validSelections, ...invalidSelections];
}

export async function getAllActiveGoogleHealthConnections(): Promise<GoogleHealthConnection[]> {
    const selections = await getAllGoogleHealthSyncSelections();
    return selections.flatMap((selection) => (
        selection.connection ? [selection.connection] : []
    ));
}

export async function saveGoogleHealthConnection(
    input: SaveGoogleHealthConnectionInput,
): Promise<void> {
    const accessTokenEncrypted = await encryptFitnessToken(
        input.accessToken,
        createTokenContext(input.userId, 'access'),
    );
    const refreshTokenEncrypted = input.refreshToken
        ? await encryptFitnessToken(
            input.refreshToken,
            createTokenContext(input.userId, 'refresh'),
        )
        : null;

    const { data, error } = await supabaseAdmin.rpc(
        'save_google_health_connection',
        {
            p_user_id: input.userId,
            p_provider_user_id: input.providerUserId,
            p_legacy_provider_user_id: input.legacyProviderUserId,
            p_access_token_encrypted: accessTokenEncrypted,
            p_refresh_token_encrypted: refreshTokenEncrypted,
            p_access_token_expires_at: input.accessTokenExpiresAt,
            p_scopes: input.scopes,
        },
    );

    if (error) {
        const message = getDatabaseErrorMessage(error);
        if (message.includes('Google Health provider identity mismatch')) {
            throw new AppError(
                'Google Health account does not match the previously connected identity',
                'GOOGLE_HEALTH_PROVIDER_IDENTITY_MISMATCH',
                { userId: input.userId },
                error,
            );
        }
        if (message.includes('Google Health refresh token is required')) {
            throw new AppError(
                'Google Health did not provide a refresh token',
                'GOOGLE_HEALTH_REFRESH_TOKEN_REQUIRED',
                { userId: input.userId },
                error,
            );
        }
        throw createDatabaseError('saveGoogleHealth', error);
    }
    if (data !== true) {
        throw new AppError(
            'Google Health connection save returned an invalid result',
            'FITNESS_CONNECTION_INVALID_SAVE_RESULT',
            { userId: input.userId },
        );
    }
}

export async function updateGoogleHealthTokens(
    userId: string,
    claimId: string,
    input: UpdateGoogleHealthTokensInput,
): Promise<void> {
    const accessTokenEncrypted = await encryptFitnessToken(
        input.accessToken,
        createTokenContext(userId, 'access'),
    );
    const refreshTokenEncrypted = input.refreshToken
        ? await encryptFitnessToken(
            input.refreshToken,
            createTokenContext(userId, 'refresh'),
        )
        : null;

    const { data, error } = await supabaseAdmin.rpc(
        'update_google_health_tokens',
        {
            p_user_id: userId,
            p_claim_id: claimId,
            p_access_token_encrypted: accessTokenEncrypted,
            p_refresh_token_encrypted: refreshTokenEncrypted,
            p_access_token_expires_at: input.accessTokenExpiresAt,
            p_scopes: input.scopes,
        },
    );

    if (error) {
        throw createDatabaseError('updateGoogleHealthTokens', error);
    }
    assertGoogleHealthSyncMutation('updateGoogleHealthTokens', userId, data);
}

export async function markGoogleHealthReauthorizationRequired(
    userId: string,
    claimId: string,
    errorCode: string,
): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc(
        'mark_google_health_reauthorization_required',
        {
            p_user_id: userId,
            p_claim_id: claimId,
            p_error_code: errorCode,
        },
    );

    if (error) {
        throw createDatabaseError('markReauthorizationRequired', error);
    }
    assertGoogleHealthSyncMutation(
        'markGoogleHealthReauthorizationRequired',
        userId,
        data,
    );
}

export async function markGoogleHealthSynced(
    userId: string,
    claimId: string,
): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc(
        'mark_google_health_synced',
        {
            p_user_id: userId,
            p_claim_id: claimId,
        },
    );

    if (error) {
        throw createDatabaseError('markSynced', error);
    }
    assertGoogleHealthSyncMutation('markGoogleHealthSynced', userId, data);
}

export async function markGoogleHealthHistorySynced(
    userId: string,
    claimId: string,
): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc(
        'mark_google_health_history_synced',
        {
            p_user_id: userId,
            p_claim_id: claimId,
        },
    );

    if (error) {
        throw createDatabaseError('markHistorySynced', error);
    }
    assertGoogleHealthSyncMutation('markGoogleHealthHistorySynced', userId, data);
}

export async function claimGoogleHealthSync(
    userId: string,
): Promise<GoogleHealthSyncClaim | null> {
    const claimId = crypto.randomUUID();
    const { data, error } = await supabaseAdmin.rpc('claim_google_health_sync', {
        p_user_id: userId,
        p_claim_id: claimId,
    });

    if (error) {
        throw createDatabaseError('claimGoogleHealthSync', error);
    }
    if (!isRecord(data) || typeof data.acquired !== 'boolean') {
        throw new AppError(
            'Google Health sync claim returned an invalid result',
            'FITNESS_CONNECTION_INVALID_SYNC_CLAIM',
            { userId },
        );
    }
    if (!data.acquired) {
        return null;
    }
    if (
        data.historySyncedAt !== null
        && typeof data.historySyncedAt !== 'string'
    ) {
        throw new AppError(
            'Google Health sync claim returned an invalid result',
            'FITNESS_CONNECTION_INVALID_SYNC_CLAIM',
            { userId },
        );
    }
    return {
        claimId,
        historySyncedAt: data.historySyncedAt,
    };
}

export async function releaseGoogleHealthSync(
    userId: string,
    claimId: string,
): Promise<void> {
    const { error } = await supabaseAdmin.rpc('release_google_health_sync', {
        p_user_id: userId,
        p_claim_id: claimId,
    });
    if (error) {
        throw createDatabaseError('releaseGoogleHealthSync', error);
    }
}

export async function disconnectGoogleHealth(userId: string): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc('disconnect_google_health', {
        p_user_id: userId,
    });
    if (error) {
        throw createDatabaseError('disconnectGoogleHealth', error);
    }
    if (data === null) {
        return;
    }
    if (
        !isRecord(data)
        || (
            data.accessTokenEncrypted !== null
            && typeof data.accessTokenEncrypted !== 'string'
        )
        || (
            data.refreshTokenEncrypted !== null
            && typeof data.refreshTokenEncrypted !== 'string'
        )
    ) {
        throw new AppError(
            'Google Health disconnect returned an invalid result',
            'FITNESS_CONNECTION_INVALID_DISCONNECT_RESULT',
            { userId },
        );
    }

    try {
        const encryptedToken = typeof data.refreshTokenEncrypted === 'string'
            ? data.refreshTokenEncrypted
            : typeof data.accessTokenEncrypted === 'string'
                ? data.accessTokenEncrypted
                : null;
        const tokenType: FitnessTokenContext['tokenType'] =
            typeof data.refreshTokenEncrypted === 'string'
                ? 'refresh'
                : 'access';

        if (encryptedToken) {
            const token = await decryptFitnessToken(
                encryptedToken,
                createTokenContext(userId, tokenType),
            );
            await revokeGoogleHealthToken(token);
        }
    } catch (error: unknown) {
        reportError('disconnectGoogleHealth:revoke', error, { userId });
    }
}
