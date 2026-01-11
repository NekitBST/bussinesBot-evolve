import { Update, Ctx, Action } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { AuctionNotificationService } from './auction-notification.service';
import { Logger } from '@nestjs/common';

type Category = 'business' | 'farms' | 'sto' | 'realtor' | 'carmarket';

@Update()
export class AuctionUpdate {
  private readonly logger = new Logger(AuctionUpdate.name);
  private tempSelections: Map<number, Set<Category>> = new Map();

  constructor(
    private readonly auctionNotificationService: AuctionNotificationService,
  ) {}

  @Action('auction_menu')
  async auctionMenu(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply(
      '🚨 <b>Уведомления об аукционах</b>\n\n' +
        'Выберите категории для отслеживания:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Все категории', 'auction_all')],
          [Markup.button.callback('📝 Выбрать несколько', 'auction_select')],
          [Markup.button.callback('🏢 Только бизнесы', 'auction_only_business')],
          [Markup.button.callback('🌾 Только фермы', 'auction_only_farms')],
          [Markup.button.callback('🔧 Только СТО', 'auction_only_sto')],
          [Markup.button.callback('🏠 Только риелторки', 'auction_only_realtor')],
          [Markup.button.callback('🚘 Только авторынок', 'auction_only_carmarket')],
          [Markup.button.callback('📋 Мои подписки', 'auction_my_settings')],
          [Markup.button.callback('🔙 Главное меню', 'back_to_menu')],
        ]),
      },
    );
  }

  @Action('auction_all')
  async auctionAll(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();

    const allCategories: Category[] = [
      'business',
      'farms',
      'sto',
      'realtor',
      'carmarket',
    ];
    this.auctionNotificationService.addSubscription(ctx.from.id, allCategories);

    await ctx.reply(
      '✅ Подписка на <b>все категории</b> активирована!\n\n' +
        'Вы будете получать уведомления каждый час (в :03), если что-то выставлено на аукцион.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад', 'auction_menu')],
        ]),
      },
    );
  }

  @Action('auction_only_business')
  async auctionOnlyBusiness(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.auctionNotificationService.addSubscription(ctx.from.id, ['business']);
    await this.sendSuccessMessage(ctx, 'бизнесы');
  }

  @Action('auction_only_farms')
  async auctionOnlyFarms(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.auctionNotificationService.addSubscription(ctx.from.id, ['farms']);
    await this.sendSuccessMessage(ctx, 'фермы');
  }

  @Action('auction_only_sto')
  async auctionOnlySTO(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.auctionNotificationService.addSubscription(ctx.from.id, ['sto']);
    await this.sendSuccessMessage(ctx, 'СТО');
  }

  @Action('auction_only_realtor')
  async auctionOnlyRealtor(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.auctionNotificationService.addSubscription(ctx.from.id, ['realtor']);
    await this.sendSuccessMessage(ctx, 'риелторки');
  }

  @Action('auction_only_carmarket')
  async auctionOnlyCarmarket(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.auctionNotificationService.addSubscription(ctx.from.id, ['carmarket']);
    await this.sendSuccessMessage(ctx, 'авторынок');
  }

  private async sendSuccessMessage(ctx: Context, categoryName: string) {
    await ctx.reply(
      `✅ Подписка на <b>${categoryName}</b> активирована!\n\n` +
        'Вы будете получать уведомления каждый час (в :03), если что-то выставлено на аукцион.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад', 'auction_menu')],
        ]),
      },
    );
  }

  @Action('auction_select')
  async auctionSelect(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();

    this.tempSelections.set(ctx.from.id, new Set());

    await this.showSelectionMenu(ctx);
  }

  private async showSelectionMenu(ctx: Context) {
    if (!ctx.from) return;

    const selected = this.tempSelections.get(ctx.from.id) || new Set();

    const keyboard = [
      [
        Markup.button.callback(
          `${selected.has('business') ? '☑️' : '☐'} Бизнесы`,
          'auction_toggle_business',
        ),
      ],
      [
        Markup.button.callback(
          `${selected.has('farms') ? '☑️' : '☐'} Фермы`,
          'auction_toggle_farms',
        ),
      ],
      [
        Markup.button.callback(
          `${selected.has('sto') ? '☑️' : '☐'} СТО`,
          'auction_toggle_sto',
        ),
      ],
      [
        Markup.button.callback(
          `${selected.has('realtor') ? '☑️' : '☐'} Риелторки`,
          'auction_toggle_realtor',
        ),
      ],
      [
        Markup.button.callback(
          `${selected.has('carmarket') ? '☑️' : '☐'} Авторынок`,
          'auction_toggle_carmarket',
        ),
      ],
      [Markup.button.callback('✅ Сохранить выбор', 'auction_save_selection')],
      [Markup.button.callback('🔙 Назад', 'auction_menu')],
    ];

    const selectedCount = selected.size;
    const message =
      '📝 <b>Выберите категории:</b>\n\n' +
      `Выбрано: ${selectedCount}\n\n` +
      'Нажимайте на категории для переключения.';

    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboard),
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboard),
      });
    }
  }

  @Action('auction_toggle_business')
  async toggleBusiness(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.toggleCategory(ctx.from.id, 'business');
    await this.showSelectionMenu(ctx);
  }

  @Action('auction_toggle_farms')
  async toggleFarms(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.toggleCategory(ctx.from.id, 'farms');
    await this.showSelectionMenu(ctx);
  }

  @Action('auction_toggle_sto')
  async toggleSTO(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.toggleCategory(ctx.from.id, 'sto');
    await this.showSelectionMenu(ctx);
  }

  @Action('auction_toggle_realtor')
  async toggleRealtor(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.toggleCategory(ctx.from.id, 'realtor');
    await this.showSelectionMenu(ctx);
  }

  @Action('auction_toggle_carmarket')
  async toggleCarmarket(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();
    this.toggleCategory(ctx.from.id, 'carmarket');
    await this.showSelectionMenu(ctx);
  }

  private toggleCategory(userId: number, category: Category) {
    const selected = this.tempSelections.get(userId) || new Set();
    if (selected.has(category)) {
      selected.delete(category);
    } else {
      selected.add(category);
    }
    this.tempSelections.set(userId, selected);
  }

  @Action('auction_save_selection')
  async saveSelection(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();

    const selected = this.tempSelections.get(ctx.from.id);

    if (!selected || selected.size === 0) {
      await ctx.reply('⚠️ Выберите хотя бы одну категорию!');
      return;
    }

    const categories = Array.from(selected);
    this.auctionNotificationService.addSubscription(ctx.from.id, categories);
    this.tempSelections.delete(ctx.from.id);

    const categoryNames = {
      business: '🏢 Бизнесы',
      farms: '🌾 Фермы',
      sto: '🔧 СТО',
      realtor: '🏠 Риелторки',
      carmarket: '🚘 Авторынок',
    };

    const selectedNames = categories.map((c) => categoryNames[c]).join('\n');

    await ctx.reply(
      `✅ Подписка активирована!\n\n` +
        `<b>Выбранные категории:</b>\n${selectedNames}\n\n` +
        'Вы будете получать уведомления каждый час (в :03), если что-то выставлено на аукцион.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад', 'auction_menu')],
        ]),
      },
    );
  }

  @Action('auction_my_settings')
  async mySettings(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();

    if (!this.auctionNotificationService.hasSubscription(ctx.from.id)) {
      await ctx.reply(
        '📋 У вас нет активных подписок на уведомления об аукционах.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад', 'auction_menu')],
        ]),
      );
      return;
    }

    const categories = this.auctionNotificationService.getSubscription(
      ctx.from.id,
    );

    const categoryNames = {
      business: '🏢 Бизнесы',
      farms: '🌾 Фермы',
      sto: '🔧 СТО',
      realtor: '🏠 Риелторки',
      carmarket: '🚘 Авторынок',
    };

    const selectedNames = Array.from(categories!)
      .map((c) => categoryNames[c])
      .join('\n');

    await ctx.reply(
      `📋 <b>Ваши подписки на аукционы:</b>\n\n` +
        `<b>Отслеживаемые категории:</b>\n${selectedNames}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '🗑 Отписаться',
              'auction_unsubscribe',
            ),
          ],
          [Markup.button.callback('🔙 Назад', 'auction_menu')],
        ]),
      },
    );
  }

  @Action('auction_unsubscribe')
  async unsubscribe(@Ctx() ctx: Context) {
    if (!ctx.from) return;
    await ctx.answerCbQuery();

    this.auctionNotificationService.removeSubscription(ctx.from.id);

    await ctx.reply('✅ Подписка на уведомления об аукционах отменена.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад', 'auction_menu')],
      ]),
    });
  }
}