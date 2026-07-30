import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

for (const envPath of [
  resolve(process.cwd(), '../.env'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../.env')
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
    break;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? true,
    credentials: true
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();