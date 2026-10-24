export type Schema = {
    type?:        string
    title?:       string
    description?: string
    secret?:      boolean
    default?:     unknown
    const?:       unknown
    enum?:        unknown[]
    properties?:  Record<string, Schema>
    required?:    string[]
    oneOf?:       Schema[]
    anyOf?:       Schema[]
    minLength?:   number
    minimum?:     number
}

export type Values = Record<string, unknown>
