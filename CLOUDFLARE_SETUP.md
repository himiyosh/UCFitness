# Cloudflare Pages Deployment Guide

This project is configured to be deployed on Cloudflare Pages using the `@cloudflare/next-on-pages` adapter.

## Prerequisites

- A Cloudflare account.
- A GitHub repository with this project pushed.

## Setup Instructions

1.  **Log in to Cloudflare Dashboard**.
2.  Go to **Compute (Workers & Pages)** > **Pages**.
3.  Click **Connect to Git**.
4.  Select your repository (`UCFitness`).
5.  **Configure Build Settings**:
    -   **Project Name**: `ucfitness` (or your preference)
    -   **Production branch**: `main`
    -   **Framework preset**: `Next.js`
    -   **Build command**: `npm install --force && npm run pages:build`
    -   **Build output directory**: `.vercel/output/static`
    -   **Node.js Version**: Go to **Environment variables** and add `NODE_VERSION` = `20` (or higher, e.g. 20.10.0).

6.  **Environment Variables**:
    Add the following production environment variables (copy from your `.env.local` or Supabase/Auth provider):
    -   `NEXTAUTH_URL`: Your Cloudflare Pages URL (e.g., `https://ucfitness.pages.dev`)
    -   `NEXTAUTH_SECRET`: Your secret.
    -   `SUPABASE_URL`: Your Supabase URL.
    -   `SUPABASE_SERVICE_ROLE_KEY`: Your Service Role Key.
    -   `FITBIT_CLIENT_ID`: Fitbit Client ID.
    -   `FITBIT_CLIENT_SECRET`: Fitbit Client Secret.

7.  **Save and Deploy**.

## Important Notes

-   **Image Optimization**: Next.js Image Optimization is disabled (`unoptimized: true`) in `next.config.ts` because Cloudflare Pages does not support the default Next.js image optimization runtime.
-   **Edge Runtime**: The API routes and pages should run on the Edge. The adapter handles the transpilation.
