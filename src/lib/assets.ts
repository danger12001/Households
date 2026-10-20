// Property asset types. Adding a new kind of thing to manage (a jacuzzi, a
// water tank…) is a new entry here: its readings, detail fields, starter
// supplies, and which calendar kind / expense category relate to it.

import type { EventKind, ExpenseCategory, Supply } from '../types'

export interface ReadingDef {
  key: string
  label: string
  unit?: string
  /** Target range; values outside it are flagged. */
  min?: number
  max?: number
  step?: number
}

export interface AssetTypeDef {
  label: string
  icon: string
  readings: ReadingDef[]
  details: { key: string; label: string; placeholder?: string }[]
  supplies: { name: string; unit: string; reorderAt?: number }[]
  eventKind?: EventKind
  expenseCategory?: ExpenseCategory
}

export const ASSET_TYPES: Record<string, AssetTypeDef> = {
  pool: {
    label: 'Pool',
    icon: 'water',
    readings: [
      { key: 'ph', label: 'pH', min: 7.2, max: 7.6, step: 0.1 },
      { key: 'chlorine', label: 'Free chlorine', unit: 'ppm', min: 1, max: 3, step: 0.1 },
      { key: 'alkalinity', label: 'Total alkalinity', unit: 'ppm', min: 80, max: 120, step: 1 },
      { key: 'stabiliser', label: 'Stabiliser (CYA)', unit: 'ppm', min: 30, max: 50, step: 1 },
      { key: 'calcium', label: 'Calcium hardness', unit: 'ppm', min: 200, max: 400, step: 1 },
      { key: 'temperature', label: 'Water temperature', unit: '°C', step: 0.5 },
    ],
    details: [
      { key: 'volume', label: 'Volume', placeholder: 'e.g. 50 000 L' },
      { key: 'pump', label: 'Pump', placeholder: 'Make / model / kW' },
      { key: 'filter', label: 'Filter', placeholder: 'Sand, cartridge…' },
      { key: 'cleaner', label: 'Cleaner', placeholder: 'Kreepy Krauly…' },
      { key: 'pumpHours', label: 'Pump schedule', placeholder: 'e.g. 08:00–14:00' },
    ],
    supplies: [
      { name: 'Chlorine granules', unit: 'kg', reorderAt: 2 },
      { name: 'pH reducer (acid)', unit: 'kg', reorderAt: 1 },
      { name: 'Alkalinity increaser', unit: 'kg', reorderAt: 1 },
      { name: 'Stabiliser', unit: 'kg', reorderAt: 1 },
      { name: 'Clarifier', unit: 'L', reorderAt: 0.5 },
      { name: 'Algaecide', unit: 'L', reorderAt: 0.5 },
    ],
    eventKind: 'pool',
    expenseCategory: 'pool',
  },
  garden: {
    label: 'Garden',
    icon: 'flower1',
    readings: [],
    details: [
      { key: 'irrigation', label: 'Irrigation', placeholder: 'Zones, timer, borehole/municipal' },
      { key: 'service', label: 'Service', placeholder: 'Gardener days' },
    ],
    supplies: [
      { name: 'Fertiliser', unit: 'kg', reorderAt: 2 },
      { name: 'Lawn seed', unit: 'kg' },
    ],
    eventKind: 'garden',
    expenseCategory: 'garden',
  },
  borehole: {
    label: 'Borehole',
    icon: 'moisture',
    readings: [
      { key: 'level', label: 'Water level', unit: 'm', step: 0.1 },
      { key: 'meter', label: 'Meter', unit: 'kL', step: 0.1 },
    ],
    details: [
      { key: 'depth', label: 'Depth', placeholder: 'm' },
      { key: 'pump', label: 'Pump', placeholder: 'Make / model' },
      { key: 'tank', label: 'Storage tank', placeholder: 'L' },
    ],
    supplies: [],
    eventKind: 'plumbing',
    expenseCategory: 'maintenance',
  },
  solar: {
    label: 'Solar / inverter',
    icon: 'sun',
    readings: [
      { key: 'battery', label: 'Battery', unit: '%', min: 20, max: 100, step: 1 },
      { key: 'yield', label: 'Daily yield', unit: 'kWh', step: 0.1 },
    ],
    details: [
      { key: 'panels', label: 'Panels', placeholder: 'e.g. 12 × 550 W' },
      { key: 'inverter', label: 'Inverter', placeholder: 'Make / model / kW' },
      { key: 'battery', label: 'Battery', placeholder: 'kWh / chemistry' },
    ],
    supplies: [],
    eventKind: 'electrical',
    expenseCategory: 'maintenance',
  },
  generator: {
    label: 'Generator',
    icon: 'fuel-pump',
    readings: [
      { key: 'hours', label: 'Run hours', unit: 'h', step: 0.1 },
      { key: 'fuel', label: 'Fuel in tank', unit: 'L', step: 0.5 },
    ],
    details: [
      { key: 'model', label: 'Model', placeholder: 'Make / kVA' },
      { key: 'fuelType', label: 'Fuel', placeholder: 'Petrol / diesel' },
      { key: 'serviceEvery', label: 'Service every', placeholder: 'e.g. 100 h' },
    ],
    supplies: [
      { name: 'Fuel', unit: 'L', reorderAt: 10 },
      { name: 'Engine oil', unit: 'L', reorderAt: 1 },
    ],
    eventKind: 'electrical',
    expenseCategory: 'maintenance',
  },
  other: {
    label: 'Other',
    icon: 'box',
    readings: [],
    details: [],
    supplies: [],
    expenseCategory: 'maintenance',
  },
}

export function assetType(type: string): AssetTypeDef {
  return ASSET_TYPES[type] ?? ASSET_TYPES.other
}

export type ReadingStatus = 'low' | 'ok' | 'high' | 'none'

export function readingStatus(value: number | undefined, def: ReadingDef): ReadingStatus {
  if (value === undefined || !Number.isFinite(value)) return 'none'
  if (def.min !== undefined && value < def.min) return 'low'
  if (def.max !== undefined && value > def.max) return 'high'
  return def.min === undefined && def.max === undefined ? 'none' : 'ok'
}

export function isLowStock(supply: Pick<Supply, 'quantity' | 'reorderAt'>): boolean {
  return supply.reorderAt !== undefined && supply.quantity <= supply.reorderAt
}

/** Most recent value of each reading across logs (newest first), with when it was taken. */
export function latestReadings(
  logs: { takenAt: string; readings: Record<string, number> }[],
): Record<string, { value: number; takenAt: string }> {
  const latest: Record<string, { value: number; takenAt: string }> = {}
  for (const log of [...logs].sort((a, b) => b.takenAt.localeCompare(a.takenAt))) {
    for (const [key, value] of Object.entries(log.readings)) {
      if (!(key in latest)) latest[key] = { value, takenAt: log.takenAt }
    }
  }
  return latest
}
