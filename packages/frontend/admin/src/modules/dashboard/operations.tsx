import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@affine/admin/components/ui/card';
import { affineFetch } from '@affine/admin/fetch-utils';
import { useQuery } from '@affine/admin/use-query';
import { adminAuditLogsQuery } from '@affine/graphql';
import { CheckCircle2Icon, CircleAlertIcon, ServerIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Readiness = {
  status: 'ok';
  services: {
    postgres: 'ok';
    redis: 'ok';
  };
};

type ServerInfo = {
  compatibility: string;
  message: string;
  type: string;
  flavor: string;
};

function apiUrl(path: string) {
  const prefix = environment.subPath.replace(/\/$/, '');
  return `${prefix}${path}` || path;
}

export function OperationsHealth() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [readyResponse, infoResponse] = await Promise.all([
        affineFetch(apiUrl('/health/ready')),
        affineFetch(apiUrl('/info')),
      ]);
      if (!readyResponse.ok || !infoResponse.ok) {
        throw new Error('Health endpoint is unavailable');
      }
      setReadiness((await readyResponse.json()) as Readiness);
      setInfo((await infoResponse.json()) as ServerInfo);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = window.setInterval(() => refresh().catch(() => {}), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const healthy = !error && readiness?.status === 'ok';

  return (
    <Card className="border-border/60 bg-card shadow-1">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerIcon className="h-4 w-4" /> Состояние сервера
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusItem
          label="TrackWork Server"
          ok={healthy}
          value={info?.message}
        />
        <StatusItem
          label="PostgreSQL"
          ok={readiness?.services.postgres === 'ok'}
          value={readiness?.services.postgres}
        />
        <StatusItem
          label="Redis"
          ok={readiness?.services.redis === 'ok'}
          value={readiness?.services.redis}
        />
        <StatusItem
          label="Сборка WEB/Admin"
          ok
          value={BUILD_CONFIG.displayVersion}
        />
      </CardContent>
    </Card>
  );
}

function StatusItem({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value?: string;
}) {
  const Icon = ok ? CheckCircle2Icon : CircleAlertIcon;
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon
          className={ok ? 'h-4 w-4 text-green-600' : 'h-4 w-4 text-red-600'}
        />
        {label}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {value ?? 'Проверка…'}
      </div>
    </div>
  );
}

const actionNames: Record<string, string> = {
  'user.create': 'Создание пользователя',
  'user.import': 'Импорт пользователей',
  'user.update': 'Изменение пользователя',
  'user.delete': 'Удаление пользователя',
  'user.disable': 'Блокировка пользователя',
  'user.enable': 'Разблокировка пользователя',
};

export function AdminAuditLog() {
  const { data } = useQuery({
    query: adminAuditLogsQuery,
    variables: { first: 20, skip: 0 },
  });

  return (
    <Card className="border-border/60 bg-card shadow-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Журнал действий администраторов
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.adminAuditLogs.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Действий пока нет.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {data.adminAuditLogs.map(entry => (
              <div
                key={entry.id}
                className="grid gap-1 py-3 text-sm md:grid-cols-[1.2fr_1fr_1fr]"
              >
                <div className="font-medium">
                  {actionNames[entry.action] ?? entry.action}
                </div>
                <div className="truncate text-muted-foreground">
                  {entry.actorEmail}
                </div>
                <div className="text-muted-foreground md:text-right">
                  {new Date(entry.createdAt).toLocaleString('ru-RU')}
                </div>
                {entry.targetId ? (
                  <div className="truncate text-xs text-muted-foreground md:col-span-3">
                    Пользователь: {entry.targetId}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
