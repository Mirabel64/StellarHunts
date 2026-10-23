import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, IsBase64, Length } from 'class-validator';
import { STELLAR_ACCOUNT_ADDRESS_PATTERN } from './wallet-challenge.dto';

export class VerifyWalletSignatureDto {
  @ApiProperty({
    description: 'Stellar public key (G...) that produced the signature',
    example: 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G',
  })
  @IsString()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'walletAddress must be a Stellar account address (G...)',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Nonce returned by POST /wallet/challenge',
    example: '9f2c4e...',
  })
  @IsString()
  @Length(64, 64)
  nonce: string;

  @ApiProperty({
    description: 'Base64-encoded ed25519 signature of the challenge message',
    example: '8Un3...',
  })
  @IsString()
  @IsBase64()
  signature: string;
}

export class WalletSessionResponseDto {
  @ApiProperty({
    description: 'Whether the wallet is linked to a StellarHunts account',
  })
  linked: boolean;

  @ApiProperty({ description: 'Wallet address the session belongs to' })
  walletAddress: string;

  @ApiProperty({ description: 'Bearer token to send in the Authorization header' })
  accessToken: string;

  @ApiProperty({
    description:
      'Token scheme: `Bearer` for linked accounts (standard JWT pair) and `WalletSession` for wallet-only sessions',
    example: 'WalletSession',
  })
  tokenType: string;

  @ApiProperty({ description: 'Token lifetime in seconds' })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh token (only issued for linked accounts)',
    required: false,
  })
  refreshToken?: string;

  @ApiProperty({
    description: 'Refresh token lifetime in seconds (linked accounts only)',
    required: false,
  })
  refreshExpiresIn?: number;

  @ApiProperty({
    description: 'Linked account summary (null for wallet-only sessions)',
    required: false,
    nullable: true,
  })
  user?: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
  } | null;
}

export class WalletSessionInfoDto {
  @ApiProperty()
  walletAddress: string;

  @ApiProperty({ description: 'Linked account id, if any', nullable: true })
  userId: string | null;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  lastSeenAt: Date | null;
}

export class LinkWalletDto extends VerifyWalletSignatureDto {}
