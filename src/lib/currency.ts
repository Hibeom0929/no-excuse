import { CurrencyCode } from '../types'

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'KRW', label: '한국 원 (KRW)', symbol: '₩' },
  { code: 'SGD', label: '싱가포르 달러 (SGD)', symbol: 'S$' },
  { code: 'USD', label: '미국 달러 (USD)', symbol: '$' },
  { code: 'JPY', label: '일본 엔 (JPY)', symbol: '¥' },
  { code: 'EUR', label: '유로 (EUR)', symbol: '€' },
  { code: 'GBP', label: '영국 파운드 (GBP)', symbol: '£' },
  { code: 'MYR', label: '말레이시아 링깃 (MYR)', symbol: 'RM' },
  { code: 'CNY', label: '중국 위안 (CNY)', symbol: '¥' },
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
