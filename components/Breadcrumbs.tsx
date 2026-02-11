import { Link } from '@/navigation';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbsProps {
    items?: BreadcrumbItem[];
    className?: string;
}

export default async function Breadcrumbs({ items = [], className = "" }: BreadcrumbsProps) {
    const t = await getTranslations('Common');

    return (
        <nav className={`flex items-center text-sm font-medium text-gray-500 ${className}`} aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2">
                {/* Root: Home */}
                <li>
                    <Link href="/" className="hover:text-[var(--theme-primary)] transition-colors flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">{t('home')}</span>
                    </Link>
                </li>

                {items.map((item, index) => (
                    <li key={index} className="flex items-center space-x-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {item.href ? (
                            <Link href={item.href} className="hover:text-[var(--theme-primary)] transition-colors">
                                {item.label}
                            </Link>
                        ) : (
                            <span className="text-gray-900 font-semibold" aria-current="page">
                                {item.label}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
