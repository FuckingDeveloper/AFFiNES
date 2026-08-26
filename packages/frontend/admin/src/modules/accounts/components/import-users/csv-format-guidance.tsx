import { WarningIcon } from '@blocksuite/icons/rc';
import type { FC } from 'react';

interface CsvFormatGuidanceProps {
  passwordLimits: {
    minLength: number;
    maxLength: number;
  };
}

/**
 * Component that displays CSV format guidelines
 */
export const CsvFormatGuidance: FC<CsvFormatGuidanceProps> = ({
  passwordLimits,
}) => {
  return (
    <div className="flex gap-1 rounded-[6px] bg-secondary p-1.5 text-xs text-muted-foreground">
      <div className="flex justify-center py-0.5">
        <WarningIcon fontSize={16} className="text-foreground" />
      </div>
      <div>
        <p>CSV-файл содержит логин, имя пользователя, email и пароль.</p>
        <ul>
          {[
            `Логин (необязательно): 3–32 символа, латиница, цифры, точка, дефис или подчёркивание.`,
            `Имя пользователя (необязательно): любой текст.`,
            `Email (обязательно): например, user@example.com.`,
            `Пароль (необязательно): ${passwordLimits.minLength}–${passwordLimits.maxLength} символов.`,
          ].map((text, index) => (
            <li
              key={`guidance-${index}`}
              className="relative pl-2 leading-normal"
            >
              <span className="absolute left-0 top-2 w-1 h-1 rounded-full bg-current" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
