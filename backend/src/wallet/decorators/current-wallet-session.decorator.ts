import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { WalletAuthenticatedRequest } from '../guards/wallet-session.guard';
import type { WalletSessionContext } from '../wallet-auth.service';

export const CurrentWalletSession = createParamDecorator(
  (
    data: keyof WalletSessionContext | undefined,
    ctx: ExecutionContext,
  ): WalletSessionContext | WalletSessionContext[keyof WalletSessionContext] | undefined => {
    const request = ctx.switchToHttp().getRequest<WalletAuthenticatedRequest>();
    const session = request.wallet;
    return data ? session?.[data] : session;
  },
);
