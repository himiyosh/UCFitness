import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="hidden sm:block border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* リンク */}
          <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-gray-500">
            <a
              href="https://studio344.net"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--theme-primary)] transition-colors"
            >
              Studio344
            </a>
            <a
              href="https://studio344.net/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--theme-primary)] transition-colors"
            >
              {t('terms')}
            </a>
            <a
              href="https://studio344.net/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--theme-primary)] transition-colors"
            >
              {t('privacy')}
            </a>
            <a
              href="https://studio344.net/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--theme-primary)] transition-colors"
            >
              {t('contact')}
            </a>
          </nav>

          {/* コピーライト */}
          <p className="text-xs text-gray-400">
            &copy; {year}{' '}
            <a
              href="https://studio344.net"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--theme-primary)] transition-colors"
            >
              Studio344
            </a>
            . {t('allRightsReserved')}
          </p>
        </div>
      </div>
    </footer>
  );
}
