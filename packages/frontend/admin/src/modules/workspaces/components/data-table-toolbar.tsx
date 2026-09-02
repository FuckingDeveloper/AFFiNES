import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import type { FeatureType } from '@affine/graphql';
import { AdminWorkspaceSort } from '@affine/graphql';
import type { Table } from '@tanstack/react-table';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { FeatureFilterPopover } from '../../../components/shared/feature-filter-popover';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../components/ui/popover';
import { useDebouncedValue } from '../../../hooks/use-debounced-value';
import { useServerConfig } from '../../common';
import type { WorkspaceFlagFilter } from '../schema';

interface DataTableToolbarProps<TData> {
  table?: Table<TData>;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  selectedFeatures: FeatureType[];
  onFeaturesChange: (features: FeatureType[]) => void;
  flags: WorkspaceFlagFilter;
  onFlagsChange: (flags: WorkspaceFlagFilter) => void;
  sort: AdminWorkspaceSort | undefined;
  onSortChange: (sort: AdminWorkspaceSort | undefined) => void;
  disabled?: boolean;
}

const sortOptions: { value: AdminWorkspaceSort; label: string }[] = [
  { value: AdminWorkspaceSort.CreatedAt, label: 'Время создания' },
  { value: AdminWorkspaceSort.BlobCount, label: 'Количество blob' },
  { value: AdminWorkspaceSort.BlobSize, label: 'Размер blob' },
  { value: AdminWorkspaceSort.SnapshotCount, label: 'Количество снимков' },
  { value: AdminWorkspaceSort.SnapshotSize, label: 'Размер снимков' },
  { value: AdminWorkspaceSort.MemberCount, label: 'Количество участников' },
  { value: AdminWorkspaceSort.PublicPageCount, label: 'Публичные страницы' },
];

export function DataTableToolbar<TData>({
  keyword,
  onKeywordChange,
  selectedFeatures,
  onFeaturesChange,
  flags,
  onFlagsChange,
  sort,
  onSortChange,
  disabled = false,
}: DataTableToolbarProps<TData>) {
  const [value, setValue] = useState(keyword);
  const debouncedValue = useDebouncedValue(value, 400);
  const serverConfig = useServerConfig();
  const availableFeatures = serverConfig.availableWorkspaceFeatures ?? [];

  useEffect(() => {
    setValue(keyword);
  }, [keyword]);

  useEffect(() => {
    onKeywordChange(debouncedValue.trim());
  }, [debouncedValue, onKeywordChange]);

  const onValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.currentTarget.value);
  }, []);

  const handleSortChange = useCallback(
    (value: AdminWorkspaceSort) => {
      onSortChange(value);
    },
    [onSortChange]
  );

  const selectedSortLabel = useMemo(
    () =>
      sortOptions.find(option => option.value === sort)?.label ??
      'Время создания',
    [sort]
  );

  const flagOptions: { key: keyof WorkspaceFlagFilter; label: string }[] = [
    { key: 'public', label: 'Публичный' },
    { key: 'enableSharing', label: 'Разрешить общий доступ' },
    { key: 'enableAi', label: 'Включить AI' },
    { key: 'enableUrlPreview', label: 'Включить предпросмотр URL' },
    { key: 'enableDocEmbedding', label: 'Включить встраивание документов' },
  ];

  const flagLabel = (value: boolean | undefined) => {
    if (value === true) return 'Вкл';
    if (value === false) return 'Выкл';
    return 'Любой';
  };

  const handleFlagToggle = useCallback(
    (key: keyof WorkspaceFlagFilter) => {
      const current = flags[key];
      const next =
        current === undefined ? true : current === true ? false : undefined;
      onFlagsChange({ ...flags, [key]: next });
    },
    [flags, onFlagsChange]
  );

  const hasFlagFilter = useMemo(
    () => Object.values(flags).some(v => v !== undefined),
    [flags]
  );

  return (
    <div className="flex items-center justify-between gap-y-2 gap-x-4 flex-wrap">
      <FeatureFilterPopover
        selectedFeatures={selectedFeatures}
        availableFeatures={availableFeatures}
        onChange={onFeaturesChange}
        align="start"
        disabled={disabled}
      />

      <div className="flex items-center gap-y-2 flex-wrap justify-end gap-2">
        <Popover open={disabled ? false : undefined}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 lg:px-3"
              disabled={disabled}
            >
              Сортировка: {selectedSortLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2">
            <div className="flex flex-col gap-1">
              {sortOptions.map(option => (
                <Button
                  key={option.value}
                  variant="ghost"
                  className="justify-start"
                  size="sm"
                  disabled={disabled}
                  onClick={() => handleSortChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={disabled ? false : undefined}>
          <PopoverTrigger asChild>
            <Button
              variant={hasFlagFilter ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 px-2 lg:px-3"
              disabled={disabled}
            >
              Флаги
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-2">
            <div className="flex flex-col gap-1">
              {flagOptions.map(option => (
                <Button
                  key={option.key}
                  variant="ghost"
                  className="justify-between"
                  size="sm"
                  disabled={disabled}
                  onClick={() => handleFlagToggle(option.key)}
                >
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {flagLabel(flags[option.key])}
                  </span>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex">
          <Input
            placeholder="Поиск рабочего пространства / владельца"
            value={value}
            onChange={onValueChange}
            className="h-8 w-[150px] lg:w-[250px]"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
