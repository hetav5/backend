import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.CHANNEL_PORT ?? 3002);
  await app.listen(port);
  Logger.log(`Channel service listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
