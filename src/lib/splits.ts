import type { SplitMethod } from '../types'

/**
 * Splits totalCents in proportion to weights using the largest-remainder
 * method, so the parts are whole cents that always add up to the total.
 * Members with a weight <= 0 get nothing. Ties go to the earlier key.
 */
export function allocateByWeights(
  totalCents: number,
  weights: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0)
  if (entries.length === 0 || totalWeight <= 0) {
    throw new Error('Choose at least one person to split with')
  }

  const parts = entries.map(([id, w], index) => {
    const exact = (totalCents * w) / totalWeight
    const floor = Math.floor(exact)
    return { id, floor, remainder: exact - floor, index }
  })
  let leftover = totalCents - parts.reduce((sum, p) => sum + p.floor, 0)
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const part of byRemainder) {
    if (leftover <= 0) break
    part.floor += 1
    leftover -= 1
  }

  return Object.fromEntries(parts.map((p) => [p.id, p.floor]))
}

/** Turns what the user entered in the split editor into cents owed per member. */
export function resolveSplit(
  method: SplitMethod,
  totalCents: number,
  input: Record<string, number>,
): Record<string, number> {
  if (totalCents <= 0) throw new Error('Amount must be more than zero')

  if (method === 'exact') {
    const allocations = Object.fromEntries(Object.entries(input).filter(([, c]) => c > 0))
    const sum = Object.values(allocations).reduce((a, b) => a + b, 0)
    if (sum !== totalCents) {
      throw new Error(`Exact amounts add up to ${(sum / 100).toFixed(2)}, not ${(totalCents / 100).toFixed(2)}`)
    }
    return allocations
  }

  const weights =
    method === 'equal'
      ? Object.fromEntries(Object.entries(input).filter(([, v]) => v > 0).map(([id]) => [id, 1]))
      : input
  return allocateByWeights(totalCents, weights)
}
