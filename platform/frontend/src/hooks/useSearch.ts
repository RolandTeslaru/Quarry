import { useState, type ChangeEvent } from 'react'

/** Whether `text` contains `query` — case-insensitive, ignoring surrounding spaces; an empty query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
    const needle = query.trim().toLowerCase()

    return needle === '' || text.toLowerCase().includes(needle)
}

/**
 * A search box over a list: the query (UI state, not a form value), and the
 * items whose text contains it.
 *
 *   const search = useSearch(Object.values(definitions), item => `${item.displayName} ${item.description}`)
 *
 *   <Input {...search.input} placeholder='Search…' />
 *   {search.results.map(item => …)}
 *   {search.results.length === 0 && <p>No match for “{search.query}”.</p>}
 */
export function useSearch<T>(items: readonly T[], text: (item: T) => string) {
    const [query, setQuery] = useState('')

    const results = items.filter(item => matchesSearch(text(item), query))

    return {
        query,
        setQuery,
        results,
        /** Spread on the search `<Input>`. */
        input: {
            value:    query,
            onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
        },
    }
}
