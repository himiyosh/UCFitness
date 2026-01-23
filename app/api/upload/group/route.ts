import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const session = await auth();

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const groupId = formData.get("groupId") as string;
        const type = formData.get("type") as string; // 'icon' or 'header'

        // 🛡️ Sentinel: Validate Inputs
        if (!file || !groupId || !type) {
            return NextResponse.json({ error: "Missing file or metadata" }, { status: 400 });
        }

        // 1. Validate 'type' (Prevent Path Traversal)
        const ALLOWED_TYPES = ['icon', 'header'];
        if (!ALLOWED_TYPES.includes(type)) {
             return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
        }

        // 2. Validate File MIME Type
        const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
             return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed." }, { status: 400 });
        }

        // 3. Validate File Size (Max 5MB)
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_SIZE) {
             return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
        }

        const userId = (session.user as any).id;

        // Verify Ownership
        const { data: membership } = await supabaseAdmin
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .single();

        if (!membership || membership.role !== 'OWNER') {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Prepare path
        // Path: public/[groupId]/[type]-[timestamp].ext
        // 🛡️ Sentinel: Sanitize extension and filename
        const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const fileName = `${type}-${Date.now()}.${fileExt}`;
        const filePath = `public/${groupId}/${fileName}`;

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to 'group-assets'
        const { error: uploadError } = await supabaseAdmin
            .storage
            .from('group-assets')
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error("Upload error", uploadError);
            return NextResponse.json({ error: "Upload failed" }, { status: 500 });
        }

        // Get Public URL
        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from('group-assets')
            .getPublicUrl(filePath);

        return NextResponse.json({ publicUrl });

    } catch (error) {
        console.error("Upload handler error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const runtime = 'edge';
