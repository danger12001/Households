import { Form, InputGroup, Table } from 'react-bootstrap'
import { useActiveHousehold } from '../contexts/HouseholdContext'
import { centsToInput, parseMoney } from '../lib/money'
import type { SplitMethod } from '../types'
import { Money } from './Money'

export interface SplitState {
  method: SplitMethod
  /** equal: 1/0 included; shares: weight. */
  values: Record<string, number>
  /** exact: raw text per member, parsed on change. */
  exactText: Record<string, string>
}

export function splitInputFromState(state: SplitState): Record<string, number> {
  if (state.method !== 'exact') return state.values
  return Object.fromEntries(
    Object.entries(state.exactText)
      .map(([id, text]) => [id, parseMoney(text) ?? 0] as const)
      .filter(([, cents]) => cents > 0),
  )
}

export function stateFromSplitInput(method: SplitMethod, input: Record<string, number>): SplitState {
  return {
    method,
    values: method === 'exact' ? Object.fromEntries(Object.keys(input).map((id) => [id, 1])) : input,
    exactText:
      method === 'exact' ? Object.fromEntries(Object.entries(input).map(([id, c]) => [id, centsToInput(c)])) : {},
  }
}

export function SplitEditor({
  state,
  onChange,
  allocations,
  disabled,
}: {
  state: SplitState
  onChange: (state: SplitState) => void
  allocations: Record<string, number> | null
  disabled?: boolean
}) {
  const { members } = useActiveHousehold()

  const setMethod = (method: SplitMethod) => {
    // Carry participation across methods so switching doesn't lose who's included.
    const included = members.filter((m) =>
      state.method === 'exact' ? (parseMoney(state.exactText[m.id] ?? '') ?? 0) > 0 : (state.values[m.id] ?? 0) > 0,
    )
    onChange({
      method,
      values: Object.fromEntries(included.map((m) => [m.id, method === 'shares' ? m.weight : 1])),
      exactText:
        method === 'exact'
          ? Object.fromEntries(included.map((m) => [m.id, allocations?.[m.id] ? centsToInput(allocations[m.id]) : '']))
          : {},
    })
  }

  return (
    <div className="mb-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <span className="form-label mb-0">Split between</span>
        <Form.Select
          size="sm"
          style={{ width: 'auto' }}
          value={state.method}
          disabled={disabled}
          onChange={(e) => setMethod(e.target.value as SplitMethod)}
        >
          <option value="equal">Equally</option>
          <option value="shares">By shares</option>
          <option value="exact">Exact amounts</option>
        </Form.Select>
      </div>
      <Table size="sm" className="align-middle mb-0">
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>
                {state.method === 'equal' ? (
                  <Form.Check
                    id={`split-${m.id}`}
                    label={m.name}
                    disabled={disabled}
                    checked={(state.values[m.id] ?? 0) > 0}
                    onChange={(e) => onChange({ ...state, values: { ...state.values, [m.id]: e.target.checked ? 1 : 0 } })}
                  />
                ) : (
                  m.name
                )}
              </td>
              {state.method === 'shares' && (
                <td style={{ width: '7rem' }}>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    disabled={disabled}
                    value={state.values[m.id] ?? 0}
                    onChange={(e) =>
                      onChange({ ...state, values: { ...state.values, [m.id]: Math.max(0, Number(e.target.value)) } })
                    }
                  />
                </td>
              )}
              {state.method === 'exact' && (
                <td style={{ width: '9rem' }}>
                  <InputGroup size="sm">
                    <InputGroup.Text>R</InputGroup.Text>
                    <Form.Control
                      inputMode="decimal"
                      disabled={disabled}
                      value={state.exactText[m.id] ?? ''}
                      onChange={(e) => onChange({ ...state, exactText: { ...state.exactText, [m.id]: e.target.value } })}
                    />
                  </InputGroup>
                </td>
              )}
              <td className="text-end text-secondary small" style={{ width: '7rem' }}>
                {allocations?.[m.id] ? <Money cents={allocations[m.id]} noConvert /> : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
