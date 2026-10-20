import type { HouseEvent } from '../types'
import { addDays, addMonths, diffDays } from './dates'

export interface Occurrence {
  event: HouseEvent
  /** 'YYYY-MM-DDTHH:mm' local start of this occurrence. */
  start: string
}

const MAX_OCCURRENCES = 1000

/** Every occurrence of the event whose date falls within [from, to] (inclusive 'YYYY-MM-DD'). */
export function occurrencesBetween(event: HouseEvent, from: string, to: string): Occurrence[] {
  const firstDate = event.start.slice(0, 10)
  const time = event.start.slice(10)
  const until = event.recurUntil && event.recurUntil < to ? event.recurUntil : to
  const result: Occurrence[] = []

  if (event.recurrence === 'none') {
    if (firstDate >= from && firstDate <= to) result.push({ event, start: event.start })
    return result
  }

  const dayOfMonth = Number(firstDate.slice(8, 10))
  let i = 0
  // Jump close to the window so long-running weekly events stay cheap.
  if (event.recurrence !== 'monthly' && from > firstDate) {
    const step = event.recurrence === 'weekly' ? 7 : 14
    i = Math.floor(diffDays(firstDate, from) / step)
  }

  for (let n = 0; n < MAX_OCCURRENCES; n++, i++) {
    const date =
      event.recurrence === 'monthly'
        ? addMonths(firstDate, i, dayOfMonth)
        : addDays(firstDate, i * (event.recurrence === 'weekly' ? 7 : 14))
    if (date > until) break
    if (date >= from) result.push({ event, start: date + time })
  }
  return result
}

export function allOccurrencesBetween(events: HouseEvent[], from: string, to: string): Occurrence[] {
  return events
    .flatMap((event) => occurrencesBetween(event, from, to))
    .sort((a, b) => a.start.localeCompare(b.start))
}
