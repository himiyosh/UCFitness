import NextAuth, { NextAuthOptions } from "next-auth";
import { supabaseAdmin } from "./supabase";
import { backfillUserSteps } from "./step-manager";

// Custom Fitbit Provider since it's missing from the installed next-auth package
const FitbitProvider = (options: { clientId: string; clientSecret: string }) => ({
    id: "fitbit",
    name: "Fitbit",
    type: "oauth",
    authorization: "https://www.fitbit.com/oauth2/authorize?response_type=code&scope=activity%20profile&prompt=login",
    token: "https://api.fitbit.com/oauth2/token",
    userinfo: "https://api.fitbit.com/1/user/-/profile.json",
    profile(profile: any) {
        return {
            id: profile.user.encodedId,
            name: profile.user.fullName,
            image: profile.user.avatar,
            email: profile.user.email || `${profile.user.encodedId}@pending.setup`, // Distinct placeholder for onboarding detection
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


export const authOptions: NextAuthOptions = {
    providers: [
        // @ts-ignore
        FitbitProvider({
            clientId: process.env.FITBIT_CLIENT_ID || "",
            clientSecret: process.env.FITBIT_CLIENT_SECRET || "",
        }),
    ],
    callbacks: {
        async signIn({ user, account, profile }: any) {
            console.log(`[Auth] SignIn Start: Email=${user.email}, Provider=${account?.provider}, ProviderID=${account?.providerAccountId}`);
            if (!account) return false;

            // 1. Try to find user by Provider Account ID (Fitbit ID) first - This is stable
            let { data: existingUser, error: selectError } = await supabaseAdmin
                .from("users")
                .select("id, is_custom_image, email")
                .eq("provider", account.provider)
                .eq("provider_account_id", account.providerAccountId)
                .single();

            console.log(`[Auth] Lookup by ProviderID result:`, existingUser ? `Found (ID: ${existingUser.id})` : "Not Found");

            // 2. Fallback: Try by Email (legacy or first-time sync issue)
            // Only if not found by provider ID and user has an email
            if (!existingUser && user.email) {
                console.log(`[Auth] Fallback lookup by Email: ${user.email}`);
                const { data: userByEmail, error: emailError } = await supabaseAdmin
                    .from("users")
                    .select("id, is_custom_image, email")
                    .eq("email", user.email)
                    .single();

                if (userByEmail) {
                    existingUser = userByEmail;
                    console.log(`[Auth] Found by Email: ${existingUser.id}`);
                }
            }

            if (selectError && selectError.code !== 'PGRST116') {
                console.error("[Auth] Error finding user:", selectError);
            }

            let error;

            if (existingUser) {
                console.log(`[Auth] Updating existing user: ${existingUser.id}`);
                // Update tokens. 
                // CRITICAL: Do NOT overwrite the email in DB with the one from Fitbit if they already have one.
                // The user might have updated their email in the setup process.
                // We only update tokens and potentially image.

                const updates: any = {
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
                console.log(`[Auth] Creating new user: ${user.email}`);
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
                    })
                    .select()
                    .single();

                error = insertError;

                if (newUser && !insertError) {
                    console.log(`[Auth] New user created (ID: ${newUser.id}). Triggering backfill for steps history...`);
                    await backfillUserSteps(newUser.id);
                }
            }

            if (error) {
                console.error("[Auth] Error saving user to Supabase:", error);
                return false;
            } else {
                console.log(`[Auth] Successfully updated user tokens for ${existingUser ? existingUser.id : 'new user'}`);
            }

            return true;
        },
        async session({ session, token }: any) {
            // console.log(`[Auth] Session Callback. User Email: ${session.user?.email}`);
            if (session.user) {
                // Fetch the actual UUID from Supabase users table
                const { data } = await supabaseAdmin
                    .from("users")
                    .select("id, name, username, image")
                    .eq("email", session.user.email)
                    .single();

                if (data) {
                    session.user.id = data.id;
                    session.user.name = data.name; // Use DB name (Display Name)
                    session.user.image = data.image; // Use DB image
                    (session.user as any).username = data.username; // Expose User ID
                } else {
                    // Fallback (shouldn't happen if signIn succeeded)
                    session.user.id = token.sub;
                }
            }
            return session;
        },
        async jwt({ token, account, user, trigger, session }: any) {
            // Initial sign in
            if (account && user) {
                console.log(`[Auth] JWT Initial Signin. ProvID: ${account.providerAccountId}. Token Email: ${token.email}`);
                token.accessToken = account.access_token;

                // Fetch username AND real email from DB to persist in token
                // We must look up by Provider ID because the DB email might have been updated (setup complated)
                // and might not match the user.email (which comes from Fitbit provider headers)
                const { data } = await supabaseAdmin
                    .from("users")
                    .select("username, email")
                    .eq("provider", account.provider)
                    .eq("provider_account_id", account.providerAccountId)
                    .single();

                if (data) {
                    console.log(`[Auth] JWT DB Lookup Success. Username: ${data.username}, RealEmail: ${data.email}`);
                    token.username = data.username;
                    // IMPORTANT: Overwrite the token email with the REAL email from DB
                    // Otherwise middleware sees the pending email from Fitbit and redirects to setup
                    if (data.email) {
                        token.email = data.email;
                    }
                } else {
                    console.log(`[Auth] JWT DB Lookup Failed for ProvID: ${account.providerAccountId}`);
                }
            } else if (!token.username && token.sub) {
                // Recovery: If token exists but has no username (e.g. session persistence issue or pre-migration session)
                // Try to find user by Fitbit ID (token.sub)
                // token.sub is the providerAccountId (Fitbit ID) because user.id in NextAuth (JWT strategy) usually maps to it unless customized.
                // Wait, let's be careful. In 'profile' callback we returned id: encodedId.
                // So token.sub IS the Fitbit ID.

                console.log(`[Auth] JWT missing username, attempting recovery for sub: ${token.sub}`);
                const { data } = await supabaseAdmin
                    .from("users")
                    .select("username, email")
                    .eq("provider_account_id", token.sub)
                    .single();

                if (data) {
                    console.log(`[Auth] JWT Recovery Success. Username: ${data.username}`);
                    token.username = data.username;
                    if (data.email) {
                        token.email = data.email;
                    }
                }
            }

            // Client side session update (e.g. after setup)
            if (trigger === "update" && session?.user) {
                console.log(`[Auth] JWT Update Trigger. New Username: ${session.user.username}`);
                token.username = session.user.username;
                token.email = session.user.email;
            }

            return token;
        },
    },
    session: {
        strategy: "jwt",
    },
    secret: process.env.NEXTAUTH_SECRET,
};
