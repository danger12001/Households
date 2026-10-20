import { useActiveHousehold } from '../contexts/HouseholdContext'
import { convertCents } from '../lib/exchange'
import { formatMoney } from '../lib/money'

interface MoneyProps {
  cents: number
  /** Show the landlord-currency conversion even for tenants. */
  alwaysConvert?: boolean
  /** Hide the conversion even for landlords (e.g. in dense lists). */
  noConvert?: boolean
  className?: string
}

/** A rand amount, with the landlord's currency alongside for landlords. */
export function Money({ cents, alwaysConvert, noConvert, className }: MoneyProps) {
  const { household, isLandlord } = useActiveHousehold()
  const rate = household.exchangeRate
  const showAlt = !noConvert && (isLandlord || alwaysConvert) && rate && household.landlordCurrency !== household.currency

  return (
    <span className={`money ${className ?? ''}`}>
      {formatMoney(cents, household.currency)}
      {showAlt && (
        <span
          className="money-alt"
          title={`At ${household.rateSource === 'manual' ? 'estimated' : 'ECB'} rate 1 ${household.currency} = ${rate} ${household.landlordCurrency}`}
        >
          ≈ {formatMoney(convertCents(cents, rate), household.landlordCurrency)}
        </span>
      )}
    </span>
  )
}
