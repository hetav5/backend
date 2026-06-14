import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Fail-loud config check at boot. These are the cross-service / secret vars
 * that, when missing, cause confusing downstream failures (sends silently
 * failing, 401s, insecure tokens). Surfacing them here makes a misconfigured
 * deploy obvious in the logs immediately. Wire them via the render.yaml
 * blueprint sync rather than by hand.
 */
function checkConfig(): void {
  const logger = new Logger('Config');
  const checks: { key: string; hint: string; insecureDefault?: string }[] = [
    { key: 'DATABASE_URL', hint: 'Postgres connection — DB access will fail.' },
    { key: 'CHANNEL_SERVICE_URL', hint: 'CRM → channel dispatch URL — all sends will fail.' },
    { key: 'RECEIPT_HMAC_SECRET', hint: 'must match the channel service — receipts will be rejected.' },
    { key: 'GEMINI_API_KEY', hint: 'the AI agent will not respond.' },
    { key: 'FRONTEND_ORIGIN', hint: 'CORS — the frontend may be blocked.' },
  ];
  for (const c of checks) {
    if (!process.env[c.key]) logger.warn(`${c.key} is not set — ${c.hint}`);
  }
  if (!process.env.JWT_SECRET) {
    logger.warn('JWT_SECRET is not set — using an insecure dev fallback. Set it before production.');
  }
}

async function bootstrap(): Promise<void> {
  checkConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? '*',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = Number(process.env.PORT ?? process.env.CRM_PORT ?? 3001);
  await app.listen(port);
  Logger.log(`CRM API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
