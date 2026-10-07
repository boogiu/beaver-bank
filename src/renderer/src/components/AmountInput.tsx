export function AmountInput({
  value,
  onChange,
  invalid = false
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}): React.JSX.Element {
  return (
    <input
      value={value}
      inputMode="numeric"
      className={invalid ? 'invalid' : ''}
      onChange={(e) => {
        const event = e.nativeEvent as InputEvent
        const keyboardDigit = event.inputType === 'insertText' && /^\d$/.test(event.data ?? '')
        const deleting = event.inputType?.startsWith('delete')
        if (!keyboardDigit && !deleting && !/^(?:\d+|\d{1,3}(?:,\d{3})+)?$/.test(e.target.value))
          return
        const raw = e.target.value.replaceAll(',', '')
        if (!/^\d*$/.test(raw)) return
        onChange(raw.replace(/\B(?=(\d{3})+(?!\d))/g, ','))
      }}
    />
  )
}
