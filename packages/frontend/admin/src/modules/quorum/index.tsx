import { Button } from '@affine/admin/components/ui/button';
import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import { useCallback, useMemo, useState } from 'react';

import { affineFetch } from '../../fetch-utils';
import { useI18n } from '../../i18n';
import { Header } from '../header';

interface ShareExportResponse {
  keySetId: string;
  shareSetId: string;
  threshold: number;
  totalShares: number;
  shares: Array<{ index: number; value: string }>;
}

const downloadShare = (value: string, index: number, keySetId: string) => {
  const fileName = `trackwork-share-${index}.txt`;
  const content =
    'TrackWork quorum share - handle as a secret. Any 2 of 3 shares reconstruct the KEK.\n\n' +
    value +
    '\n';
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  void keySetId;
};

export function QuorumPage() {
  const { t } = useI18n();
  const [result, setResult] = useState<ShareExportResponse | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const prefix = useMemo(() => environment.subPath.replace(/\/$/, ''), []);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await affineFetch(
        `${prefix}/api/admin/trackwork/quorum/shares/export`,
        { method: 'POST' }
      );
      if (!res.ok) {
        setError(t('quorum.failed'));
        return;
      }
      const body = (await res.json()) as ShareExportResponse;
      setResult(body);
      setRevealed(new Set());
    } catch {
      setError(t('quorum.failed'));
    } finally {
      setGenerating(false);
    }
  }, [prefix, t]);

  const toggleReveal = useCallback((index: number) => {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setResult(null);
    setRevealed(new Set());
  }, []);

  return (
    <div className="h-dvh flex-1 space-y-1 flex-col flex">
      <Header title={t('quorum.title')} />
      <ScrollArea>
        <div className="space-y-4 p-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {t('quorum.warning')}
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          {!result ? (
            <Button onClick={() => void generate()} disabled={generating}>
              {generating ? '...' : t('quorum.generate')}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-green-700">
                {t('quorum.generated')}
              </div>
              {result.shares.map(share => {
                const visible = revealed.has(share.index);
                return (
                  <div
                    key={share.index}
                    className="rounded-md border p-3 space-y-2"
                  >
                    <div className="text-sm font-medium">
                      {t('quorum.share')} {share.index}
                    </div>
                    <div className="break-all rounded bg-gray-100 p-2 font-mono text-xs">
                      {visible ? share.value : 'twshare-v1.' + '•'.repeat(32)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => toggleReveal(share.index)}
                      >
                        {visible ? t('quorum.hide') : t('quorum.reveal')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          downloadShare(
                            share.value,
                            share.index,
                            result.keySetId
                          )
                        }
                      >
                        {t('quorum.download')}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button variant="ghost" onClick={close}>
                {t('quorum.close')}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export { QuorumPage as Component };
