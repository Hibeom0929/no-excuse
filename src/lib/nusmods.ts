import { Weekday } from '../types'

export interface NusmodsSelection {
  moduleCode: string
  lessonCode: string
  classNo: string
}

export interface ImportedTimetableEntry {
  id: string
  subject: string
  location: string
  weekday: Weekday
  startTime: string
  endTime: string
  selected: boolean
}

interface NusmodsLesson {
  classNo: string
  lessonType: string
  day: string
  startTime: string
  endTime: string
  venue: string
}

interface NusmodsModule {
  moduleCode: string
  semesterData?: Array<{ semester: number; timetable: NusmodsLesson[] }>
}

const DAY_TO_WEEKDAY: Record<string, Weekday> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

const LESSON_TYPES: Record<string, string> = {
  LEC: 'Lecture',
  TUT: 'Tutorial',
  LAB: 'Laboratory',
  REC: 'Recitation',
  SEC: 'Sectional Teaching',
  SEM: 'Seminar-Style Module Class',
  DES: 'Design Lecture',
  PLEC: 'Packaged Lecture',
  PTUT: 'Packaged Tutorial',
  TUT2: 'Tutorial Type 2',
  TUT3: 'Tutorial Type 3',
  WKS: 'Workshop',
}

const LESSON_CODES = Object.keys(LESSON_TYPES).sort((a, b) => b.length - a.length).join('|')
const COMPONENT_PATTERN = new RegExp(
  `([A-Z]{2,4}\\s*\\d{4}[A-Z]?)\\s*(?:[^A-Z0-9\\n]{0,4}\\s*)?(${LESSON_CODES})\\s*[\\[\\(\\{\\|I]?\\s*([A-Z0-9]+)\\s*[\\]\\)\\}]?`,
  'g',
)
const MODULE_TOKEN_PATTERN = /\b[A-Z]{2,4}\d{4}[A-Z]?\b/g
const LESSON_TOKEN_PATTERN = new RegExp(
  `\\b(${LESSON_CODES})\\s*[\\[\\(\\{\\|I]?\\s*([A-Z0-9]+)\\s*[\\]\\)\\}]?`,
  'g',
)

