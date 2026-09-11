import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  // UserBootstrapService экспортируется AuthModule: админка создаёт учётки тем же
  // путём, что seed и тесты.
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
