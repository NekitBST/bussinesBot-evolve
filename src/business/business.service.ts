import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface Business {
  name: string;
  status: string;
  statusType: string;
  controller: string;
  owner: string;
  products: string;
  price: string;
}

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);
  private cachedCookies: string | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

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

      const decrypted = this.decryptR3ACTLB(a, b, c);
      return decrypted;
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

  async getBusinesses(): Promise<Business[]> {
    try {
      let cookies = this.getCookies();

      if (!cookies) {
        this.logger.error('EVOLVE_COOKIES не настроены в .env файле');
        return [];
      }

      const response = await firstValueFrom(
        this.httpService.post(
          'https://evolve-rp.ru/api/userPanel.php?method=getMonitoring',
          { categ: 'business' },
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
              { categ: 'business' },
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
            this.logger.log(
              `✅ Получено бизнесов: ${retryResponse.data.content.length}`,
            );
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
        this.logger.log(
          `✅ Получено бизнесов: ${response.data.content.length}`,
        );
        return response.data.content;
      }

      this.logger.warn('API вернул success=false или нет content');
      return [];
    } catch (error) {
      this.logger.error('Ошибка при получении списка бизнесов');
      this.logger.error(`Детали ошибки: ${error.message}`);

      if (error.response && [401, 403].includes(error.response.status)) {
        this.cachedCookies = null;
        this.logger.warn('🔄 Кэш кук сброшен');
      }

      return [];
    }
  }

  formatBusiness(business: Business): string {
    const statusEmoji =
      business.status === 'Активен'
        ? '🟢'
        : business.status === 'На аукционе'
          ? '🔴'
          : '⚪';

    return (
      `🏢 <b>Название:</b> ${business.name}\n` +
      `${statusEmoji} <b>Статус:</b> ${business.status}\n` +
      `💀 <b>Контроль:</b> ${business.controller}\n` +
      `👤 <b>Владелец:</b> ${business.owner}\n` +
      `📦 <b>Продукты:</b> ${business.products}\n` +
      `💰 <b>Цены:</b> ${business.price}\n`
    );
  }

  splitBusinessesToMessages(businesses: Business[]): string[] {
    const messages: string[] = [];
    let currentMessage = '';
    const maxLength = 4000;

    for (const business of businesses) {
      const formatted = this.formatBusiness(business);

      if ((currentMessage + formatted + '\n').length > maxLength) {
        if (currentMessage) {
          messages.push(currentMessage.trim());
        }
        currentMessage = formatted + '\n';
      } else {
        currentMessage += formatted + '\n';
      }
    }

    if (currentMessage) {
      messages.push(currentMessage.trim());
    }

    return messages;
  }
}