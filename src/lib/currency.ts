import { CurrencyCode } from '../types'

export const CURRENCIES: { code: CurrencyCode; label: string; labelEn: string; symbol: string }[] = [
  { code: 'KRW', label: '한국 원 (KRW)', labelEn: 'Korean won (KRW)', symbol: '₩' },
  { code: 'SGD', label: '싱가포르 달러 (SGD)', labelEn: 'Singapore dollar (SGD)', symbol: 'S$' },
  { code: 'USD', label: '미국 달러 (USD)', labelEn: 'US dollar (USD)', symbol: '$' },
  { code: 'JPY', label: '일본 엔 (JPY)', labelEn: 'Japanese yen (JPY)', symbol: '¥' },
  { code: 'EUR', label: '유로 (EUR)', labelEn: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: '영국 파운드 (GBP)', labelEn: 'British pound (GBP)', symbol: '£' },
  { code: 'MYR', label: '말레이시아 링깃 (MYR)', labelEn: 'Malaysian ringgit (MYR)', symbol: 'RM' },
  { code: 'CNY', label: '중국 위안 (CNY)', labelEn: 'Chinese yuan (CNY)', symbol: '¥' },
]

// 소수점 없이 쓰는 통화들
const ZERO_DECIMAL: CurrencyCode[] = ['KRW', 'JPY']

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const meta = CURRENCIES.find(c => c.code === currency)
  const symbol = meta?.symbol ?? currency
  const decimals = ZERO_DECIMAL.includes(currency) ? 0 : 2
  const num = amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${symbol}${num}`
}
