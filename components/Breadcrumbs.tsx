import Link from 'next/link';
import { ReactNode } from 'react';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbsProps {
    items?: BreadcrumbItem[];
    className?: string;
}

export default function Breadcrumbs({ items = [], className = "" }: BreadcrumbsProps) {
    return (
        <nav className={`flex items-center text-sm font-medium text-gray-500 ${className}`} aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2">
                {/* Root: Home */}
                <li>
                    <Link href="/" className="hover:text-indigo-600 transition-colors flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">Home</span>
                    </Link>
                </li>

                {items.map((item, index) => (
                    <li key={index} className="flex items-center space-x-2">
                        <span className="text-gray-300">/</span>
                        {item.href ? (
                            <Link href={item.href} className="hover:text-indigo-600 transition-colors">
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
