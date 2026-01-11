import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { BusinessService } from './business.service';
import { MonitoringService } from './monitoring.service';

type Category = 'business' | 'farms' | 'sto' | 'realtor' | 'carmarket';

interface AuctionSubscription {
  userId: number;
  categories: Set<Category>;
}

@Injectable()
export class AuctionNotificationService {
  private readonly logger = new Logger(AuctionNotificationService.name);
  private subscriptions: Map<number, Set<Category>> = new Map();

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly businessService: BusinessService,
    private readonly monitoringService: MonitoringService,
  ) {}

  addSubscription(userId: number, categories: Category[]) {
    this.subscriptions.set(userId, new Set(categories));
    this.logger.log(`Подписка на аукционы добавлена для пользователя ${userId}: ${categories.join(', ')}`);
  }

  removeSubscription(userId: number) {
    this.subscriptions.delete(userId);
    this.logger.log(`Подписка на аукционы удалена для пользователя ${userId}`);
  }

  getSubscription(userId: number): Set<Category> | undefined {
    return this.subscriptions.get(userId);
  }

  hasSubscription(userId: number): boolean {
    return this.subscriptions.has(userId);
  }

  @Cron('3 * * * *')
  async checkAuctions() {
    this.logger.log('⏰ Проверка аукционов...');

    for (const [userId, categories] of this.subscriptions.entries()) {
      try {
        const auctionItems: string[] = [];

        if (categories.has('business')) {
          const businesses = await this.businessService.getBusinesses();
          const auctionBusinesses = businesses.filter(
            (b) => b.status === 'На аукционе',
          );
          for (const b of auctionBusinesses) {
            auctionItems.push(`🏢 ${b.name} выставлен на аукцион`);
          }
        }

        if (categories.has('farms')) {
          const farms = await this.monitoringService.getFarms();
          const auctionFarms = farms.filter((f) => f.status === 'На аукционе');
          for (const f of auctionFarms) {
            auctionItems.push(`🌾 Ферма ${f.number} выставлена на аукцион`);
          }
        }

        if (categories.has('sto')) {
          const sto = await this.monitoringService.getSTO();
          const auctionSTO = sto.filter((s) => s.status === 'На аукционе');
          for (const s of auctionSTO) {
            auctionItems.push(`🔧 ${s.number} выставлена на аукцион`);
          }
        }

        if (categories.has('realtor')) {
          const realtor = await this.monitoringService.getRealtor();
          const auctionRealtor = realtor.filter(
            (r) => r.status === 'На аукционе',
          );
          for (const r of auctionRealtor) {
            auctionItems.push(`🏠 ${r.name} выставлена на аукцион`);
          }
        }

        if (categories.has('carmarket')) {
          const carmarket = await this.monitoringService.getCarmarket();
          const auctionCarmarket = carmarket.filter((c) => c.owner === 'none');
          for (const c of auctionCarmarket) {
            auctionItems.push(`🚘 Авторынок выставлен на аукцион`);
          }
        }

        if (auctionItems.length > 0) {
          const message =
            `🚨 <b>Внимание!</b>\n\n` +
            `На аукционе:\n\n` +
            auctionItems.join('\n');

          await this.bot.telegram.sendMessage(userId, message, {
            parse_mode: 'HTML',
          });

          this.logger.log(
            `Отправлено уведомление об аукционах пользователю ${userId} (${auctionItems.length} объектов)`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Ошибка при проверке аукционов для пользователя ${userId}: ${error.message}`,
        );
      }
    }
  }
}