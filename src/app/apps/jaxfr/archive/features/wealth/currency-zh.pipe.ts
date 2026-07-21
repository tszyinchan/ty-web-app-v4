import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyZh',
  standalone: true,
})
export class CurrencyZhPipe implements PipeTransform {
  private currencyMap: Record<string, string> = {
    CAD: '加幣',
    HKD: '港元',
    USD: '美元',
    CNY: '人民幣',
    JPY: '日元',
    GBP: '英鎊',
    EUR: '歐元',
  };

  transform(value: number | null | undefined, currencyCode: string | null | undefined): string {
    if (value === null || value === undefined) return '-';
    
    const prefix = currencyCode ? (this.currencyMap[currencyCode.toUpperCase()] || currencyCode) : '';
    const formattedValue = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);

    return `${prefix}${formattedValue}`;
  }
}
