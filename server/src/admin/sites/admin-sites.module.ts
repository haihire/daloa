import { Module } from '@nestjs/common';
import { AdminSitesController } from './admin-sites.controller';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminInvenModule } from '../inven/admin-inven.module';
import { SitesModule } from '../../sites/sites.module';

@Module({
  // AdminInvenModule 이 SiteSuggestService(메타 조회 + AI 추천)를 export 한다.
  // 모듈을 import 해도 그쪽 컨트롤러가 중복 등록되지는 않는다(컨트롤러는 선언한 모듈 소속).
  imports: [AdminAuthModule, SitesModule, AdminInvenModule],
  controllers: [AdminSitesController],
})
export class AdminSitesModule {}
