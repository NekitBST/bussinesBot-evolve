import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BusinessService } from './business.service';
import { BusinessUpdate } from './business.update';
import { NotificationService } from './notification.service';

@Module({
  imports: [HttpModule],
  providers: [BusinessService, BusinessUpdate, NotificationService],
})
export class BusinessModule {}