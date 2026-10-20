import type { BillSplitMethod, EventKind, ExpenseCategory, Utility } from '../types'

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  dogs: 'heart',
  electronics: 'plug',
  pool: 'water',
  utilities: 'lightning-charge',
  groceries: 'basket',
  household: 'house',
  maintenance: 'wrench',
  garden: 'flower1',
  other: 'three-dots',
}

export const UTILITY_ICONS: Record<Utility, string> = {
  electricity: 'lightning-charge',
  water: 'droplet',
  rates: 'bank',
  refuse: 'trash',
  sewerage: 'water',
  internet: 'wifi',
  gas: 'fire',
  other: 'three-dots',
}

export const EVENT_ICONS: Record<EventKind, string> = {
  plumbing: 'droplet',
  electrical: 'lightning',
  pool: 'water',
  garden: 'flower1',
  vet: 'heart-pulse',
  'pest control': 'bug',
  cleaning: 'stars',
  inspection: 'clipboard-check',
  general: 'calendar-event',
}

export function kindClass(kind: EventKind): string {
  return `kind-${kind.replace(/\s+/g, '-')}`
}

export const BILL_SPLIT_LABELS: Record<BillSplitMethod, string> = {
  equal: 'Equally',
  weights: 'By member weight',
  occupancy: 'By days lived in the house × weight',
  usage: 'By sub-meter usage',
}
