import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Stellar ed25519 account address (strkey `G...`).
 *
 * Muxed (`M...`) and contract (`C...`) addresses are deliberately rejected:
 * only an ed25519 account key can produce the signature this flow verifies.
 */
export const STELLAR_ACCOUNT_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

export class WalletChallengeDto {
  @ApiProperty({
    description: 'Stellar account address (G...) that will sign the challenge',
    example: 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G',
  })
  @IsString()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'walletAddress must be a Stellar account address (G...)',
  })
  walletAddress: string;

  @ApiPropertyOptional({
    description: 'Requested challenge lifetime in seconds (30–900, default 300)',
    example: 300,
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  ttlSeconds?: number;
}

export class WalletChallengeResponseDto {
  @ApiProperty({ description: 'Single-use challenge nonce' })
  nonce: string;

  @ApiProperty({
    description: 'Exact UTF-8 message the wallet must sign',
    example:
      'stellar-hunts: authenticate\nwallet=G...\nnonce=...\ndomain=stellar-hunts.app\nexpires=...',
  })
  message: string;

  @ApiProperty({ description: 'ISO-8601 expiration timestamp' })
  expiresAt: Date;

  @ApiProperty({ description: 'Domain the challenge is bound to' })
  domain: string;
}
