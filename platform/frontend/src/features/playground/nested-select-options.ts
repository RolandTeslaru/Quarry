export type NestedSelectOption = {
    kind: 'branch'
    label: string
    children: NestedSelectOption[]
} | {
    kind: 'dataset'
    label: string
    value: string
    disabled?: boolean
}

export interface NestedSelectSelection {
    value: string
    label: string
    path: string[]
}

export const nestedSelectOptions: NestedSelectOption[] = [
    {
        kind: 'branch',
        label: 'Production',
        children: [
            {
                kind: 'branch',
                label: 'Analytics',
                children: [
                    {
                        kind: 'branch',
                        label: 'Sales',
                        children: [
                            {
                                kind: 'dataset',
                                label: 'Transactions',
                                value: 'transactions',
                            },
                            {
                                kind: 'dataset',
                                label: 'Customers',
                                value: 'customers',
                            },
                            {
                                kind: 'dataset',
                                label: 'Archived orders',
                                value: 'archived-orders',
                                disabled: true,
                            },
                        ],
                    },
                    {
                        kind: 'branch',
                        label: 'Finance',
                        children: [
                            {
                                kind: 'dataset',
                                label: 'Invoices',
                                value: 'invoices',
                            },
                            {
                                kind: 'dataset',
                                label: 'Payments',
                                value: 'payments',
                            },
                        ],
                    },
                ],
            },
            {
                kind: 'branch',
                label: 'Operations',
                children: [
                    {
                        kind: 'dataset',
                        label: 'Inventory',
                        value: 'inventory',
                    },
                    {
                        kind: 'dataset',
                        label: 'Shipments',
                        value: 'shipments',
                    },
                ],
            },
        ],
    },
    {
        kind: 'branch',
        label: 'Staging',
        children: [
            {
                kind: 'branch',
                label: 'Sandbox',
                children: [
                    {
                        kind: 'branch',
                        label: 'Imports',
                        children: [
                            {
                                kind: 'dataset',
                                label: 'Sample customers',
                                value: 'sample-customers',
                            },
                            {
                                kind: 'dataset',
                                label: 'Sample orders',
                                value: 'sample-orders',
                            },
                        ],
                    },
                ],
            },
        ],
    },
]

export interface NestedSelectOptionsProps {
    options: NestedSelectOption[]
    selection: NestedSelectSelection | null
    onSelect: (selection: NestedSelectSelection) => void
    path: string[]
}
