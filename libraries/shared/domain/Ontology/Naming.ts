/**
 * Names suggested from other names: a column's display name (`flight_alert_id` → `Flight Alert Id`), and an API
 * name from a display name (`[Gena] Flight Alert` → `GenaFlightAlert`, `genaFlightAlert`). Suggestions only:
 * the API name schemas still decide what's valid.
 */
export namespace Naming {

    /** Its words: split at anything not a letter or digit, and where a lowercase letter meets a capital. */
    export function getWords(text: string): string[] {
        const words: string[] = []

        for (const word of text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/))
            if (word)
                words.push(word)

        return words
    }

    export function getDisplayName(text: string): string {
        const words: string[] = []

        for (const word of getWords(text))
            words.push(capitalize(word))

        return words.join(" ")
    }

    /** An object type's API name. Digits can't start one, so leading ones are dropped. */
    export function getPascalCase(text: string): string {
        let name = ""

        for (const word of getWords(text))
            name += capitalize(word)

        return name.replace(/^[0-9]+/, "")
    }

    /** A property's or a link side's API name. */
    export function getCamelCase(text: string): string {
        const name = getPascalCase(text)

        return name.charAt(0).toLowerCase() + name.slice(1)
    }

    function capitalize(word: string): string {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    }
}
