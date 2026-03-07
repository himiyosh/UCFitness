export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { equipItem, unequipItem } from '@/lib/services/shop-service';
import { reportError } from '@/lib/errors';

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { userItemId, action } = await request.json();
        if (!userItemId || typeof userItemId !== 'string') {
            return NextResponse.json({ error: 'Valid userItemId is required' }, { status: 400 });
        }

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userItemId)) {
            return NextResponse.json({ error: 'Invalid userItemId format' }, { status: 400 });
        }

        if (action !== 'equip' && action !== 'unequip') {
            return NextResponse.json({ error: 'action must be "equip" or "unequip"' }, { status: 400 });
        }

        const userId = session.user.id;

        const result = action === 'equip'
            ? await equipItem(userId, userItemId)
            : await unequipItem(userId, userItemId);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        reportError('shop/equip', error, { userId: session.user.id });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
