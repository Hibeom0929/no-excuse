type EmailCheck =
  | { valid: true; email: string }
  | { valid: false; error: string; suggestion?: string }

// 정확히 알려진 오타만 안내한다. 정상적인 학교/개인 도메인은 허용한다.
const DOMAIN_TYPOS = new Map(Object.entries({
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'outllook.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'naver.con': 'naver.com',
  'gmail.con': 'gmail.com',
  'outlook.con': 'outlook.com',
  'hotmail.con': 'hotmail.com',
  'yahoo.con': 'yahoo.com',
  'icould.com': 'icloud.com',
}))

const SUFFIX_TYPOS = new Map([
  ['comm', 'com'], ['coom', 'com'], ['cmo', 'com'], ['ocm', 'com'], ['nett', 'net'],
])

export function validateEmail(input: string): EmailCheck {
  const value = input.trim()
  if (!value) return { valid: false, error: '먼저 이메일을 입력해주세요.' }
  const parts = value.split('@')
  if (parts.length !== 2) return { valid: false, error: '올바른 이메일 주소를 입력해주세요.' }

  const [local, rawDomain] = parts
  const domain = rawDomain.toLowerCase()
  const labels = domain.split('.')
  const tld = labels[labels.length - 1]
  if (
    value.length > 254 || local.length === 0 || local.length > 64
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
    || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || labels.length < 2
    || labels.some(label => label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(tld)
  ) return { valid: false, error: '올바른 이메일 주소를 입력해주세요.' }

  // .comm/.coom 같은 중복 입력은 메일을 보내기 전에 확인하도록 한다.
  const correctedSuffix = SUFFIX_TYPOS.get(tld)
  const correctedDomain = DOMAIN_TYPOS.get(domain)
    ?? (correctedSuffix ? [...labels.slice(0, -1), correctedSuffix].join('.') : undefined)
  if (correctedDomain) {
    return {
      valid: false,
      error: '이메일 도메인에 오타가 있는지 확인해주세요.',
      suggestion: `${local}@${correctedDomain}`,
    }
  }

  return { valid: true, email: `${local}@${domain}` }
}
