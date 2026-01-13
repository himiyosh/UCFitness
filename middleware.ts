import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token;
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
            // We need to assume that if 'username' is missing from token (which comes from session callback presumably if we mapped it),
            // OR if email implies pending setup.

            // Note: In auth.ts JWT callback, we usually just pass token. 
            // We need to make sure 'username' is in the JWT token for this middleware to work efficiently 
            // without checking DB every time (which middleware can't do easily anyway).

            // BUT, `req.nextauth.token` content depends on `callbacks.jwt`.
            // Let's verify `lib/auth.ts` jwt callback later.
            // If username is NOT in token, we might need to rely on email check if possible, 
            // or just check email domain.

            const email = token.email || "";
            const isPendingEmail = email.includes("@pending.setup");
            // @ts-ignore
            const hasUsername = !!token.username; // Need to ensure username is in JWT

            if (isPendingEmail || !hasUsername) {
                return NextResponse.redirect(new URL('/setup', req.url));
            }
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    }
);

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
