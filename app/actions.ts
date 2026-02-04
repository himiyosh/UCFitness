'use server'

import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

import { refreshFitbitToken, getFitbitProfile } from "@/lib/fitbit";

export async function updateProfileImage(imageUrl: string | null) {
    const session = await auth();

    if (!session || !session.user) {
        throw new Error("Not authenticated");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    console.log("updateProfileImage called for user:", userId, "with URL:", imageUrl);

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
            console.error("Failed to fetch user tokens for reset:", tokenError);
            // Fallback: just set flag false, user needs to re-login to sync.
            await supabaseAdmin.from("users").update({ is_custom_image: false }).eq("id", userId);
            throw new Error("Could not fetch Fitbit profile. Please re-login to sync.");
        }

        let accessToken = userTokens.access_token;
        let fitbitImage = null;

        try {
            const profile = await getFitbitProfile(accessToken);
            fitbitImage = profile.avatar;
        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (e.message === "Unauthorized" || e.message?.includes("401")) {
                console.log("Token expired during reset, refreshing...");
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
                } catch (refreshError) {
                    console.error("Failed to refresh token during reset:", refreshError);
                    // Fallback
                    await supabaseAdmin.from("users").update({ is_custom_image: false }).eq("id", userId);
                    throw new Error("Session expired. Please sign out and sign in again.");
                }
            } else {
                console.error("Error fetching Fitbit profile:", e);
                // Fallback
                await supabaseAdmin.from("users").update({ is_custom_image: false }).eq("id", userId);
                throw e;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
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
        console.error("Upload error:", uploadError);
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
        console.error("Database update error:", dbError);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any).id;
    // Client compresses to JPEG, so we enforce .jpg extension to match content type
    const fileExt = 'jpg';
    const filePath = `banner-${userId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseAdmin
        .storage
        .from('avatars') // Reusing avatars bucket
        .upload(filePath, file, {
            contentType: file.type,
            upsert: true
        });

    if (uploadError) {
        console.error("Upload error:", uploadError);
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
            banner_url: publicUrl
        })
        .eq("id", userId);

    if (dbError) {
        console.error("Database update error:", dbError);
        throw new Error("Failed to update banner URL");
    }

    revalidatePath('/profile');
    revalidatePath('/settings');
    revalidatePath('/');
}
