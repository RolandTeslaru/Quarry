import classNames from 'classnames'
import React from 'react'

interface ListProps extends React.HTMLAttributes<HTMLUListElement> {}

export const Root: React.FC<ListProps> = ({ children, className, ...rest }) => {
    return (
        <ul
            className={classNames(
                className,
                'bg-tertiary-opaque  overflow-hidden ',
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
                'text-white px-2 py-[6px] flex flex-row justify-between even:bg-secondary/30 hover:bg-secondary/50 ',
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
