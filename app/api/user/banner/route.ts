import { auth } from "@/lib/auth";
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
            console.error("Upload error detail:", JSON.stringify(uploadError, null, 2));
            return NextResponse.json({ error: `Failed to upload image: ${uploadError.message}` }, { status: 500 });
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
            console.error("Database update error:", dbError);
            return NextResponse.json({ error: "Failed to update banner URL" }, { status: 500 });
        }

        return NextResponse.json({ success: true, url: publicUrl });

    } catch (error) {
        console.error("Error processing request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
