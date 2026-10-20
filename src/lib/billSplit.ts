import type { Bill, Member } from '../types'
import { diffDays } from './dates'
import { allocateByWeights } from './splits'

/** Days (inclusive) a member lived in the house during [start, end]. */
export function daysResident(member: Pick<Member, 'moveIn' | 'moveOut'>, start: string, end: string): number {
  const from = member.moveIn && member.moveIn > start ? member.moveIn : start
  const to = member.moveOut && member.moveOut < end ? member.moveOut : end
  return Math.max(0, diffDays(from, to) + 1)
}

export function billWeights(
  bill: Pick<Bill, 'splitMethod' | 'participants' | 'usage' | 'periodStart' | 'periodEnd'>,
  members: Record<string, Member>,
): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const id of bill.participants) {
    const member = members[id]
    if (!member) continue
    switch (bill.splitMethod) {
      case 'equal':
        weights[id] = 1
        break
      case 'weights':
        weights[id] = member.weight
        break
      case 'occupancy':
        weights[id] = member.weight * daysResident(member, bill.periodStart, bill.periodEnd)
        break
      case 'usage':
        weights[id] = bill.usage[id] ?? 0
        break
    }
  }
  return weights
}

export function allocateBill(
  bill: Pick<Bill, 'amountCents' | 'splitMethod' | 'participants' | 'usage' | 'periodStart' | 'periodEnd'>,
  members: Record<string, Member>,
): Record<string, number> {
  if (bill.amountCents <= 0) throw new Error('Amount must be more than zero')
  if (bill.periodEnd < bill.periodStart) throw new Error('Billing period ends before it starts')
  const weights = billWeights(bill, members)
  if (!Object.values(weights).some((w) => w > 0)) {
    throw new Error(
      bill.splitMethod === 'usage'
        ? 'Enter sub-meter usage for at least one person'
        : bill.splitMethod === 'occupancy'
          ? 'Nobody selected lived in the house during this period'
          : 'Choose at least one person to split with',
    )
  }
  return allocateByWeights(bill.amountCents, weights)
}
