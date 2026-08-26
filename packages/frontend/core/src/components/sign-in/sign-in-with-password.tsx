import { notify } from '@affine/component';
import {
  AuthContainer,
  AuthContent,
  AuthFooter,
  AuthHeader,
  AuthInput,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  AuthService,
  CaptchaService,
  ServerService,
} from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { Unreachable } from '@affine/env/constant';
import { UserFriendlyError } from '@affine/error';
import { ServerAuthMode } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

import type { SignInState } from '.';
import { Back } from './back';
import { Captcha } from './captcha';
import * as styles from './style.css';

export const SignInWithPasswordStep = ({
  state,
  changeState,
  onAuthenticated,
}: {
  state: SignInState;
  changeState: Dispatch<SetStateAction<SignInState>>;
  onAuthenticated?: (status: AuthSessionStatus) => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);

  const email = state.email;

  if (!email) {
    throw new Unreachable();
  }

  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorHint, setPasswordErrorHint] = useState('');
  const [twoFactorError, setTwoFactorError] = useState(false);
  const [twoFactorErrorHint, setTwoFactorErrorHint] = useState('');
  const captchaService = useService(CaptchaService);
  const serverService = useService(ServerService);
  const serverName = useLiveData(
    serverService.server.config$.selector(c => c.serverName)
  );
  const authMode = useLiveData(
    serverService.server.config$.selector(c => c.authMode)
  );

  const verifyToken = useLiveData(captchaService.verifyToken$);
  const needCaptcha = useLiveData(captchaService.needCaptcha$);
  const challenge = useLiveData(captchaService.challenge$);
  const [isLoading, setIsLoading] = useState(false);

  const loginStatus = useLiveData(authService.session.status$);

  useEffect(() => {
    if (loginStatus === 'authenticated') {
      notify.success({
        title: t['com.affine.auth.toast.title.signed-in'](),
        message: t['com.affine.auth.toast.message.signed-in'](),
      });
    }
    onAuthenticated?.(loginStatus);
  }, [loginStatus, onAuthenticated, t]);

  useEffect(() => {
    setPasswordErrorHint(t['com.affine.auth.password.error']());
  }, [t]);

  useEffect(() => {
    setTwoFactorErrorHint(t['com.affine.auth.two-factor.error.invalid']());
  }, [t]);

  const onSignIn = useAsyncCallback(async () => {
    if (isLoading || (!verifyToken && needCaptcha)) return;
    setIsLoading(true);

    try {
      captchaService.revalidate();
      await authService.signInPassword({
        email,
        password,
        twoFactorCode: requireTwoFactor ? twoFactorCode : undefined,
        verifyToken,
        challenge,
      });
    } catch (err) {
      console.error(err);
      const error = UserFriendlyError.fromAny(err);

      if (
        error.is('WRONG_SIGN_IN_CREDENTIALS') ||
        error.is('PASSWORD_REQUIRED')
      ) {
        setPasswordError(true);
        setPasswordErrorHint(t['com.affine.auth.password.error']());
      } else if (
        error.is('BAD_REQUEST') &&
        error.message === 'TWO_FACTOR_REQUIRED'
      ) {
        setRequireTwoFactor(true);
        setTwoFactorError(true);
        setTwoFactorErrorHint(t['com.affine.auth.two-factor.error.required']());
      } else if (
        error.is('BAD_REQUEST') &&
        error.message === 'TWO_FACTOR_INVALID'
      ) {
        setRequireTwoFactor(true);
        setTwoFactorError(true);
        setTwoFactorErrorHint(
          t['com.affine.auth.two-factor.error.try-again']()
        );
      } else {
        setPasswordError(false);
        setTwoFactorError(false);
        notify.error({
          title: t['com.affine.auth.toast.title.failed'](),
          message: error.is('REQUEST_ABORTED')
            ? t['error.NETWORK_ERROR']()
            : t[`error.${error.name}`](error.data),
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading,
    verifyToken,
    needCaptcha,
    captchaService,
    authService,
    email,
    password,
    twoFactorCode,
    requireTwoFactor,
    challenge,
    t,
  ]);

  const authModeLabel =
    authMode === ServerAuthMode.LDAP
      ? 'LDAP'
      : authMode === ServerAuthMode.RADIUS
        ? 'RADIUS'
        : 'Password';

  return (
    <AuthContainer>
      <AuthHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={serverName}
      />

      <AuthContent>
        <div className={styles.authModeHint}>Sign in with {authModeLabel}</div>

        <AuthInput
          label={t['com.affine.settings.email']()}
          disabled={true}
          value={email}
        />
        <AuthInput
          autoFocus
          data-testid="password-input"
          label={t['com.affine.auth.password']()}
          value={password}
          type="password"
          onChange={(value: string) => {
            setPassword(value);
            if (passwordError) {
              setPasswordError(false);
              setPasswordErrorHint(t['com.affine.auth.password.error']());
            }
          }}
          error={passwordError}
          errorHint={passwordErrorHint}
          onEnter={onSignIn}
        />
        {requireTwoFactor ? (
          <AuthInput
            data-testid="two-factor-code-input"
            label={t['com.affine.auth.two-factor.label']()}
            value={twoFactorCode}
            type="text"
            autoComplete="one-time-code"
            onChange={(value: string) => {
              const normalized = value.replace(/\D+/g, '').slice(0, 6);
              setTwoFactorCode(normalized);
              if (twoFactorError) {
                setTwoFactorError(false);
                setTwoFactorErrorHint(
                  t['com.affine.auth.two-factor.error.invalid']()
                );
              }
            }}
            error={twoFactorError}
            errorHint={twoFactorErrorHint}
            onEnter={onSignIn}
          />
        ) : null}
        {!verifyToken && needCaptcha && <Captcha />}
        <Button
          data-testid="sign-in-button"
          variant="primary"
          size="extraLarge"
          style={{ width: '100%' }}
          disabled={isLoading || (!verifyToken && needCaptcha)}
          onClick={onSignIn}
        >
          {t['com.affine.auth.sign.in']()}
        </Button>
      </AuthContent>
      <AuthFooter>
        <Back changeState={changeState} />
      </AuthFooter>
    </AuthContainer>
  );
};
