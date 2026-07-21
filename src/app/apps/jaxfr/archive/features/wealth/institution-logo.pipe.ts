import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'institutionLogo',
  standalone: true,
})
export class InstitutionLogoPipe implements PipeTransform {
  private logoMap: Record<string, string> = {
    // HSBC / 匯豐
    hsbc: 'hsbc.svg',
    'hsbc bank': 'hsbc.svg',
    匯豐: 'hsbc.svg',
    'hsbc hk': 'hsbc.svg',
    匯豐銀: 'hsbc.svg',

    // Hang Seng / 恒生
    hangseng: 'hangseng.svg',
    'hang seng': 'hangseng.svg',
    'hang seng bank': 'hangseng.svg',
    恒生: 'hangseng.svg',
    恆生: 'hangseng.svg',
    恆生銀: 'hangseng.svg',

    // BMO
    bmo: 'bmo.svg',
    'bmo bank': 'bmo.svg',
    滿地可: 'bmo.svg',
    滿地可銀: 'bmo.svg',

    // Wealthsimple
    wealthsimpl: 'wealthsimple.svg',
  };

  transform(value: string | null | undefined): string | null {
    if (!value) return null;
    
    const key = value.toLowerCase().trim();
    return this.logoMap[key] || null;
  }
}
