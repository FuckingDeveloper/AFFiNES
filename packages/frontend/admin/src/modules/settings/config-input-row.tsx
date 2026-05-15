import { Input } from '@affine/admin/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@affine/admin/components/ui/select';
import { Switch } from '@affine/admin/components/ui/switch';
import { cn } from '@affine/admin/utils';
import { Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import { Textarea } from '../../components/ui/textarea';

export type ConfigInputProps = {
  field: string;
  desc: string;
  defaultValue: any;
  onChange: (field: string, value: any) => void;
  error?: string;
  onErrorChange?: (field: string, error?: string) => void;
  sensitive?: boolean;
  example?: string;
} & (
  | {
      type: 'String' | 'Number' | 'Boolean' | 'JSON';
    }
  | {
      type: 'Enum';
      options: string[];
    }
);

const Inputs: Record<
  ConfigInputProps['type'],
  React.ComponentType<{
    defaultValue: any;
    onChange: (value?: any) => void;
    options?: string[];
    error?: string;
    onValidationChange?: (error?: string) => void;
    sensitive?: boolean;
  }>
> = {
  Boolean: function SwitchInput({ defaultValue, onChange }) {
    const handleSwitchChange = (checked: boolean) => {
      onChange(checked);
    };

    return (
      <Switch
        checked={Boolean(defaultValue)}
        onCheckedChange={handleSwitchChange}
      />
    );
  },
  String: function StringInput({ defaultValue, onChange, sensitive }) {
    const { t } = useI18n();
    const [revealed, setRevealed] = useState(false);
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    return (
      <div className="relative">
        <Input
          type={sensitive && !revealed ? 'password' : 'text'}
          minLength={1}
          value={defaultValue ?? ''}
          onChange={handleInputChange}
          autoComplete={sensitive ? 'new-password' : undefined}
          className={sensitive ? 'pr-10' : undefined}
        />
        {sensitive ? (
          <button
            type="button"
            className="absolute right-0 top-0 inline-flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setRevealed(prev => !prev);
            }}
            aria-label={
              revealed ? t('settings.hideSecret') : t('settings.showSecret')
            }
            title={revealed ? t('settings.hide') : t('settings.show')}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
      </div>
    );
  },
  Number: function NumberInput({ defaultValue, onChange }) {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      onChange(next === '' ? undefined : parseInt(next, 10));
    };

    return (
      <Input
        type="number"
        value={defaultValue ?? ''}
        onChange={handleInputChange}
      />
    );
  },
  JSON: function ObjectInput({
    defaultValue,
    onChange,
    error,
    onValidationChange,
  }) {
    const { t } = useI18n();
    const fallbackText = useMemo(
      () =>
        typeof defaultValue === 'string'
          ? defaultValue
          : JSON.stringify(defaultValue ?? null),
      [defaultValue]
    );
    const [text, setText] = useState(fallbackText);

    useEffect(() => {
      setText(fallbackText);
    }, [fallbackText]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextText = e.target.value;
      setText(nextText);
      try {
        const value = JSON.parse(nextText);
        onValidationChange?.(undefined);
        onChange(value);
      } catch {
        onValidationChange?.(t('settings.invalidJson'));
        onChange(nextText);
      }
    };

    return (
      <Textarea
        value={text}
        onChange={handleInputChange}
        className={cn(
          'w-full',
          error
            ? 'border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20'
            : undefined
        )}
      />
    );
  },
  Enum: function EnumInput({ defaultValue, onChange, options }) {
    const { t } = useI18n();
    return (
      <Select
        value={typeof defaultValue === 'string' ? defaultValue : undefined}
        onValueChange={onChange}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('settings.selectOption')} />
        </SelectTrigger>
        <SelectContent>
          {options?.map(option => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  },
};

export const ConfigRow = ({
  field,
  desc,
  type,
  defaultValue,
  onChange,
  error,
  onErrorChange,
  example,
  ...props
}: ConfigInputProps) => {
  const { t } = useI18n();
  const Input = Inputs[type] ?? Inputs.JSON;
  const [validationError, setValidationError] = useState<string>();

  const onValueChange = useCallback(
    (value?: any) => {
      onChange(field, value);
    },
    [field, onChange]
  );

  const onValidationChange = useCallback((nextError?: string) => {
    setValidationError(nextError);
  }, []);

  const mergedError = error ?? validationError;

  useEffect(() => {
    onErrorChange?.(field, mergedError);
    return () => {
      onErrorChange?.(field, undefined);
    };
  }, [field, mergedError, onErrorChange]);

  const exampleValue = example && example !== `fields.${field.replace(/\//g, '.')}.example` ? example : undefined;

  return (
    <div
      className={cn(
        'flex flex-grow gap-3',
        type === 'Boolean' ? 'items-start justify-between' : 'flex-col'
      )}
    >
      <div className="flex-3">
        <div
          className="text-sm font-semibold leading-6 text-foreground"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
        {exampleValue ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {t('settings.example')}: <code className="rounded bg-muted px-1 py-0.5 font-mono">{exampleValue}</code>
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          'relative flex flex-1 flex-col',
          type === 'Boolean' ? 'items-end' : 'items-stretch'
        )}
      >
        <Input
          defaultValue={defaultValue}
          onChange={onValueChange}
          error={mergedError}
          onValidationChange={onValidationChange}
          {...props}
        />
        {mergedError && (
          <div className="mt-1 w-full break-words text-sm text-destructive">
            {mergedError}
          </div>
        )}
      </div>
    </div>
  );
};
