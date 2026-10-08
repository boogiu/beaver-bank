export function AmountInput({
  value,
  onChange,
  invalid = false,
  allowNegative = false
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  allowNegative?: boolean
}): React.JSX.Element {
  return (
    <input
      value={value}
      inputMode="numeric"
      className={invalid ? 'invalid' : ''}
      onChange={(e) => {
        const event = e.nativeEvent as InputEvent
        const keyboardDigit =
          event.inputType === 'insertText' &&
          (allowNegative ? /^[\d-]$/ : /^\d$/).test(event.data ?? '')
        const deleting = event.inputType?.startsWith('delete')
        const formatted = allowNegative
          ? /^-?(?:\d+|\d{1,3}(?:,\d{3})+)?$/
          : /^(?:\d+|\d{1,3}(?:,\d{3})+)?$/
        if (!keyboardDigit && !deleting && !formatted.test(e.target.value)) return
        const raw = e.target.value.replaceAll(',', '')
        if (!(allowNegative ? /^-?\d*$/ : /^\d*$/).test(raw)) return
        onChange(raw.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
      }}
    />
  )
}
