import { Button } from '@affine/admin/components/ui/button';
import type { CarouselApi } from '@affine/admin/components/ui/carousel';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@affine/admin/components/ui/carousel';
import { validateEmailAndPassword } from '@affine/admin/utils';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { affineFetch } from '../../fetch-utils';
import { useRevalidateServerConfig, useServerConfig } from '../common';
import { CreateAdmin } from './create-admin';

export enum CarouselSteps {
  Welcome = 0,
  SystemCheck,
  CreateAdmin,
  SettingsDone,
}

const Welcome = () => {
  return (
    <div
      className="flex flex-col h-full w-full mt-60 max-lg:items-center max-lg:mt-16"
      style={{ minHeight: '300px' }}
    >
      <h1 className="text-5xl font-extrabold max-lg:text-3xl max-lg:font-bold">
        Добро пожаловать в MRH TrackWork
      </h1>
      <p className="mt-5 font-semibold text-xl max-lg:px-4 max-lg:text-lg">
        Настройте Self-Hosted TrackWork в несколько простых шагов.
      </p>
    </div>
  );
};

const SystemCheck = ({
  systemReady,
  onSystemReadyChange,
}: {
  systemReady: boolean;
  onSystemReadyChange: (ready: boolean) => void;
}) => {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      const response = await affineFetch('/health/ready');
      if (!response.ok) {
        throw new Error('Сервер пока не готов');
      }
      const result = (await response.json()) as {
        services?: { postgres?: string; redis?: string };
      };
      const ready =
        result.services?.postgres === 'ok' && result.services?.redis === 'ok';
      onSystemReadyChange(ready);
      if (!ready) {
        throw new Error('PostgreSQL или Redis недоступен');
      }
    } catch (err) {
      onSystemReadyChange(false);
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }, [onSystemReadyChange]);

  useEffect(() => {
    check().catch(() => {});
  }, [check]);

  return (
    <div
      className="flex flex-col h-full w-full mt-44 max-w-2xl max-lg:items-center max-lg:mt-16"
      style={{ minHeight: '300px' }}
    >
      <h1 className="text-4xl font-extrabold max-lg:text-3xl">
        Проверка сервисов
      </h1>
      <p className="mt-5 text-lg">
        PostgreSQL и Redis должны быть доступны до создания администратора.
      </p>
      <div className="mt-6 rounded-md border p-4 w-full">
        <div>PostgreSQL: {systemReady ? 'доступен' : 'проверяется'}</div>
        <div>Redis: {systemReady ? 'доступен' : 'проверяется'}</div>
        {error ? <div className="mt-3 text-destructive">{error}</div> : null}
      </div>
      {!systemReady ? (
        <Button
          className="mt-4"
          onClick={() => {
            check().catch(() => {});
          }}
          disabled={checking}
        >
          {checking ? 'Проверяем…' : 'Проверить снова'}
        </Button>
      ) : null}
    </div>
  );
};

const SettingsDone = () => {
  return (
    <div
      className="flex flex-col h-full w-full mt-60 max-lg:items-center max-lg:mt-16"
      style={{ minHeight: '300px' }}
    >
      <h1 className="text-5xl font-extrabold max-lg:text-3xl max-lg:font-bold">
        Настройка завершена
      </h1>
      <p className="mt-5 font-semibold text-xl max-lg:px-4 max-lg:text-lg">
        TrackWork готов к использованию.
      </p>
      <p className="mt-5 max-w-2xl text-base max-lg:px-4">
        Сразу после запуска настройте регулярную резервную копию PostgreSQL,
        каталога загрузок и каталога конфигурации. Инструкция доступна на{' '}
        <a
          className="underline"
          href={BUILD_CONFIG.helpUrl}
          target="_blank"
          rel="noreferrer"
        >
          странице помощи
        </a>
        .
      </p>
    </div>
  );
};

const CarouselItemElements = {
  [CarouselSteps.Welcome]: Welcome,
  [CarouselSteps.SystemCheck]: SystemCheck,
  [CarouselSteps.CreateAdmin]: CreateAdmin,
  [CarouselSteps.SettingsDone]: SettingsDone,
};

