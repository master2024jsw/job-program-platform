import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import * as fs from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 사내망의 여러 PC(각기 다른 origin)에서 접속하므로 origin을 반사(reflect)하되 자격증명(세션 쿠키)은 허용한다.
  app.enableCors({ origin: true, credentials: true });
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'dev-only-insecure-secret',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        maxAge: Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 30) * 60 * 1000,
      },
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 프로덕션(Electron 패키지): 렌더러를 서버와 같은 origin에서 서빙한다.
  // file:// 에서 로드하면 세션 쿠키가 cross-origin이 되어 전송되지 않으므로,
  // RENDERER_DIST가 지정되면 정적 서빙하고 Electron은 http://localhost:3000 을 로드한다.
  const rendererDist = process.env.RENDERER_DIST;
  if (rendererDist && fs.existsSync(rendererDist)) {
    app.useStaticAssets(rendererDist);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
}

bootstrap();
