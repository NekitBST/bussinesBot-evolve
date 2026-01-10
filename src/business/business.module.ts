import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BusinessService } from './business.service';
import { BusinessUpdate } from './business.update';
import { NotificationService } from './notification.service';
import { MonitoringService } from './monitoring.service';
import { MonitoringUpdate } from './monitoring.update';

@Module({
  imports: [HttpModule],
  providers: [
    BusinessService,
    BusinessUpdate,
    NotificationService,
    MonitoringService,
    MonitoringUpdate,
  ],
})
export class BusinessModule {}