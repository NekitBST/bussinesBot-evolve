import { Update, Ctx, Start, Command, Action, On } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { BusinessService, Business } from './business.service';
import { NotificationService } from './notification.service';
import { Logger } from '@nestjs/common';

@Update()
export class BusinessUpdate {
  private readonly logger = new Logger(BusinessUpdate.name);
  private userState: Map<number, { action?: string; businessName?: string }> = new Map();

  constructor(
    private readonly businessService: BusinessService,
    private readonly notificationService: NotificationService,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply(
      '👋 Добро пожаловать в бот мониторинга бизнесов Evolve RP!\n\n' +
      'Выберите действие:',
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Список всех бизнесов', 'list_all')],
        [Markup.button.callback('🔔 Настроить уведомления', 'setup_notifications')],
        [Markup.button.callback('📊 Мои подписки', 'my_subscriptions')],
      ])
    );
  }

  @Command('menu')
  async menu(@Ctx() ctx: Context) {
    await this.start(ctx);
  }

  @Action('list_all')
  async listAllBusinesses(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply('⏳ Загружаю список бизнесов...');

    const businesses = await this.businessService.getBusinesses();
    
    if (!businesses || businesses.length === 0) {
      await ctx.reply('❌ Не удалось получить список бизнесов. Проверьте настройки.');
      return;
    }

    const messages = this.businessService.splitBusinessesToMessages(businesses);
    
    await ctx.reply(`📊 Найдено бизнесов: ${businesses.length}\n\n`);
    
    for (const message of messages) {
      await ctx.reply(message, { parse_mode: 'HTML' });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await ctx.reply(
      'Список загружен ✅',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Главное меню', 'back_to_menu')],
      ])
    );
  }

  @Action('setup_notifications')
  async setupNotifications(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    await ctx.reply('📝 Введите название бизнеса для настройки уведомлений:');
    this.userState.set(ctx.from.id, { action: 'waiting_business_name' });
  }

  @Action('my_subscriptions')
  async mySubscriptions(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const subscriptions = this.notificationService.getUserSubscriptions(ctx.from.id);

    if (subscriptions.length === 0) {
      await ctx.reply('У вас нет активных подписок на уведомления.');
      return;
    }

    let message = '📋 <b>Ваши подписки:</b>\n\n';
    
    for (const sub of subscriptions) {
      message += `🏢 <b>${sub.businessName}</b>\n`;
      if (sub.hourlyNotification) {
        message += '  ✅ Ежечасные уведомления\n';
      }
      if (sub.lowProductsNotification) {
        message += '  ✅ Уведомления о низком количестве продуктов\n';
      }
      message += '\n';
    }

    const buttons = subscriptions.map(sub => 
      [Markup.button.callback(`🗑 Удалить: ${sub.businessName}`, `unsub_${sub.businessName}`)]
    );
    buttons.push([Markup.button.callback('🔙 Главное меню', 'back_to_menu')]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  }

  @Action(/^unsub_(.+)$/)
  async unsubscribe(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const match = (ctx as any).match;
    const businessName = match[1];
    
    this.notificationService.removeSubscription(ctx.from.id, businessName);
    await ctx.reply(`✅ Подписка на "${businessName}" удалена.`);
    await this.mySubscriptions(ctx);
  }

  @Action('back_to_menu')
  async backToMenu(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.start(ctx);
  }

  @On('text')
  async handleText(@Ctx() ctx: Context & { message: { text: string } }) {
    if (!ctx.from) return;
    const userId = ctx.from.id;
    const state = this.userState.get(userId);

    if (!state) {
      await ctx.reply('Используйте /menu для отображения главного меню');
      return;
    }

    if (state.action === 'waiting_business_name') {
      const businessName = ctx.message.text;
      
      const businesses = await this.businessService.getBusinesses();
      const business = businesses.find(b => 
        b.name.toLowerCase() === businessName.toLowerCase()
      );

      if (!business) {
        await ctx.reply(
          `❌ Бизнес "${businessName}" не найден.\n\n` +
          'Проверьте название или используйте команду "Список всех бизнесов" для просмотра доступных вариантов.'
        );
        return;
      }

      this.userState.set(userId, { 
        action: 'choose_notification_type',
        businessName: business.name,
      });

      await ctx.reply(
        `Выбран бизнес: <b>${business.name}</b>\n\n` +
        'Выберите тип уведомлений:',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🕐 Ежечасно (в :05)', 'notif_hourly')],
            [Markup.button.callback('⚠️ При products < 2000', 'notif_low_products')],
            [Markup.button.callback('✅ Оба типа', 'notif_both')],
            [Markup.button.callback('❌ Отмена', 'back_to_menu')],
          ]),
        }
      );
    }
  }

  @Action('notif_hourly')
  async notifyHourly(@Ctx() ctx: Context) {
    await this.setupNotificationType(ctx, true, false);
  }

  @Action('notif_low_products')
  async notifyLowProducts(@Ctx() ctx: Context) {
    await this.setupNotificationType(ctx, false, true);
  }

  @Action('notif_both')
  async notifyBoth(@Ctx() ctx: Context) {
    await this.setupNotificationType(ctx, true, true);
  }

  private async setupNotificationType(
    ctx: Context,
    hourly: boolean,
    lowProducts: boolean,
  ) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const state = this.userState.get(userId);

    if (!state || !state.businessName) {
      await ctx.reply('Ошибка: бизнес не выбран');
      return;
    }

    this.notificationService.addSubscription(
      userId,
      state.businessName,
      hourly,
      lowProducts,
    );

    let message = `✅ Уведомления настроены для бизнеса: <b>${state.businessName}</b>\n\n`;
    
    if (hourly) {
      message += '🕐 Ежечасные уведомления: включены\n';
    }
    if (lowProducts) {
      message += '⚠️ Уведомления о низких продуктах: включены\n';
    }

    this.userState.delete(userId);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Главное меню', 'back_to_menu')],
      ]),
    });
  }
}