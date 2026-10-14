import { ConsoleLogger, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { observeHttp } from './common/http-observability.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });

  const config = app.get(ConfigService);

  // One hop is safe only when the API is reachable exclusively through our proxy.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', config.get<number>('TRUST_PROXY_HOPS', 0));

  app.use(observeHttp);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');

  await app.listen(port);

  Logger.log(`Roomora API: http://localhost:${port}/api/v1`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Không thể khởi động backend';

  Logger.error(message, undefined, 'Bootstrap');
  process.exitCode = 1;
});
