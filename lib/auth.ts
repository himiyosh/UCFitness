import NextAuth from "next-auth";
import { CallbackRouteError } from "@auth/core/errors";
import { supabaseAdmin } from "./supabase";
import { backfillUserSteps } from "@/lib/services/step-manager";
import { reportError } from "./errors";

// Custom Fitbit Provider since it's missing from the installed next-auth package
interface FitbitProfile {
    user: {
        encodedId: string;
        fullName: string;
        avatar: string;
        email?: string;
    };
}

const FitbitProvider = (options: { clientId: string; clientSecret: string }) => ({
    id: "fitbit",
    name: "Fitbit",
    type: "oauth",
    authorization: "https://www.fitbit.com/oauth2/authorize?response_type=code&scope=activity%20profile&prompt=login",
    token: "https://api.fitbit.com/oauth2/token",
    userinfo: "https://api.fitbit.com/1/user/-/profile.json",
    profile(profile: FitbitProfile) {
        return {
            id: profile.user.encodedId,
            name: profile.user.fullName,
            image: profile.user.avatar,
            email: profile.user.email || `${profile.user.encodedId.toLowerCase()}@pending.setup`, // Distinct placeholder for onboarding detection
        };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    style: {
        logo: "https://authjs.dev/img/providers/fitbit.svg",
        logoDark: "https://authjs.dev/img/providers/fitbit.svg",
        bg: "#00B0B9",
        text: "#fff",
    },
});


export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        // @ts-expect-error FitbitProvider type mismatch with NextAuth v5 beta
        FitbitProvider({
            clientId: process.env.FITBIT_CLIENT_ID || "",
            clientSecret: process.env.FITBIT_CLIENT_SECRET || "",
        }),
    ],
    pages: {
        error: "/",
        signIn: "/",
    },
    // debug: true, // Enable for debugging if needed
    callbacks: {
        async signIn({ user, account }: { user: any; account?: any; profile?: any }) {
            if (!account) return false;

            // Provider identity is the only safe automatic account-linking key.
            const { data: providerUser, error: selectError } = await supabaseAdmin
                .from("users")
                .select("id, is_custom_image, email, provider, provider_account_id")
                .eq("provider", account.provider)
                .eq("provider_account_id", account.providerAccountId)
                .single();
            const existingUser = providerUser;

            if (selectError && selectError.code !== 'PGRST116') {
                reportError('auth.signIn:lookupByProvider', selectError);
                throw new CallbackRouteError('User lookup failed during sign-in');
            }

            let error;

            if (existingUser) {
                // Update tokens. 
                // CRITICAL: Do NOT overwrite the email in DB with the one from Fitbit if they already have one.
                // The user might have updated their email in the setup process.
                // We only update tokens and potentially image.

                const updates: Record<string, string | undefined> = {
                    provider: account.provider,
                    provider_account_id: account.providerAccountId,
                    access_token: account.access_token,
                    refresh_token: account.refresh_token,
                    token_expires_at: account.expires_at,
                    updated_at: new Date().toISOString(),
                };

                // Only update image from Fitbit if user hasn't set a custom one
                if (!existingUser.is_custom_image) {
                    updates.image = user.image;
                }

                const { error: updateError } = await supabaseAdmin
                    .from("users")
                    .update(updates)
                    .eq("id", existingUser.id); // Update by ID, not email (email might differ)
                error = updateError;
            } else {
                // New user: Insert everything including name
                // Note: user.email might be the pending one here.
                const { data: newUser, error: insertError } = await supabaseAdmin
                    .from("users")
                    .insert({
                        email: user.email,
                        name: user.name,
                        image: user.image,
                        provider: account.provider,
                        provider_account_id: account.providerAccountId,
                        access_token: account.access_token,
                        refresh_token: account.refresh_token,
                        token_expires_at: account.expires_at,
                        updated_at: new Date().toISOString(),
                        // language: 'ja' // Default to Japanese - Column missing
                    })
                    .select("id")
                    .single();

                error = insertError;

                if (newUser && !insertError) {
                    // Note: This backfill might take time, in Edge environment ensure it doesn't timeout or block response too long.
                    // Ideally this should be offloaded to a queue or background job, but for now we await it or fire-and-forget?
                    // Given runtime=edge, fire-and-forget might be killed. user setups page handles loading history too.
                    // We'll await it for now, assuming it's fast enough or we accept strict timeout.
                    await backfillUserSteps(newUser.id);
                }
            }

            if (error) {
                reportError('auth.signIn:saveUser', error);
                throw new CallbackRouteError('User persistence failed during sign-in');
            }

            return true;
        },
        async session({ session, token }: { session: any; token: any }) {
            if (session.user) {
                const tokenProvider = typeof token.provider === 'string'
                    ? token.provider
                    : 'fitbit';
                // Optimization: Populate from Token if available to avoid DB hits in Middleware
                if (token.id && token.username && token.email) {
                    session.user.id = token.id;
                    session.user.username = token.username;
                    session.user.email = token.email;
                    session.user.image = token.picture || token.image || session.user.image;
                    session.user.language = token.language || 'ja';
                    return session;
                }

                // Fallback: DB Lookup (Only if token is missing data)

                let data = null;

                // 1. Try by ID (Most reliable if we have it)
                if (token.id) {
                    const res = await supabaseAdmin
                        .from("users")
                        .select("id, name, username, image, email, language")
                        .eq("id", token.id)
                        .single();
                    if (res.data) data = res.data;
                }

                // 2. Try by Provider Account ID (if saved)
                if (!data && token.provider_account_id) {
                    const res = await supabaseAdmin
                        .from("users")
                        .select("id, name, username, image, email, language")
                        .eq("provider", tokenProvider)
                        .eq("provider_account_id", token.provider_account_id)
                        .single();
                    if (res.data) data = res.data;
                }

                // 3. Fallback: Try token.sub as Provider Account ID (Legacy/Fitbit ID)
                if (!data && token.sub) {
                    const res = await supabaseAdmin
                        .from("users")
                        .select("id, name, username, image, email, language")
                        .eq("provider", tokenProvider)
                        .eq("provider_account_id", token.sub)
                        .single();
                    if (res.data) data = res.data;
                }

                if (data) {
                    session.user.id = data.id;
                    session.user.name = data.name;
                    session.user.image = data.image;
                    session.user.email = data.email;
                    session.user.username = data.username;
                    session.user.language = data.language || 'ja';
                }
            }
            return session;
        },
        async jwt({ token, account, user, trigger, session }: { token: any; account?: any; user?: any; trigger?: string; session?: any }) {
            // Initial sign in
            if (account && user) {
                token.accessToken = account.access_token;
                token.provider = account.provider;
                token.provider_account_id = account.providerAccountId; // Persist for recovery

                // Sync with DB to get real ID/Username
                const { data, error } = await supabaseAdmin
                    .from("users")
                    .select("id, username, email, image, language")
                    .eq("provider", account.provider)
                    .eq("provider_account_id", account.providerAccountId)
                    .single();

                if (error) {
                    reportError('auth.jwt:initialLookup', error);
                }

                if (data) {
                    token.id = data.id;
                    token.username = data.username;
                    token.email = data.email; // Real DB email
                    token.image = data.image;
                    token.language = data.language;
                }
            }

            // Recovery: If token is missing critical data
            if (!token.id || !token.username) {
                if (trigger !== 'update') {
                    let data = null;

                    // 1. Try by ID
                    if (token.id) {
                        const res = await supabaseAdmin
                            .from("users")
                            .select("id, username, email, image, provider_account_id, language")
                            .eq("id", token.id)
                            .single();
                        data = res.data;
                    }

                    // 2. Try by saved Provider Account ID
                    if (!data && token.provider_account_id) {
                        const res = await supabaseAdmin
                            .from("users")
                            .select("id, username, email, image, provider_account_id, language")
                            .eq("provider", token.provider || 'fitbit')
                            .eq("provider_account_id", token.provider_account_id)
                            .single();
                        data = res.data;
                    }

                    // 3. Fallback to sub as ProviderID (Legacy)
                    if (!data && token.sub) {
                        const res = await supabaseAdmin
                            .from("users")
                            .select("id, username, email, image, provider_account_id, language")
                            .eq("provider", token.provider || 'fitbit')
                            .eq("provider_account_id", token.sub)
                            .single();
                        data = res.data;
                    }

                    if (data) {
                        token.id = data.id;
                        token.username = data.username;
                        token.email = data.email;
                        token.image = data.image;
                        token.provider_account_id = data.provider_account_id;
                        token.language = data.language;
                    }
                }
            }

            // Client side session update
            if (trigger === "update" && session?.user) {
                if (session.user.username) token.username = session.user.username;
                if (session.user.email) token.email = session.user.email;
                if (session.user.image) token.image = session.user.image;
                if (session.user.language) token.language = session.user.language;
            }

            return token;
        },
    },
    session: {
        strategy: "jwt",
    },
    secret: process.env.NEXTAUTH_SECRET,
});
