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

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Infinity],
]

/** How long ago: "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function ago(value: Date, now: Date = new Date()): string {
    let amount = (value.getTime() - now.getTime()) / 1000

    if (Math.abs(amount) < 45)
        return 'just now'

    for (const [unit, size] of RELATIVE_STEPS) {
        if (Math.abs(amount) < size)
            return relativeFormatter.format(Math.round(amount), unit)

        amount /= size
    }

    return dateTime(value)
}
