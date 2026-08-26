import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  BadRequest,
  InvalidAuthState,
  InvalidEmail,
  PasswordRequired,
  Throttle,
  UseNamedGuard,
} from '../../base';
import { Models, TokenType } from '../../models';
import { validators } from '../utils/validators';
import { Public } from './guard';
import { AuthService } from './service';
import { CurrentUser, Session } from './session';

interface PreflightResponse {
  registered: boolean;
  hasPassword: boolean;
}

interface SignInCredential {
  email: string;
  password?: string;
  twoFactorCode?: string;
  callbackUrl?: string;
  client_nonce?: string;
}

interface MagicLinkCredential {
  email: string;
  token: string;
  client_nonce?: string;
}

interface OpenAppSignInCredential {
  code: string;
}

interface TwoFactorEnableCredential {
  code: string;
  secret: string;
}

interface TwoFactorCodeCredential {
  code: string;
}

@Throttle('strict')
@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly models: Models
  ) {}

  @Public()
  @UseNamedGuard('version')
  @Post('/preflight')
  async preflight(
    @Body() params?: { email: string }
  ): Promise<PreflightResponse> {
    if (!params?.email) {
      throw new InvalidEmail({ email: 'not provided' });
    }
    const login = validators.assertValidLogin(params.email);

    const user = await this.models.user.getUserByLogin(login);
    const canPasswordSignIn = await this.auth.canPasswordSignIn(login);

    if (!user) {
      return {
        registered: false,
        hasPassword: canPasswordSignIn,
      };
    }

    return {
      registered: user.registered,
      hasPassword: canPasswordSignIn,
    };
  }

  @Public()
  @UseNamedGuard('version', 'captcha')
  @Post('/sign-in')
  @Header('content-type', 'application/json')
  async signIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: SignInCredential
  ) {
    const login = validators.assertValidLogin(credential.email);
    const canSignIn = await this.auth.canSignIn(login);
    if (!canSignIn) {
      throw new ActionForbidden();
    }

    if (!credential.password) {
      throw new PasswordRequired();
    }

    await this.passwordSignIn(
      req,
      res,
      login,
      credential.password,
      credential.twoFactorCode
    );
  }

  async passwordSignIn(
    req: Request,
    res: Response,
    email: string,
    password: string,
    twoFactorCode?: string
  ) {
    const user = await this.auth.signIn(email, password);
    await this.auth.verifySignInTwoFactor(user.id, twoFactorCode);

    await this.auth.setCookies(req, res, user.id);
    res.status(HttpStatus.OK).send(user);
  }

  @UseNamedGuard('version')
  @Get('/2fa/status')
  async twoFactorStatus(@CurrentUser() user?: CurrentUser) {
    if (!user) {
      throw new ActionForbidden();
    }

    return await this.auth.getTwoFactorStatus(user.id);
  }

  @UseNamedGuard('version')
  @Post('/2fa/setup')
  async setupTwoFactor(@CurrentUser() user?: CurrentUser) {
    if (!user) {
      throw new ActionForbidden();
    }

    return await this.auth.createTwoFactorSetup(user);
  }

  @UseNamedGuard('version')
  @Post('/2fa/enable')
  async enableTwoFactor(
    @CurrentUser() user?: CurrentUser,
    @Body() credential?: TwoFactorEnableCredential
  ) {
    if (!user) {
      throw new ActionForbidden();
    }
    if (!credential?.secret || !credential?.code) {
      throw new BadRequest('TWO_FACTOR_INVALID');
    }

    await this.auth.enableTwoFactor(
      user.id,
      credential.secret,
      credential.code
    );
    return { enabled: true };
  }

  @UseNamedGuard('version')
  @Post('/2fa/disable')
  async disableTwoFactor(
    @CurrentUser() user?: CurrentUser,
    @Body() credential?: TwoFactorCodeCredential
  ) {
    if (!user) {
      throw new ActionForbidden();
    }
    if (!credential?.code) {
      throw new BadRequest('TWO_FACTOR_INVALID');
    }

    await this.auth.disableTwoFactor(user.id, credential.code);
    return { enabled: false };
  }

  @Public()
  /**
   * @deprecated Kept for 0.25 clients that still call GET `/api/auth/sign-out`.
   * Use POST `/api/auth/sign-out` instead.
   */
  @Get('/sign-out')
  async signOutDeprecated(
    @Res() res: Response,
    @Session() session: Session | undefined,
    @Query('user_id') userId: string | undefined
  ) {
    res.setHeader('Deprecation', 'true');

    if (!session) {
      res.status(HttpStatus.OK).send({});
      return;
    }

    await this.auth.signOut(session.sessionId, userId);
    await this.auth.refreshCookies(res, session.sessionId);

    res.status(HttpStatus.OK).send({});
  }

  @Public()
  @Post('/sign-out')
  async signOut(
    @Req() req: Request,
    @Res() res: Response,
    @Session() session: Session | undefined,
    @Query('user_id') userId: string | undefined
  ) {
    if (!session) {
      res.status(HttpStatus.OK).send({});
      return;
    }

    const csrfCookie = req.cookies?.[AuthService.csrfCookieName] as
      | string
      | undefined;
    const csrfHeader = req.get('x-affine-csrf-token');
    if (
      csrfHeader && // optional for backward compatibility, drop after 0.25.0 outdated
      (!csrfCookie || csrfCookie !== csrfHeader)
    ) {
      throw new ActionForbidden();
    }

    await this.auth.signOut(session.sessionId, userId);
    await this.auth.refreshCookies(res, session.sessionId);

    res.status(HttpStatus.OK).send({});
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/open-app/sign-in-code')
  async openAppSignInCode(@CurrentUser() user?: CurrentUser) {
    if (!user) {
      throw new ActionForbidden();
    }

    // short-lived one-time code for handing off the authenticated session
    const code = await this.models.verificationToken.create(
      TokenType.OpenAppSignIn,
      user.id,
      5 * 60
    );

    return { code };
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/open-app/sign-in')
  async openAppSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: OpenAppSignInCredential
  ) {
    if (!credential?.code) {
      throw new InvalidAuthState();
    }

    const tokenRecord = await this.models.verificationToken.get(
      TokenType.OpenAppSignIn,
      credential.code
    );

    if (!tokenRecord?.credential) {
      throw new InvalidAuthState();
    }

    await this.auth.setCookies(req, res, tokenRecord.credential);
    res.send({ id: tokenRecord.credential });
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/magic-link')
  async magicLinkSignIn(@Body() _credential: MagicLinkCredential) {
    throw new ActionForbidden('Email sign-in is disabled');
  }

  @UseNamedGuard('version')
  @Throttle('default', { limit: 1200 })
  @Public()
  @Get('/session')
  async currentSessionUser(@CurrentUser() user?: CurrentUser) {
    return {
      user,
    };
  }

  @Throttle('default', { limit: 1200 })
  @Public()
  @Get('/sessions')
  async currentSessionUsers(@Req() req: Request) {
    const token = req.cookies[AuthService.sessionCookieName];
    if (!token) {
      return {
        users: [],
      };
    }

    return {
      users: await this.auth.getUserList(token),
    };
  }
}
