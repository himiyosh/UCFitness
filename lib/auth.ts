import NextAuth, { NextAuthOptions } from "next-auth";
import { supabaseAdmin } from "./supabase";

// Custom Fitbit Provider since it's missing from the installed next-auth package
const FitbitProvider = (options: { clientId: string; clientSecret: string }) => ({
    id: "fitbit",
    name: "Fitbit",
    type: "oauth",
    authorization: "https://www.fitbit.com/oauth2/authorize?response_type=code&scope=activity%20profile&prompt=login%20consent",
    token: "https://api.fitbit.com/oauth2/token",
    userinfo: "https://api.fitbit.com/1/user/-/profile.json",
    profile(profile: any) {
        return {
            id: profile.user.encodedId,
            name: profile.user.fullName,
            image: profile.user.avatar,
            email: profile.user.email || `${profile.user.encodedId}@fitbit.placeholder.com`, // Fallback for DB constraint
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
            if (!account || !user.email) return false;

            // Upsert user into Supabase 'users' table
            const { error } = await supabaseAdmin.from("users").upsert(
                {
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    provider: account.provider,
                    provider_account_id: account.providerAccountId,
                    access_token: account.access_token,
                    refresh_token: account.refresh_token,
                    token_expires_at: account.expires_at,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "email" }
            );

            if (error) {
                console.error("Error saving user to Supabase:", error);
                return false;
            } else {
                console.log(`Successfully updated user tokens for ${user.email}`);
            }

            return true;
        },
        async session({ session, token }: any) {
            if (session.user) {
                // Fetch the actual UUID from Supabase users table
                const { data } = await supabaseAdmin
                    .from("users")
                    .select("id")
                    .eq("email", session.user.email)
                    .single();

                if (data) {
                    session.user.id = data.id;
                } else {
                    // Fallback (shouldn't happen if signIn succeeded)
                    session.user.id = token.sub;
                }
            }
            return session;
        },
        async jwt({ token, account }: any) {
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
    },
    session: {
        strategy: "jwt",
    },
    secret: process.env.NEXTAUTH_SECRET,
};
