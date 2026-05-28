import { Link } from '@/navigation';
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
        <nav className={`flex items-center text-sm font-medium text-[var(--foreground-muted)] ${className}`} aria-label="Breadcrumb">
            <ol className="flex items-center gap-1 sm:gap-2">
                {/* ルート: ホーム */}
                <li>
                    <Link href="/" className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg transition-colors hover:text-[var(--theme-primary)] sm:min-w-0 sm:justify-start sm:px-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">{t('home')}</span>
                    </Link>
                </li>

                {items.map((item, index) => (
                    <li key={item.href ?? `breadcrumb-${index}`} className="flex items-center gap-1 sm:gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {item.href ? (
                            <Link href={item.href} className="inline-flex min-h-[44px] items-center rounded-lg px-2 transition-colors hover:text-[var(--theme-primary)]">
                                {item.label}
                            </Link>
                        ) : (
                            <span className="text-[var(--foreground)] font-semibold" aria-current="page">
                                {item.label}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
