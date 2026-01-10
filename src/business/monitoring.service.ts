import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface Farm {
  number: string;
  status: string;
  statusType: string;
  owner: string;
  vice: string;
  fermers: string;
}

export interface STO {
  number: string;
  status: string;
  statusType: string;
  owner: string;
  vice: string;
  fermers: string;
}

export interface Realtor {
  name: string;
  status: string;
  statusType: string;
  owner: string;
  products: string;
}

export interface Carmarket {
  number: string;
  owner: string;
  vice: string;
  perhour: string;
  outprice: string;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private cachedCookies: string | null = null;

  private cachedFarms: Farm[] | null = null;
  private lastFarmsUpdateHour: number | null = null;

  private cachedSTO: STO[] | null = null;
  private lastSTOUpdateHour: number | null = null;

  private cachedRealtor: Realtor[] | null = null;
  private lastRealtorUpdateHour: number | null = null;

  private cachedCarmarket: Carmarket[] | null = null;
  private lastCarmarketUpdateHour: number | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private getCurrentHour(): number {
    return new Date().getHours();
  }

  private isFarmsCacheValid(): boolean {
    if (!this.cachedFarms || this.lastFarmsUpdateHour === null) {
      return false;
    }
    const currentHour = this.getCurrentHour();
    return this.lastFarmsUpdateHour === currentHour;
  }

  private isSTOCacheValid(): boolean {
    if (!this.cachedSTO || this.lastSTOUpdateHour === null) {
      return false;
    }
    const currentHour = this.getCurrentHour();
    return this.lastSTOUpdateHour === currentHour;
  }

  private isRealtorCacheValid(): boolean {
    if (!this.cachedRealtor || this.lastRealtorUpdateHour === null) {
      return false;
    }
    const currentHour = this.getCurrentHour();
    return this.lastRealtorUpdateHour === currentHour;
  }

  private isCarmarketCacheValid(): boolean {
    if (!this.cachedCarmarket || this.lastCarmarketUpdateHour === null) {
      return false;
    }
    const currentHour = this.getCurrentHour();
    return this.lastCarmarketUpdateHour === currentHour;
  }

  @Cron('2 * * * *')
  async refreshAllCache() {
    this.logger.log('⏰ Автоматическое обновление кэша мониторинга...');
    await this.getFarms();
    await this.getSTO();
    await this.getRealtor();
    await this.getCarmarket();
  }

