import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { WalletService } from './wallet.service';
import { WalletAuthService } from './wallet-auth.service';
import { WalletController } from './wallet.controller';
import { Wallet } from './entities/wallet.entity';
import { WalletChallenge } from './entities/wallet-challenge.entity';
import { WalletSession } from './entities/wallet-session.entity';
import { WalletSessionGuard } from './guards/wallet-session.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletChallenge, WalletSession, User]),
    AuthModule,
  ],
  providers: [WalletService, WalletAuthService, WalletSessionGuard],
  controllers: [WalletController],
  exports: [WalletService, WalletAuthService],
})
export class WalletModule {}
