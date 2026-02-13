import { auth } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // 🛡️ Sentinel: ファイルタイプとサイズのバリデーション
        const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." }, { status: 400 });
        }

        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
        }

        const userId = (session.user as any).id;
        // Client compresses to JPEG, so we enforce .jpg extension to match content type
        const fileExt = 'jpg';
        const filePath = `${userId}-banner-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseAdmin
            .storage
            .from('avatars') // Reusing avatars bucket
            .upload(filePath, file, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            reportError("banner-upload", uploadError, { userId });
            return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
        }

        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from('avatars')
            .getPublicUrl(filePath);

        // Update user profile
        const { error: dbError } = await supabaseAdmin
            .from("users")
            .update({
                banner_url: publicUrl
            })
            .eq("id", userId);

        if (dbError) {
            reportError("banner-db-update", dbError, { userId });
            return NextResponse.json({ error: "Failed to update banner URL" }, { status: 500 });
        }

        return NextResponse.json({ success: true, url: publicUrl });

    } catch (error: unknown) {
        reportError("banner-upload", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