  private decryptR3ACTLB(a: string, b: string, c: string): string {
    const key = Buffer.from(a, 'hex');
    const iv = Buffer.from(b, 'hex');
    const encrypted = Buffer.from(c, 'hex');

    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      decipher.setAutoPadding(false);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('hex');
    } catch (error) {
      this.logger.error('Ошибка декодирования R3ACTLB', error);
      return '';
    }
  }

  private extractR3ACTLBFromHtml(html: string): string | null {
    try {
      const matches = html.match(/"([0-9a-f]{32})"/g);
      if (!matches || matches.length < 3) {
        return null;
      }
      const a = matches[0].replace(/"/g, '');
      const b = matches[1].replace(/"/g, '');
      const c = matches[2].replace(/"/g, '');
      return this.decryptR3ACTLB(a, b, c);
    } catch (error) {
      this.logger.error('Ошибка парсинга R3ACTLB из HTML', error);
      return null;
    }
  }

  private updateR3ACTLBCookie(cookies: string, newR3ACTLB: string): string {
    const cookieParts = cookies
      .split('; ')
      .filter((cookie) => !cookie.startsWith('R3ACTLB='));
    cookieParts.push(`R3ACTLB=${newR3ACTLB}`);
    return cookieParts.join('; ');
  }

  private getCookies(): string {
    if (this.cachedCookies) {
      return this.cachedCookies;
    }
    return this.configService.get<string>('EVOLVE_COOKIES') || '';
  }

  private async fetchMonitoring<T>(categ: string): Promise<T[]> {
    let cookies = this.getCookies();

    if (!cookies) {
      this.logger.error('EVOLVE_COOKIES не настроены в .env файле');
      return [];
    }

    const response = await firstValueFrom(
      this.httpService.post(
        'https://evolve-rp.ru/api/userPanel.php?method=getMonitoring',
        { categ },
        {
          headers: {
            accept: 'application/json',
            'accept-language': 'ru,en;q=0.9,en-GB;q=0.8,en-US;q=0.7',
            'content-type': 'application/json',
            cookie: cookies,
            origin: 'https://evolve-rp.ru',
            priority: 'u=1, i',
            referer: 'https://evolve-rp.ru/dashboard/monitoring',
            'sec-ch-ua':
              '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
          },
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
        },
      ),
    );

    const isHtmlProtection =
      typeof response.data === 'string' &&
      (response.data.includes('<!DOCTYPE html>') ||
        response.data.includes('slowAES') ||
        response.data.includes('aes.min.js'));

    if (isHtmlProtection) {
      this.logger.warn('Получена анти-бот защита. Извлекаем R3ACTLB...');

      const r3actlb = this.extractR3ACTLBFromHtml(response.data);
      if (r3actlb) {
        cookies = this.updateR3ACTLBCookie(cookies, r3actlb);
        this.cachedCookies = cookies;
        this.logger.log('✅ R3ACTLB получен и сохранен в кэш');

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const retryResponse = await firstValueFrom(
          this.httpService.post(
            'https://evolve-rp.ru/api/userPanel.php?method=getMonitoring',
            { categ },
            {
              headers: {
                accept: 'application/json',
                'accept-language': 'ru,en;q=0.9,en-GB;q=0.8,en-US;q=0.7',
                'content-type': 'application/json',
                cookie: cookies,
                origin: 'https://evolve-rp.ru',
                priority: 'u=1, i',
                referer: 'https://evolve-rp.ru/dashboard/monitoring',
                'sec-ch-ua':
                  '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
              },
            },
          ),
        );

        if (
          retryResponse.data &&
          retryResponse.data.success &&
          retryResponse.data.content
        ) {
          return retryResponse.data.content;
        }
      } else {
        this.logger.error('Не удалось извлечь R3ACTLB из HTML');
      }
    }

    if (
      response.data &&
      typeof response.data === 'object' &&
      response.data.success &&
      response.data.content
    ) {
      return response.data.content;
    }

    this.logger.warn('API вернул success=false или нет content');
    return [];
  }

  async getFarms(): Promise<Farm[]> {
    if (this.isFarmsCacheValid()) {
      this.logger.log(
        `📦 Используем кэш ферм (час: ${this.lastFarmsUpdateHour}:00)`,
      );
      return this.cachedFarms!;
    }

    const currentHour = this.getCurrentHour();
    this.logger.log(`🔄 Обновление данных ферм (новый час: ${currentHour}:00)`);

    try {
      const farms = await this.fetchMonitoring<Farm>('farms');
      this.cachedFarms = farms;
      this.lastFarmsUpdateHour = currentHour;

      this.logger.log(`✅ Получено ферм: ${farms.length} (кэш обновлен)`);
      return farms;
    } catch (error) {
      this.logger.error('Ошибка при получении списка ферм');
      this.logger.error(`Детали ошибки: ${error.message}`);

      if (error.response && [401, 403].includes(error.response.status)) {
        this.cachedCookies = null;
        this.logger.warn('🔄 Кэш кук сброшен');
      }

      if (this.cachedFarms) {
        this.logger.warn('⚠️ Используем старый кэш ферм из-за ошибки');
        return this.cachedFarms;
      }

      return [];
    }
  }

  async getSTO(): Promise<STO[]> {
    if (this.isSTOCacheValid()) {
      this.logger.log(
        `📦 Используем кэш СТО (час: ${this.lastSTOUpdateHour}:00)`,
      );
      return this.cachedSTO!;
    }

    const currentHour = this.getCurrentHour();
    this.logger.log(`🔄 Обновление данных СТО (новый час: ${currentHour}:00)`);

    try {
      const sto = await this.fetchMonitoring<STO>('sto');
      this.cachedSTO = sto;
      this.lastSTOUpdateHour = currentHour;

      this.logger.log(`✅ Получено СТО: ${sto.length} (кэш обновлен)`);
      return sto;
    } catch (error) {
      this.logger.error('Ошибка при получении списка СТО');
      this.logger.error(`Детали ошибки: ${error.message}`);

      if (error.response && [401, 403].includes(error.response.status)) {
        this.cachedCookies = null;
        this.logger.warn('🔄 Кэш кук сброшен');
      }

      if (this.cachedSTO) {
        this.logger.warn('⚠️ Используем старый кэш СТО из-за ошибки');
        return this.cachedSTO;
      }

      return [];
    }
  }

  async getRealtor(): Promise<Realtor[]> {
    if (this.isRealtorCacheValid()) {
      this.logger.log(
        `📦 Используем кэш риелторок (час: ${this.lastRealtorUpdateHour}:00)`,
      );
      return this.cachedRealtor!;
    }

    const currentHour = this.getCurrentHour();
    this.logger.log(
      `🔄 Обновление данных риелторок (новый час: ${currentHour}:00)`,
    );

    try {
      const realtor = await this.fetchMonitoring<Realtor>('realtor');
      this.cachedRealtor = realtor;
      this.lastRealtorUpdateHour = currentHour;

      this.logger.log(`✅ Получено риелторок: ${realtor.length} (кэш обновлен)`);
      return realtor;
    } catch (error) {
      this.logger.error('Ошибка при получении списка риелторок');
      this.logger.error(`Детали ошибки: ${error.message}`);

      if (error.response && [401, 403].includes(error.response.status)) {
        this.cachedCookies = null;
        this.logger.warn('🔄 Кэш кук сброшен');
      }

      if (this.cachedRealtor) {
        this.logger.warn('⚠️ Используем старый кэш риелторок из-за ошибки');
        return this.cachedRealtor;
      }

      return [];
    }
  }

  async getCarmarket(): Promise<Carmarket[]> {
    if (this.isCarmarketCacheValid()) {
      this.logger.log(
        `📦 Используем кэш авторынка (час: ${this.lastCarmarketUpdateHour}:00)`,
      );
      return this.cachedCarmarket!;
    }

    const currentHour = this.getCurrentHour();
    this.logger.log(
      `🔄 Обновление данных авторынка (новый час: ${currentHour}:00)`,
    );

    try {
      const carmarket = await this.fetchMonitoring<Carmarket>('carmarket');
      this.cachedCarmarket = carmarket;
      this.lastCarmarketUpdateHour = currentHour;

      this.logger.log(
        `✅ Получено авторынков: ${carmarket.length} (кэш обновлен)`,
      );
      return carmarket;
    } catch (error) {
      this.logger.error('Ошибка при получении данных авторынка');
      this.logger.error(`Детали ошибки: ${error.message}`);

      if (error.response && [401, 403].includes(error.response.status)) {
        this.cachedCookies = null;
        this.logger.warn('🔄 Кэш кук сброшен');
      }

      if (this.cachedCarmarket) {
        this.logger.warn('⚠️ Используем старый кэш авторынка из-за ошибки');
        return this.cachedCarmarket;
      }

      return [];
    }
  }

  formatFarm(farm: Farm): string {
    const statusEmoji =
      farm.status === 'Активен'
        ? '🟢'
        : farm.status === 'На аукционе'
          ? '🔴'
          : '⚪';

    const vice = farm.vice
      .split('<br/>')
      .filter((v) => v !== 'None')
      .map((v) => `  • ${v}`)
      .join('\n');

    const fermers = farm.fermers
      .split('<br/>')
      .filter((f) => f !== 'None')
      .map((f) => `  • ${f}`)
      .join('\n');

    return (
      `🌾 <b>Название:</b> Ферма ${farm.number}\n` +
      `${statusEmoji} <b>Статус:</b> ${farm.status}\n` +
      `👤 <b>Владелец:</b> ${farm.owner}\n` +
      `👥 <b>Заместители:</b>\n${vice || '  Нет'}\n` +
      `🧑‍🌾 <b>Фермеры:</b>\n${fermers || '  Нет'}\n`
    );
  }

  formatSTO(sto: STO): string {
    const statusEmoji =
      sto.status === 'Активен'
        ? '🟢'
        : sto.status === 'На аукционе'
          ? '🔴'
          : '⚪';

    const vice = sto.vice
      .split('<br/>')
      .filter((v) => v !== 'None')
      .map((v) => `  • ${v}`)
      .join('\n');

    const mechanics = sto.fermers
      .split('<br/>')
      .filter((m) => m !== 'None')
      .map((m) => `  • ${m}`)
      .join('\n');

    return (
      `🔧 <b>Название:</b> ${sto.number}\n` +
      `${statusEmoji} <b>Статус:</b> ${sto.status}\n` +
      `👤 <b>Владелец:</b> ${sto.owner}\n` +
      `👥 <b>Заместители:</b>\n${vice || '  Нет'}\n` +
      `👨‍🔧 <b>Механики:</b>\n${mechanics || '  Нет'}\n`
    );
  }

  formatRealtor(realtor: Realtor): string {
    const statusEmoji =
      realtor.status === 'Активен'
        ? '🟢'
        : realtor.status === 'На аукционе'
          ? '🔴'
          : '⚪';

    return (
      `🏠 <b>Название:</b> ${realtor.name}\n` +
      `${statusEmoji} <b>Статус:</b> ${realtor.status}\n` +
      `👤 <b>Владелец:</b> ${realtor.owner}\n` +
      `📦 <b>Продукты:</b> ${realtor.products}\n`
    );
  }

  formatCarmarket(carmarket: Carmarket): string {
    const vice = carmarket.vice
      .split('<br/>')
      .filter((v) => v !== 'None')
      .map((v) => `  • ${v}`)
      .join('\n');

    return (
      `🚘 <b>Название:</b> Авторынок\n` +
      `👤 <b>Владелец:</b> ${carmarket.owner}\n` +
      `👥 <b>Заместители:</b>\n${vice || '  Нет'}\n` +
      `💰 <b>Цена аренды в час:</b> ${carmarket.perhour}\n` +
      `💸 <b>Цена за выезд:</b> ${carmarket.outprice}\n`
    );
  }
}