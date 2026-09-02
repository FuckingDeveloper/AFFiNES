import { Button } from '@affine/admin/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@affine/admin/components/ui/dropdown-menu';
import { Languages } from 'lucide-react';

import { useI18n } from '../../i18n';

export function LanguageSwitcher() {
  const { t, locale, setLocale } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Languages size={14} />
          {t(`language.${locale}`)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => setLocale('en')}
          className={locale === 'en' ? 'font-bold' : ''}
        >
          {t('language.en')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocale('ru')}
          className={locale === 'ru' ? 'font-bold' : ''}
        >
          {t('language.ru')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
