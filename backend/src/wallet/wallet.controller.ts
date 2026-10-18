import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../auth/services/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { User } from '../auth/entities/user.entity';
import { RateLimit } from '../rate-limiter/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limiter/rate-limit.guard';
import {
  WalletChallengeDto,
  WalletChallengeResponseDto,
} from './dto/wallet-challenge.dto';
import {
  LinkWalletDto,
  VerifyWalletSignatureDto,
  WalletSessionInfoDto,
  WalletSessionResponseDto,
} from './dto/verify-wallet-signature.dto';
import { CurrentWalletSession } from './decorators/current-wallet-session.decorator';
import { WalletSessionGuard } from './guards/wallet-session.guard';
import {
  WalletAuthService,
  type WalletSessionContext,
} from './wallet-auth.service';
import { WalletService } from './wallet.service';

@ApiTags('Wallet Authentication')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly walletAuthService: WalletAuthService,
    private readonly authService: AuthService,
  ) {}

  @Post('challenge')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    limit: 20,
    keyGenerator: (req) => req.body?.walletAddress,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a signable wallet challenge',
    description:
      'Issues a single-use, time-limited challenge bound to the wallet address and the configured domain. The wallet must sign the returned message bytes exactly.',
  })
  @ApiResponse({ status: 200, type: WalletChallengeResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid wallet address' })
  @ApiResponse({ status: 429, description: 'Too many challenges requested' })
  createChallenge(
    @Body() dto: WalletChallengeDto,
  ): Promise<WalletChallengeResponseDto> {
    return this.walletService.createChallenge(
      dto.walletAddress,
      dto.ttlSeconds,
    );
  }

  @Post('verify')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    limit: 10,
    keyGenerator: (req) => req.body?.walletAddress,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a wallet signature and start a session',
    description:
      'Verifies the ed25519 signature over the challenge message, consumes the nonce, and returns a session token. If the wallet is linked to an account, a standard account token pair is returned (`tokenType: Bearer`); otherwise a wallet-only session token is returned (`tokenType: WalletSession`).',
  })
  @ApiResponse({ status: 200, type: WalletSessionResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Unknown, expired, replayed or badly signed challenge',
  })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verify(
    @Body() dto: VerifyWalletSignatureDto,
  ): Promise<WalletSessionResponseDto> {
    await this.walletService.verifySignature(
      dto.walletAddress,
      dto.nonce,
      dto.signature,
    );

    const user = await this.walletService.findUserByWallet(dto.walletAddress);
    if (user) {
      const accountSession = await this.authService.issueSessionForUser(user);
      return {
        linked: true,
        walletAddress: dto.walletAddress,
        ...accountSession,
        user: accountSession.user,
      };
    }

    const session = await this.walletService.issueWalletSession(
      dto.walletAddress,
    );

    return {
      linked: false,
      walletAddress: dto.walletAddress,
      accessToken: session.accessToken,
      tokenType: 'WalletSession',
      expiresIn: session.expiresIn,
      user: null,
    };
  }

  @Get('session')
  @UseGuards(WalletSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Inspect the current wallet session',
    description:
      'Returns the wallet address, expiry and linked account (if any) for the presented wallet session token.',
  })
  @ApiResponse({ status: 200, type: WalletSessionInfoDto })
  @ApiResponse({ status: 401, description: 'Invalid or revoked session' })
  async getSession(
    @CurrentWalletSession() context: WalletSessionContext,
  ): Promise<
    WalletSessionInfoDto & {
      linked: boolean;
      user: { id: string; name: string; username: string } | null;
    }
  > {
    const user = await this.walletService.findUserByWallet(
      context.walletAddress,
    );

    return {
      walletAddress: context.walletAddress,
      userId: context.userId,
      expiresAt: context.session.expiresAt,
      createdAt: context.session.createdAt,
      lastSeenAt: context.session.lastSeenAt,
      linked: Boolean(user),
      user: user
        ? { id: user.id, name: user.name, username: user.username }
        : null,
    };
  }

  @Post('logout')
  @UseGuards(WalletSessionGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current wallet session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked session' })
  async logout(
    @CurrentWalletSession() context: WalletSessionContext,
  ): Promise<{ revoked: boolean }> {
    await this.walletAuthService.revokeSession(context.session.id);
    return { revoked: true };
  }

  @Post('link')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit({
    ttl: 300,
    limit: 5,
    keyGenerator: (req) =>
      (req.user as { id?: string } | undefined)?.id,
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link a wallet to the signed-in account',
    description:
      'Requires a valid challenge signature for the wallet address, so an address can only be linked by someone who controls its key.',
  })
  @ApiResponse({ status: 200, description: 'Wallet linked to the account' })
  @ApiResponse({ status: 401, description: 'Invalid or replayed signature' })
  @ApiResponse({
    status: 409,
    description: 'Wallet already linked to another account',
  })
  async linkWallet(
    @CurrentUser() user: User,
    @Body() dto: LinkWalletDto,
  ): Promise<{
    id: string;
    name: string;
    username: string;
    walletAddress: string;
  }> {
    const linked = await this.walletService.linkWalletToAccount(
      user.id,
      dto.walletAddress,
      dto.nonce,
      dto.signature,
    );

    return {
      id: linked.id,
      name: linked.name,
      username: linked.username,
      walletAddress: linked.walletAddress,
    };
  }
}