export function currentAcademicYear(date = new Date()): string {
  const year = date.getFullYear()
  const startYear = date.getMonth() >= 6 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

export function defaultSemester(date = new Date()): number {
  const month = date.getMonth()
  if (month <= 4) return 2
  if (month <= 6) return 3
  return 1
}

export function academicYearOptions(date = new Date()): string[] {
  const current = currentAcademicYear(date)
  const start = Number(current.slice(0, 4))
  return [`${start - 1}-${start}`, current, `${start + 1}-${start + 2}`]
}

function normalizeClassNo(value: string): string {
  return value.trim().replace(/^O(?=\d)/, '0')
}

function normalizeModuleCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

function uniqueSelections(selections: NusmodsSelection[]): NusmodsSelection[] {
  const seen = new Set<string>()
  return selections.filter(selection => {
    const key = `${selection.moduleCode}|${selection.lessonCode}|${selection.classNo}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function parseNusmodsShareLink(value: string): { semester: number; selections: NusmodsSelection[] } {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('INVALID_NUSMODS_LINK')
  }

  if (!/(^|\.)nusmods\.com$/i.test(url.hostname)) throw new Error('INVALID_NUSMODS_LINK')

  const semesterMatch = url.pathname.match(/\/(?:sem-(1|2)|special-term-(1|2))\/share/i)
  if (!semesterMatch) throw new Error('INVALID_NUSMODS_LINK')
  const semester = semesterMatch[1] ? Number(semesterMatch[1]) : Number(semesterMatch[2]) + 2

  const selections: NusmodsSelection[] = []
  for (const [rawModuleCode, valueList] of url.searchParams.entries()) {
    const moduleCode = normalizeModuleCode(rawModuleCode)
    if (!/^[A-Z]{2,4}\d{4}[A-Z]?$/.test(moduleCode)) continue

    const componentRegex = /([A-Z0-9]+):(?:\(([^)]+)\)|([^,]+))/g
    let match: RegExpExecArray | null
    while ((match = componentRegex.exec(valueList.toUpperCase())) !== null) {
      const lessonCode = match[1]
      const classNo = normalizeClassNo(match[2] ?? match[3])
      if (LESSON_TYPES[lessonCode] && classNo) selections.push({ moduleCode, lessonCode, classNo })
    }
  }

  const unique = uniqueSelections(selections)
  if (unique.length === 0) throw new Error('EMPTY_NUSMODS_LINK')
  return { semester, selections: unique }
}

export function parseNusmodsOcrText(text: string): NusmodsSelection[] {
  const normalizedLines = text
    .toUpperCase()
    .replace(/[‐‑–—]/g, '-')
    // 컬러 블록의 어두운 글자에서 Tesseract가 "CS"를 €5/€S/CS5로 읽는 흔한 경우를 보정한다.
    .replace(/€S?5(?=\d{4})/g, 'CS')
    .replace(/€S(?=\d{4})/g, 'CS')
    .replace(/\bCS5(?=\d{4})/g, 'CS')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const selections: NusmodsSelection[] = []
  // 가로 시간표에서는 서로 다른 요일의 두 블록이 같은 OCR 행에 놓일 수 있다.
  // 과목코드 행과 바로 다음 분반 행의 토큰 수가 같으면 왼쪽부터 짝지어 복원한다.
  for (let lineIndex = 0; lineIndex < normalizedLines.length; lineIndex += 1) {
    MODULE_TOKEN_PATTERN.lastIndex = 0
    const moduleCodes = [...normalizedLines[lineIndex].matchAll(MODULE_TOKEN_PATTERN)].map(match => match[0])
    if (moduleCodes.length === 0) continue

    for (let offset = 0; offset <= 2 && lineIndex + offset < normalizedLines.length; offset += 1) {
      LESSON_TOKEN_PATTERN.lastIndex = 0
      const components = [...normalizedLines[lineIndex + offset].matchAll(LESSON_TOKEN_PATTERN)]
      if (components.length !== moduleCodes.length) continue
      moduleCodes.forEach((moduleCode, index) => selections.push({
        moduleCode,
        lessonCode: components[index][1],
        classNo: normalizeClassNo(components[index][2]),
      }))
      break
    }
  }

  const normalized = normalizedLines.join(' ')
  COMPONENT_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = COMPONENT_PATTERN.exec(normalized)) !== null) {
    selections.push({
      moduleCode: normalizeModuleCode(match[1]),
      lessonCode: match[2],
      classNo: normalizeClassNo(match[3]),
    })
  }
  return uniqueSelections(selections)
}

async function preprocessNusmodsImage(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement
  let dispose: () => void
  if ('createImageBitmap' in window) {
    source = await createImageBitmap(file)
    dispose = () => source instanceof ImageBitmap && source.close()
  } else {
    const imageUrl = URL.createObjectURL(file)
    const image = new Image()
    image.src = imageUrl
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('IMAGE_PROCESSING_FAILED'))
    })
    source = image
    dispose = () => URL.revokeObjectURL(imageUrl)
  }
  try {
    // NUSMods의 가로형 내보내기 이미지는 왼쪽 약 2/3가 시간표 격자이고 오른쪽은 과목 범례다.
    // 격자만 잘라 컬러를 흑백으로 바꾸면 작은 분반 글자의 OCR 정확도가 크게 올라간다.
    const sourceLeft = Math.round(source.width * 0.04)
    const sourceRight = Math.round(source.width * 0.66)
    const sourceWidth = Math.max(1, sourceRight - sourceLeft)
    const scale = sourceWidth < 900 ? 2 : 1
    const canvas = document.createElement('canvas')
    canvas.width = sourceWidth * scale
    canvas.height = source.height * scale
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('IMAGE_PROCESSING_FAILED')

    context.drawImage(source, sourceLeft, 0, sourceWidth, source.height, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      const red = image.data[index]
      const green = image.data[index + 1]
      const blue = image.data[index + 2]
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      const value = luminance >= 135 ? 255 : 0
      image.data[index] = value
      image.data[index + 1] = value
      image.data[index + 2] = value
      image.data[index + 3] = 255
    }
    context.putImageData(image, 0, 0)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_PROCESSING_FAILED')), 'image/png')
    })
  } finally {
    dispose()
  }
}

export async function readNusmodsImage(
  file: File,
  onProgress: (progress: number) => void,
): Promise<NusmodsSelection[]> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('eng', undefined, {
    logger: message => {
      if (message.status === 'recognizing text') onProgress(Math.round(message.progress * 100))
    },
  })

  try {
    const processedImage = await preprocessNusmodsImage(file)
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const result = await worker.recognize(processedImage)
    return parseNusmodsOcrText(result.data.text)
  } finally {
    await worker.terminate()
  }
}

function timeWithColon(value: string): string {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`
}

function classNosMatch(left: string, right: string): boolean {
  if (left.toUpperCase() === right.toUpperCase()) return true
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber
}

export async function resolveNusmodsSelections(
  selections: NusmodsSelection[],
  academicYear: string,
  semester: number,
): Promise<{ entries: ImportedTimetableEntry[]; unresolved: NusmodsSelection[] }> {
  const modules = [...new Set(selections.map(selection => selection.moduleCode))]
  const moduleResults = await Promise.all(modules.map(async moduleCode => {
    const response = await fetch(`https://api.nusmods.com/v2/${academicYear}/modules/${moduleCode}.json`)
    if (!response.ok) return [moduleCode, null] as const
    return [moduleCode, await response.json() as NusmodsModule] as const
  }))
  const moduleMap = new Map(moduleResults)
  const unresolved: NusmodsSelection[] = []
  const entries: ImportedTimetableEntry[] = []

  for (const selection of selections) {
    const moduleData = moduleMap.get(selection.moduleCode)
    const timetable = moduleData?.semesterData?.find(item => item.semester === semester)?.timetable ?? []
    const lessonType = LESSON_TYPES[selection.lessonCode]
    const lessons = timetable.filter(lesson => (
      lesson.lessonType === lessonType && classNosMatch(lesson.classNo, selection.classNo)
    ))

    if (lessons.length === 0) {
      unresolved.push(selection)
      continue
    }

    for (const lesson of lessons) {
      const weekday = DAY_TO_WEEKDAY[lesson.day]
      if (weekday === undefined) continue
      entries.push({
        id: `${selection.moduleCode}-${selection.lessonCode}-${selection.classNo}-${lesson.day}-${lesson.startTime}-${lesson.endTime}`,
        subject: `${selection.moduleCode} ${selection.lessonCode}`,
        location: lesson.venue || '',
        weekday,
        startTime: timeWithColon(lesson.startTime),
        endTime: timeWithColon(lesson.endTime),
        selected: true,
      })
    }
  }

  const merged = new Map<string, ImportedTimetableEntry>()
  for (const entry of entries) {
    const key = `${entry.subject}|${entry.weekday}|${entry.startTime}|${entry.endTime}`
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, entry)
      continue
    }
    const locations = [...new Set([previous.location, entry.location].filter(Boolean))]
    previous.location = locations.join(' / ')
  }

  return {
    entries: [...merged.values()].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)),
    unresolved,
  }
}
