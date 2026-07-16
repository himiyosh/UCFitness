export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';

// 通知設定 API
// GET: 現在の通知設定を取得
// PUT: 通知設定を更新

export async function GET(): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('notification_reactions, notification_gear_reactions')
            .eq('id', session.user.id)
            .single();

        if (error) {
            reportError('user/notification-settings:get', error, { userId: session.user.id });
            if (error.code === '42703') {
                return NextResponse.json({
                    error: 'Notification settings unavailable',
                    code: 'NOTIFICATION_SETTINGS_UNAVAILABLE',
                }, { status: 503 });
            }
            return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
        }

        return NextResponse.json({
            notificationReactions: data?.notification_reactions ?? true,
            notificationGearReactions: data?.notification_gear_reactions ?? true,
        });
    } catch (err) {
        reportError('user/notification-settings:get', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: unknown = await request.json();
        if (typeof body !== 'object' || body === null) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const notificationReactions = 'notificationReactions' in body
            ? body.notificationReactions
            : undefined;
        const notificationGearReactions = 'notificationGearReactions' in body
            ? body.notificationGearReactions
            : undefined;

        // バリデーション: boolean のみ許可
        const updateData: {
            notification_reactions?: boolean;
            notification_gear_reactions?: boolean;
        } = {};
        if (typeof notificationReactions === 'boolean') {
            updateData.notification_reactions = notificationReactions;
        }
        if (typeof notificationGearReactions === 'boolean') {
            updateData.notification_gear_reactions = notificationGearReactions;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('users')
            .update(updateData)
            .eq('id', session.user.id);

        if (error) {
            reportError('user/notification-settings:put', error, { userId: session.user.id });
            if (error.code === '42703') {
                return NextResponse.json({
                    error: 'Notification settings unavailable',
                    code: 'NOTIFICATION_SETTINGS_UNAVAILABLE',
                }, { status: 503 });
            }
            return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        reportError('user/notification-settings:put', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
