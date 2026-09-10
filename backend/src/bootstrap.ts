import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

// Общая настройка приложения для main.ts и e2e-тестов: одно и то же
// приложение (плюс те же пайпы, CORS, cookie и лимиты тела) должно работать и
// в проде, и под supertest, иначе e2e ловит расхождения конфигурации.
export function configureApp(app: NestExpressApplication): void {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:4887,https://tracker.performance:4888').split(','),
    credentials: true,
  });
  app.use(cookieParser());
  // За Caddy все запросы приходят с IP прокси — без этого rate-limit видит
  // всех с одного адреса.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // PNG графика приезжает base64-строкой в JSON; дефолтные 100 КБ его не пускают.
  // Обязательно до app.listen(): иначе дефолтный json-парсер на 100 КБ успеет
  // зарегистрироваться первым, и запросы с картинкой будут отбиваться 413.
  app.useBodyParser('json', { limit: '2mb' });
}