export const Form = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  const navigate = useNavigate();

  const [usernameValue, setUsernameValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [invalidUsername, setInvalidUsername] = useState(false);
  const [invalidPassword, setInvalidPassword] = useState(false);
  const [systemReady, setSystemReady] = useState(false);

  const serverConfig = useServerConfig();
  const refreshServerConfig = useRevalidateServerConfig();
  const passwordLimits = serverConfig.credentialsRequirement.password;

  const isCreateAdminStep = current - 1 === CarouselSteps.CreateAdmin;
  const isSystemCheckStep = current - 1 === CarouselSteps.SystemCheck;

  const disableContinue =
    ((!usernameValue || !nameValue || !emailValue || !passwordValue) &&
      isCreateAdminStep) ||
    (isSystemCheckStep && !systemReady);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    api.on('select', () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api, serverConfig.initialized, navigate]);

  const createAdmin = useCallback(async () => {
    try {
      const createResponse = await affineFetch('/api/setup/create-admin-user', {
        method: 'POST',
        body: JSON.stringify({
          username: usernameValue,
          name: nameValue,
          email: emailValue,
          password: passwordValue,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(
          errorData.message || 'Не удалось создать администратора'
        );
      }

      await createResponse.json();
      await refreshServerConfig();
      toast.success('Аккаунт администратора успешно создан.');
    } catch (err) {
      toast.error((err as Error).message);
      console.error(err);
      throw err;
    }
  }, [
    usernameValue,
    nameValue,
    emailValue,
    passwordValue,
    refreshServerConfig,
  ]);

  const onNext = useAsyncCallback(async () => {
    if (isCreateAdminStep) {
      const validUsername = /^[a-z0-9][a-z0-9._-]{2,31}$/.test(
        usernameValue.trim().toLowerCase()
      );
      setInvalidUsername(!validUsername);
      if (!validUsername) {
        return;
      }
      if (
        !validateEmailAndPassword(
          emailValue,
          passwordValue,
          passwordLimits,
          setInvalidEmail,
          setInvalidPassword
        )
      ) {
        return;
      } else {
        try {
          await createAdmin();
          setInvalidEmail(false);
          setInvalidPassword(false);
        } catch (e) {
          console.error(e);
          setInvalidEmail(true);
          setInvalidPassword(true);
          return;
        }
      }
    }

    if (current === count) {
      return navigate('/', { replace: true });
    }

    api?.scrollNext();
  }, [
    api,
    count,
    createAdmin,
    current,
    emailValue,
    isCreateAdminStep,
    navigate,
    passwordLimits,
    passwordValue,
    usernameValue,
  ]);

  const onPrevious = useAsyncCallback(async () => {
    if (current === count) {
      if (serverConfig.initialized === true) {
        return navigate('/admin', { replace: true });
      }
      toast.error('Не удалось перейти в админ-панель, попробуйте снова.');
      return;
    }
    api?.scrollPrev();
  }, [api, count, current, serverConfig.initialized, navigate]);

  return (
    <div className="flex flex-col justify-between h-full w-full  lg:pl-36 max-lg:items-center ">
      <Carousel
        setApi={setApi}
        className=" h-full w-full"
        opts={{ watchDrag: false }}
      >
        <CarouselContent>
          {Object.entries(CarouselItemElements).map(([key, Element]) => (
            <CarouselItem key={key}>
              <Element
                username={usernameValue}
                name={nameValue}
                email={emailValue}
                password={passwordValue}
                invalidEmail={invalidEmail}
                invalidUsername={invalidUsername}
                invalidPassword={invalidPassword}
                passwordLimits={passwordLimits}
                systemReady={systemReady}
                onSystemReadyChange={setSystemReady}
                onNameChange={setNameValue}
                onUsernameChange={setUsernameValue}
                onEmailChange={setEmailValue}
                onPasswordChange={setPasswordValue}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div>
        {current > 1 && (
          <Button className="mr-3" onClick={onPrevious} variant="outline">
            {current === count ? 'Перейти в админ-панель' : 'Назад'}
          </Button>
        )}
        <Button onClick={onNext} disabled={disableContinue}>
          {current === count ? 'Открыть TrackWork' : 'Продолжить'}
        </Button>
      </div>

      <div className="py-2 px-0 text-sm mt-16 max-lg:mt-5 relative">
        {Array.from({ length: count }).map((_, index) => (
          <span
            key={`${index}`}
            className={`inline-block w-16 h-1 rounded mr-1 ${
              index <= current - 1
                ? 'bg-primary'
                : 'bg-muted-foreground opacity-20'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
