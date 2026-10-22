import classNames from 'classnames'
import React from 'react'

interface ListProps extends React.HTMLAttributes<HTMLUListElement> {}

export const Root: React.FC<ListProps> = ({ children, className, ...rest }) => {
    return (
        <ul
            className={classNames(
                className,
                'bg-tertiary-opaque border border-border-background rounded-xl overflow-hidden shadow-md shadow-black/20',
            )}
            {...rest}
        >
            {children}
        </ul>
    )
}

interface ListItemProps extends React.LiHTMLAttributes<HTMLLIElement> {}

export const Item: React.FC<ListItemProps> = ({ children, className, ...rest }) => {
    return (
        <li
            className={classNames(
                className,
                'text-white px-2 py-[6px] flex flex-row justify-between even:bg-secondary',
            )}
            {...rest}
        >
            {children}
        </li>
    )
}

export const List = {
    Root,
    Item,
}
