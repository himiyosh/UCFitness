export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { purchaseItem } from '@/lib/shop-service';

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { itemId } = await request.json();
        if (!itemId) {
            return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
        }

        const userId = session.user.id;
        const result = await purchaseItem(userId, itemId);

        if (!result.success) {
            const statusMap: Record<string, number> = {
                already_owned: 409,
                insufficient_balance: 402,
                rank_too_low: 403,
                item_not_found: 404,
                item_inactive: 410,
            };
            return NextResponse.json(
                { error: result.error },
                { status: statusMap[result.error || 'unknown'] || 500 },
            );
        }

        return NextResponse.json({
            success: true,
            newBalance: result.newBalance,
        });
    } catch (error) {
        console.error('Shop purchase error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
