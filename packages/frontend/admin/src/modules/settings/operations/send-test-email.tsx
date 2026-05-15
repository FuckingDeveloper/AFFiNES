import { Button } from '@affine/admin/components/ui/button';
import { useMutation } from '@affine/admin/use-mutation';
import { notify } from '@affine/component';
import type { UserFriendlyError } from '@affine/error';
import { sendTestEmailMutation } from '@affine/graphql';
import { useCallback } from 'react';

import { useI18n } from '../../../i18n';
import type { AppConfig } from '../config';

export function SendTestEmail({ appConfig }: { appConfig: AppConfig }) {
  const { trigger } = useMutation({
    mutation: sendTestEmailMutation,
  });
  const { t } = useI18n();

  const onClick = useCallback(() => {
    trigger(appConfig.mailer.SMTP)
      .then(() => {
        notify.success({
          title: t('settings.testEmailSent'),
          message: t('settings.testEmailSentMessage'),
        });
      })
      .catch((err: UserFriendlyError) => {
        notify.error({
          title: t('settings.testEmailFailed'),
          message: err.message,
        });
      });
  }, [appConfig, trigger, t]);

  return <Button onClick={onClick}>{t('settings.sendTestEmail')}</Button>;
}
