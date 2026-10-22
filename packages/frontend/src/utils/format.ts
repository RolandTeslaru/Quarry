const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
})

export const dateTime = (value: Date | null): string =>
    value ? dateTimeFormatter.format(value) : '—'

export const number = (value: number | null | undefined): string =>
    value == null ? '—' : value.toLocaleString()

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** 234,567 → "229 KB": binary units, one decimal under 10. */
export function fileSize(bytes: number): string {
    let value = bytes
    let unit = 0

    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
        value /= 1024
        unit += 1
    }

    const digits = value < 10 && unit > 0 ? 1 : 0

    return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`
}
