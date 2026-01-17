import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'UCFitness',
        short_name: 'UCFitness',
        description: 'Fitbit Step Competition Dashboard',
        start_url: '/',
        id: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
            {
                src: '/icon',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    };
}
