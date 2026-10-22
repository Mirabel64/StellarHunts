import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  const cors = config.get('appConfig.cors');
  app.enableCors({
    origin: cors?.origin ?? 'http://localhost:3000',
    methods: cors?.methods ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: cors?.allowedHeaders ?? ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: cors?.credentials ?? true,
  });

  const port = config.get('PORT') ?? '4000';
  await app.listen(parseInt(port, 10) || 4000, '0.0.0.0');
  console.log(`StellarHunts backend listening on http://0.0.0.0:${port}`);
}

bootstrap();
