import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const token = req.auth; // In v5, req.auth is the session/token
    const path = req.nextUrl.pathname;

    // Allow access to setup page, api, and static files
    if (path.startsWith('/setup') ||
        path.startsWith('/api') ||
        path.startsWith('/_next') ||
        path.startsWith('/favicon.ico')) {
        return NextResponse.next();
    }

    if (token) {
        // Check if user needs setup

        // Note: req.auth roughly maps to the session/jwt contents.
        // We need to verify if 'username' is present.

        const email = token.user?.email || "";
        const isPendingEmail = email.includes("@pending.setup");
        const hasUsername = !!(token.user as any)?.username;

        if (isPendingEmail || !hasUsername) {
            console.log(`[Middleware] Redirecting to /setup. Email: ${email}, Username: ${(token.user as any)?.username}`);
            return NextResponse.redirect(new URL('/setup', req.url));
        }
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - login (if you have one, but we use fitbit auth)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
    ],
};
