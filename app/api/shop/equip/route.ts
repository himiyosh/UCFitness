export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { equipItem, unequipItem } from '@/lib/shop-service';

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user || !(session.user as any).id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { userItemId, action } = await request.json();
        if (!userItemId || !action) {
            return NextResponse.json({ error: 'userItemId and action are required' }, { status: 400 });
        }

        if (action !== 'equip' && action !== 'unequip') {
            return NextResponse.json({ error: 'action must be "equip" or "unequip"' }, { status: 400 });
        }

        const userId = (session.user as any).id as string;

        const result = action === 'equip'
            ? await equipItem(userId, userItemId)
            : await unequipItem(userId, userItemId);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Shop equip error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
