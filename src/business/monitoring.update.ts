import { Update, Ctx, Action } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { MonitoringService } from './monitoring.service';
import { Logger } from '@nestjs/common';

@Update()
export class MonitoringUpdate {
  private readonly logger = new Logger(MonitoringUpdate.name);

  constructor(private readonly monitoringService: MonitoringService) {}

  @Action('view_farms')
  async viewFarms(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply('⏳ Загружаю список ферм...');

    const farms = await this.monitoringService.getFarms();

    if (!farms || farms.length === 0) {
      await ctx.reply('❌ Не удалось получить список ферм.');
      return;
    }

    await ctx.reply(`📊 Найдено ферм: ${farms.length}\n\n`);

    let message = '';
    for (const farm of farms) {
      message += this.monitoringService.formatFarm(farm) + '\n';
    }

    await ctx.reply(message.trim(), { parse_mode: 'HTML' });

    await ctx.reply(
      'Список загружен ✅',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад к мониторингу', 'monitoring_menu')],
      ]),
    );
  }

  @Action('view_sto')
  async viewSTO(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply('⏳ Загружаю список СТО...');

    const sto = await this.monitoringService.getSTO();

    if (!sto || sto.length === 0) {
      await ctx.reply('❌ Не удалось получить список СТО.');
      return;
    }

    await ctx.reply(`📊 Найдено СТО: ${sto.length}\n\n`);

    let message = '';
    for (const s of sto) {
      message += this.monitoringService.formatSTO(s) + '\n';
    }

    await ctx.reply(message.trim(), { parse_mode: 'HTML' });

    await ctx.reply(
      'Список загружен ✅',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад к мониторингу', 'monitoring_menu')],
      ]),
    );
  }
}
