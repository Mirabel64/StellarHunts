import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  WalletAuthService,
  WalletSessionContext,
} from '../wallet-auth.service';

export interface WalletAuthenticatedRequest extends Request {
  wallet?: WalletSessionContext;
}

/**
 * Authenticates `Authorization: Bearer <wallet session token>` requests.
 *
 * Only wallet-session tokens are accepted here; account access tokens are
 * rejected because they carry no `wallet-session` type marker. That keeps the
 * two token families separate in both directions.
 */
@Injectable()
export class WalletSessionGuard implements CanActivate {
  constructor(private readonly walletAuthService: WalletAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WalletAuthenticatedRequest>();
    const rawToken = this.extractToken(request);

    if (!rawToken) {
      throw new UnauthorizedException('Wallet session token is required');
    }

    request.wallet = await this.walletAuthService.validateSession(rawToken);
    return true;
  }

  private extractToken(request: WalletAuthenticatedRequest): string | undefined {
    const header = request.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length).trim();
      return token.length > 0 ? token : undefined;
    }
    return undefined;
  }
}
