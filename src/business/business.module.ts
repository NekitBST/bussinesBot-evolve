import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BusinessService } from './business.service';
import { BusinessUpdate } from './business.update';
import { NotificationService } from './notification.service';
import { MonitoringService } from './monitoring.service';
import { MonitoringUpdate } from './monitoring.update';
import { AuctionNotificationService } from './auction-notification.service';
import { AuctionUpdate } from './auction.update';

@Module({
  imports: [HttpModule],
  providers: [
    BusinessService,
    BusinessUpdate,
    NotificationService,
    MonitoringService,
    MonitoringUpdate,
    AuctionNotificationService,
    AuctionUpdate,
  ],
})
export class BusinessModule {}