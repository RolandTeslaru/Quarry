'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { Slot } from '@radix-ui/react-slot'
import {
    Controller,
    FormProvider,
    useFormContext,
    useFormState,
    type ControllerProps,
    type FieldPath,
    type FieldValues,
} from 'react-hook-form'
import { cn } from '../utils/cn'
import { Label as LabelFoundation } from './label'

export const Root = FormProvider

type FormFieldContextValue<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
    name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue | undefined>(undefined)

// TTransformedValues: what the form submits once its resolver has run, when that differs from what's typed in.
const Field = <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
    TTransformedValues = TFieldValues,
>({
    ...props
}: ControllerProps<TFieldValues, TName, TTransformedValues>) => {
    return (
        <FormFieldContext.Provider value={{ name: props.name }}>
            <Controller {...props} />
        </FormFieldContext.Provider>
    )
}

export const useFormField = () => {
    const fieldContext = React.useContext(FormFieldContext)
    const itemContext = React.useContext(FormItemContext)
    const { getFieldState } = useFormContext()

    if (!fieldContext || !itemContext) {
        throw new Error('useFormField requires Form.Field and Form.Item')
    }

    const formState = useFormState({ name: fieldContext.name })
    const fieldState = getFieldState(fieldContext.name, formState)

    const { id } = itemContext

    return {
        id,
        name: fieldContext.name,
        formItemId: `${id}-form-item`,
        formDescriptionId: `${id}-form-item-description`,
        formMessageId: `${id}-form-item-message`,
        ...fieldState,
    }
}

type FormItemContextValue = {
    id: string
}

const FormItemContext = React.createContext<FormItemContextValue | undefined>(undefined)

export function Item({ className, ...props }: React.ComponentProps<'div'>) {
    const id = React.useId()

    return (
        <FormItemContext.Provider value={{ id }}>
            <div data-slot='form-item' className={cn('grid gap-2', className)} {...props} />
        </FormItemContext.Provider>
    )
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
    const { error, formItemId } = useFormField()

    return (
        <LabelFoundation
            data-slot='form-label'
            data-error={!!error}
            className={cn(className, ' data-[error=true]:text-destructive subpixel-antialiased')}
            htmlFor={formItemId}
            {...props}
        />
    )
}

export function Control({ ...props }: React.ComponentProps<typeof Slot>) {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

    return (
        <Slot
            data-slot='form-control'
            id={formItemId}
            aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
            aria-invalid={!!error}
            {...props}
        />
    )
}

export function Description({ className, ...props }: React.ComponentProps<'p'>) {
    const { formDescriptionId } = useFormField()

    return (
        <p
            data-slot='form-description'
            id={formDescriptionId}
            className={cn('text-muted-foreground text-sm', className)}
            {...props}
        />
    )
}

export function Message({ className, ...props }: React.ComponentProps<'p'>) {
    const { error, formMessageId } = useFormField()
    const body = error ? String(error?.message ?? '') : props.children

    if (!body) {
        return null
    }

    return (
        <p
            data-slot='form-message'
            id={formMessageId}
            className={cn('text-red-500 text-[11px] font-roboto-mono font-semibold', className)}
            {...props}
        >
            {body}
        </p>
    )
}

export const Form = {
    Root,
    Field,
    Item,
    Label,
    Control,
    Description,
    Message,
}
