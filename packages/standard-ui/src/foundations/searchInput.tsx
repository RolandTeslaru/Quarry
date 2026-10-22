import * as React from 'react'
import { useDebouncedCallback } from 'use-debounce'

import { cn } from '../utils/cn'
import { SystemIcons } from '../icons'
import { Input } from './input'

type SearchInputProps = Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> & {
    onSearch: (value: string) => void
    delay?: number
    wrapperClassName?: string
}

function SearchInput({
    onSearch,
    delay = 250,
    defaultValue = '',
    placeholder = 'Search',
    className,
    wrapperClassName,
    ...props
}: SearchInputProps) {
    const [value, setValue] = React.useState(String(defaultValue))

    const debouncedSearch = useDebouncedCallback(onSearch, delay)

    React.useEffect(() => {
        return () => {
            debouncedSearch.cancel()
        }
    }, [debouncedSearch])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value)
        debouncedSearch(e.target.value)
    }

    return (
        <div className={cn('relative ', wrapperClassName)} data-slot='search-input'>
            <Input
                type='search'
                placeholder={placeholder}
                className={cn('pr-7 rounded-full! backdrop-blur-md', className)}
                value={value}
                onChange={handleChange}
                {...props}
            />
            <SystemIcons.Search className='absolute top-1/2 right-2 size-4 -translate-y-1/2 opacity-50 pointer-events-none' />
        </div>
    )
}

export { SearchInput }
