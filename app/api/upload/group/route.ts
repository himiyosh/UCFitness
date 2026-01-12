import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const groupId = formData.get("groupId") as string;
        const type = formData.get("type") as string; // 'icon' or 'header'

        if (!file || !groupId || !type) {
            return NextResponse.json({ error: "Missing file or metadata" }, { status: 400 });
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
        const fileExt = file.name.split('.').pop();
        const fileName = `${type}-${Date.now()}.${fileExt}`;
        const filePath = `public/${groupId}/${fileName}`;

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to 'group-assets'
        const { data, error: uploadError } = await supabaseAdmin
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
