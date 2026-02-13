'use server'

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

import { refreshFitbitToken, getFitbitProfile } from "@/lib/fitbit";

// 🛡️ セキュリティ: セッションからユーザーIDを安全に抽出するヘルパー
// NextAuth v5 beta の auth() は複数オーバーロードを持つため、
// ReturnType<typeof auth> ではなく Session 型を直接参照
function getSessionUserId(session: { user?: { id?: string } | null } | null): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) throw new Error("Not authenticated");
    return userId;
}

// 🛡️ セキュリティ: 許可されたファイルタイプとサイズ制限
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validateImageFile(file: File): void {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
    }
    if (file.size > MAX_FILE_SIZE) {
        throw new Error("File too large. Maximum size: 5MB");
    }
}

export async function updateProfileImage(imageUrl: string | null) {
    const session = await auth();

    if (!session || !session.user) {
        throw new Error("Not authenticated");
    }

    const userId = getSessionUserId(session);

    // 🛡️ セキュリティ: URL検証
    if (imageUrl && !imageUrl.startsWith('https://')) {
        throw new Error("Invalid image URL");
    }

    if (imageUrl) {
        const { error } = await supabaseAdmin
            .from("users")
            .update({
                image: imageUrl,
                is_custom_image: true
            })
            .eq("id", userId);

        if (error) throw error;
    } else {
        // Resetting to Fitbit
        // Fetch current tokens to get the image from Fitbit API
        const { data: userTokens, error: tokenError } = await supabaseAdmin
            .from("users")
            .select("access_token, refresh_token")
            .eq("id", userId)
            .single();

        if (tokenError || !userTokens) {
            console.error("Failed to fetch user tokens for reset");
            // Fallback: just set flag false, user needs to re-login to sync.
            await supabaseAdmin.from("users").update({ is_custom_image: false }).eq("id", userId);
            throw new Error("Could not fetch Fitbit profile. Please re-login to sync.");
        }

        let accessToken = userTokens.access_token;
        let fitbitImage = null;

        try {
            const profile = await getFitbitProfile(accessToken);
            fitbitImage = profile.avatar;
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            if (errMsg === "Unauthorized" || errMsg.includes("401")) {
                try {
                    const newTokens = await refreshFitbitToken(userTokens.refresh_token);
                    accessToken = newTokens.access_token;

                    // Update tokens in DB
                    await supabaseAdmin.from("users").update({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        token_expires_at: Math.floor(Date.now() / 1000) + newTokens.expires_in,
                        updated_at: new Date().toISOString()
                    }).eq("id", userId);

                    // Retry fetch
                    const profile = await getFitbitProfile(accessToken);
                    fitbitImage = profile.avatar;
                } catch (refreshError: unknown) {
                    console.error("Failed to refresh token during reset");
                    // Fallback
                    await supabaseAdmin.from("users").update({ is_custom_image: false }).eq("id", userId);
                    throw new Error("Session expired. Please sign out and sign in again.");
                }
            } else {
                console.error("Error fetching Fitbit profile");
                // Fallback
                await supabaseAdmin.from("users").update({ is_custom_image: false }).eq("id", userId);
                throw new Error("Failed to fetch Fitbit profile");
            }
        }

        if (fitbitImage) {
            const { error } = await supabaseAdmin
                .from("users")
                .update({
                    image: fitbitImage,
                    is_custom_image: false
                })
                .eq("id", userId);

            if (error) throw error;
        }
    }

    revalidatePath('/profile');
    revalidatePath('/');
}

export async function uploadProfileImage(formData: FormData) {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Not authenticated");
    }

    const file = formData.get('file') as File;
    if (!file) {
        throw new Error("No file uploaded");
    }

    const userId = getSessionUserId(session);

    // 🛡️ セキュリティ: ファイル検証
    validateImageFile(file);

    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseAdmin
        .storage
        .from('avatars')
        .upload(filePath, file, {
            contentType: file.type,
            upsert: true
        });

    if (uploadError) {
        console.error("Upload error");
        throw new Error("Failed to upload image");
    }

    const { data: { publicUrl } } = supabaseAdmin
        .storage
        .from('avatars')
        .getPublicUrl(filePath);

    // Update user profile
    const { error: dbError } = await supabaseAdmin
        .from("users")
        .update({
            image: publicUrl,
            is_custom_image: true
        })
        .eq("id", userId);

    if (dbError) {
        console.error("Database update error");
        throw new Error("Failed to update profile image URL");
    }

    revalidatePath('/profile');
    revalidatePath('/');
}

export async function uploadBannerImage(formData: FormData) {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Not authenticated");
    }

    const file = formData.get('file') as File;
    if (!file) {
        throw new Error("No file uploaded");
    }

    const userId = getSessionUserId(session);

    // 🛡️ セキュリティ: ファイル検証
    validateImageFile(file);

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
        console.error("Upload error");
        throw new Error("Failed to upload banner image");
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
        console.error("Database update error");
        throw new Error("Failed to update banner URL");
    }

    revalidatePath('/profile');
    revalidatePath('/settings');
    revalidatePath('/');
}

import { cookies } from 'next/headers';

// ... (existing imports)

export async function updateUserLanguage(language: string) {
    const session = await auth();

    if (!session || !session.user) {
        throw new Error("Not authenticated");
    }

    if (!['ja', 'en'].includes(language)) {
        throw new Error("Invalid language");
    }

    const userId = getSessionUserId(session);

    const { error } = await supabaseAdmin
        .from("users")
        .update({
            language: language,
            updated_at: new Date().toISOString()
        })
        .eq("id", userId);

    if (error) {
        console.error("Database update error");
        throw new Error("Failed to update language");
    }

    // Explicitly set the cookie for next-intl
    (await cookies()).set('NEXT_LOCALE', language, { path: '/', maxAge: 31536000 }); // 1 year
}
