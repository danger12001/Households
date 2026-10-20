import type { Expense, Settlement } from '../types'

export interface Transfer {
  from: string
  to: string
  amountCents: number
}

/**
 * Net position per member in cents: positive means the household owes them,
 * negative means they owe. Disputed expenses are left out until resolved.
 */
export function computeNet(
  expenses: Pick<Expense, 'paidBy' | 'allocations' | 'status'>[],
  settlements: Pick<Settlement, 'from' | 'to' | 'amountCents'>[],
): Record<string, number> {
  const net: Record<string, number> = {}
  const add = (id: string, cents: number) => {
    net[id] = (net[id] ?? 0) + cents
  }

  for (const expense of expenses) {
    if (expense.status === 'disputed') continue
    for (const [id, cents] of Object.entries(expense.allocations)) {
      add(id, -cents)
      add(expense.paidBy, cents)
    }
  }
  for (const s of settlements) {
    add(s.from, s.amountCents)
    add(s.to, -s.amountCents)
  }
  return net
}

/**
 * The fewest-ish payments that settle everyone up: repeatedly pair the
 * biggest debtor with the biggest creditor.
 */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amount: -v }))
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amount: v }))
  const transfers: Transfer[] = []

  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.amount - a.amount)
    creditors.sort((a, b) => b.amount - a.amount)
    const debtor = debtors[0]
    const creditor = creditors[0]
    const amount = Math.min(debtor.amount, creditor.amount)
    transfers.push({ from: debtor.id, to: creditor.id, amountCents: amount })
    debtor.amount -= amount
    creditor.amount -= amount
    if (debtor.amount === 0) debtors.shift()
    if (creditor.amount === 0) creditors.shift()
  }
  return transfers
}
