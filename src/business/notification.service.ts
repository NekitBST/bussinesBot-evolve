import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BusinessService, Business } from './business.service';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

interface UserSubscription {
  chatId: number;
  businessName: string;
  hourlyNotification: boolean;
  lowProductsNotification: boolean;
  lastNotificationTime?: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private subscriptions: Map<number, UserSubscription[]> = new Map();

  constructor(
    private readonly businessService: BusinessService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  addSubscription(
    chatId: number,
    businessName: string,
    hourlyNotification: boolean,
    lowProductsNotification: boolean,
  ) {
    const userSubs = this.subscriptions.get(chatId) || [];
    
    const filtered = userSubs.filter(sub => sub.businessName !== businessName);
    
    filtered.push({
      chatId,
      businessName,
      hourlyNotification,
      lowProductsNotification,
    });
    
    this.subscriptions.set(chatId, filtered);
    this.logger.log(`Добавлена подписка для чата ${chatId} на бизнес ${businessName}`);
  }

  removeSubscription(chatId: number, businessName: string) {
    const userSubs = this.subscriptions.get(chatId);
    if (!userSubs) return;

    const filtered = userSubs.filter(sub => sub.businessName !== businessName);
    this.subscriptions.set(chatId, filtered);
    this.logger.log(`Удалена подписка для чата ${chatId} на бизнес ${businessName}`);
  }

  getUserSubscriptions(chatId: number): UserSubscription[] {
    return this.subscriptions.get(chatId) || [];
  }

  @Cron('5 * * * *')
  async checkBusinesses() {
    this.logger.log('Запуск проверки бизнесов...');
    
    const businesses = await this.businessService.getBusinesses();
    if (!businesses || businesses.length === 0) {
      this.logger.warn('Не удалось получить список бизнесов');
      return;
    }

    for (const [chatId, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        const business = businesses.find(b => b.name === sub.businessName);
        
        if (!business) continue;

        const products = parseInt(business.products);
        const isLowProducts = products < 2000;

        if (sub.lowProductsNotification && isLowProducts) {
          await this.sendNotification(chatId, business, '⚠️ Низкое количество продуктов!', true);
          continue;
        }

        if (sub.hourlyNotification) {
          await this.sendNotification(chatId, business, '🕐 Ежечасный отчет о бизнесе', false);
        }
      }
    }
  }

  private async sendNotification(
    chatId: number, 
    business: Business, 
    header: string,
    isLowProductsAlert: boolean
  ) {
    try {
      let message = `${header}\n\n${this.businessService.formatBusiness(business)}`;
      
      if (isLowProductsAlert) {
        message += '\n❗️<b>Внимание! В бизнесе меньше 2000 продуктов. Необходимо их завести!</b>';
      }
      
      await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Ошибка отправки уведомления в чат ${chatId}`, error);
    }
  }
}