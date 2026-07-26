import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        pool: 'forks',
        isolate: true,
        include: ['**/*.test.ts'],
        exclude: ['node_modules', '.next'],
        coverage: {
            provider: 'v8',
            include: ['lib/**/*.{ts,tsx}'],
            exclude: [
                'lib/**/*.test.{ts,tsx}',
                'lib/**/*.spec.{ts,tsx}',
                'lib/**/__tests__/**',
                'lib/**/test-utils/**',
                'lib/**/*.d.ts',
            ],
            thresholds: {
                statements: 60,
                branches: 60,
                functions: 60,
                lines: 60,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
