import { describe, expect, it } from 'vitest'
import { assetType, isLowStock, latestReadings, readingStatus } from './assets'

describe('readingStatus', () => {
  const ph = { key: 'ph', label: 'pH', min: 7.2, max: 7.6 }

  it('flags values outside the target range', () => {
    expect(readingStatus(7.0, ph)).toBe('low')
    expect(readingStatus(7.4, ph)).toBe('ok')
    expect(readingStatus(7.6, ph)).toBe('ok')
    expect(readingStatus(7.9, ph)).toBe('high')
  })

  it('has no status without a range or value', () => {
    expect(readingStatus(25, { key: 't', label: 'Temp' })).toBe('none')
    expect(readingStatus(undefined, ph)).toBe('none')
  })
})

describe('isLowStock', () => {
  it('is low at or below the reorder level', () => {
    expect(isLowStock({ quantity: 2, reorderAt: 2 })).toBe(true)
    expect(isLowStock({ quantity: 3, reorderAt: 2 })).toBe(false)
    expect(isLowStock({ quantity: 0 })).toBe(false)
  })
})

describe('latestReadings', () => {
  it('takes the newest value of each reading', () => {
    const latest = latestReadings([
      { takenAt: '2026-10-01T08:00', readings: { ph: 7.8, chlorine: 0.5 } },
      { takenAt: '2026-10-08T08:00', readings: { ph: 7.4 } },
    ])
    expect(latest).toEqual({
      ph: { value: 7.4, takenAt: '2026-10-08T08:00' },
      chlorine: { value: 0.5, takenAt: '2026-10-01T08:00' },
    })
  })
})

describe('assetType', () => {
  it('falls back to Other for unknown types', () => {
    expect(assetType('jacuzzi').label).toBe('Other')
    expect(assetType('pool').readings.map((r) => r.key)).toContain('ph')
  })
})
