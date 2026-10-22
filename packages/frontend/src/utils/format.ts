const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
})

export const dateTime = (value: Date | null): string =>
    value ? dateTimeFormatter.format(value) : '—'

export const number = (value: number | null | undefined): string =>
    value == null ? '—' : value.toLocaleString()
