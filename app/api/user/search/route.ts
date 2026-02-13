import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { sanitizeSearchQuery } from "@/lib/security-utils";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const session = await auth();

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ users: [] });
    }

    const cleanQuery = sanitizeSearchQuery(query);

    if (cleanQuery.length < 3) {
        return NextResponse.json({ users: [] });
    }

    try {
        // Search by ID (exact) or Username (partial)
        // Note: ID search requires valid UUID format usually, but text search is safer with 'or'

        // Check if it looks like a UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanQuery);

        let queryBuilder = supabaseAdmin
            .from('users')
            .select('id, name, username, image')
            .limit(10);

        if (isUuid) {
            queryBuilder = queryBuilder.eq('id', cleanQuery);
        } else {
            // 🛡️ ユーザー名のみで検索 — email検索を削除してメール列挙攻撃を防止
            queryBuilder = queryBuilder.ilike('username', `%${cleanQuery}%`);
        }

        const { data: users, error } = await queryBuilder;

        if (error) {
            console.error("Search User Error:", error instanceof Error ? error.message : "Unknown error");
            return NextResponse.json({ error: "Search failed" }, { status: 500 });
        }

        return NextResponse.json({ users: users || [] });

    } catch (error: unknown) {
        console.error("Search Request Error:", error instanceof Error ? error.message : "Unknown error");
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
