import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { TableViewer } from '@quarry/standard-ui/components/TableViewer'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { Switch } from '@quarry/standard-ui/foundations/switch'
import { Catalog, type Dataset } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ErrorNotice } from '@/components/ErrorNotice'
import { CatalogSDK } from '../sdk'

const Schema = Catalog.ColumnSchema.Schema

/** What a CSV column can be read as. */
const TYPES = ['string', 'integer', 'long', 'double', 'boolean', 'date', 'timestamp'] as const

const DELIMITERS: Record<string, string> = {
    ',':  'Comma',
    ';':  'Semicolon',
    '\t': 'Tab',
    '|':  'Pipe',
}

/** Radix's Select can't hold an empty value: "none" stands for '' (no quote / no escape character). */
const NONE = 'none'

interface Props {
    datasetRid: Dataset.Rid
    dialog:     DialogSDK.TemplateProps
}

/** How the dataset's files are read: a CSV's options and each column's type. Saving makes a new version, same files. */
export function openEditSchemaDialog(args: { datasetRid: Dataset.Rid }) {
    DialogSDK.actions.push(`edit-schema-${args.datasetRid}`, dialog => (
        <EditSchemaDialog datasetRid={args.datasetRid} dialog={dialog} />
    ))
}

function EditSchemaDialog({ datasetRid, dialog }: Props) {
    const [, [viewRequest]] = CatalogSDK.useWith(() => null, query => [query.view(datasetRid)])
    const current = viewRequest.data?.view.schema ?? undefined

    // Filled from the dataset's schema once it's read; the dialog stays the same template meanwhile.
    const form = useForm<Catalog.ColumnSchema>({
        resolver: zodResolver(Schema),
        values:   current,
    })

    const { fields } = useFieldArray({ control: form.control, name: 'columns' })

    const [preview, setPreview] = useState<Catalog.API.Dataset.PreviewWithSchema.Response | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [previewing, setPreviewing] = useState(false)

    const submitting = form.formState.isSubmitting
    const format = form.watch('reader.format')

    async function previewDraft() {
        if (!await form.trigger())
            return

        setPreviewing(true)
        setPreviewError(null)

        try {
            setPreview(await CatalogSDK.actions.dataset.previewWithSchema(datasetRid, form.getValues()))
        }
        catch (error) {
            setPreview(null)
            setPreviewError(errorMessage(error))
        }
        finally {
            setPreviewing(false)
        }
    }

    async function save(schema: Catalog.ColumnSchema) {
        try {
            const { sequence } = await CatalogSDK.actions.dataset.setSchema(datasetRid, schema)

            NotificationSDK.toast.success('Schema saved', { description: `The dataset is now at version ${sequence}, read this way.` })
            DialogSDK.actions.pop(dialog.entry.dialogId)
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!submitting}
            className='w-[min(880px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>Edit schema</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description>
                How the dataset's files are read. Saving makes a new version with the same files, read this way from then on.
            </Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(save)} className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        {!current && (
                            viewRequest.isPending
                                ? <Skeleton className='h-48 w-full' />
                                : <p className='text-sm text-muted-foreground'>The dataset has no files yet: upload one first.</p>
                        )}

                        {current && format === 'parquet' && (
                            <p className='text-sm text-muted-foreground'>
                                Parquet files describe their own columns and types: there's nothing to change.
                            </p>
                        )}

                        {current && format === 'csv' && (
                            <fieldset disabled={submitting} className='flex flex-col gap-5'>
                                <section className='grid grid-cols-4 gap-3'>
                                    <Form.Field control={form.control} name='reader.delimiter' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Delimiter</Form.Label>
                                            <Select.Root value={field.value} onValueChange={field.onChange}>
                                                <Form.Control>
                                                    <Select.Trigger size='sm'><Select.Value /></Select.Trigger>
                                                </Form.Control>
                                                <Select.Content>
                                                    {Object.keys(DELIMITERS).map(delimiter => (
                                                        <Select.Item key={delimiter} value={delimiter}>{DELIMITERS[delimiter]}</Select.Item>
                                                    ))}
                                                    {!DELIMITERS[field.value] && <Select.Item value={field.value}>“{field.value}”</Select.Item>}
                                                </Select.Content>
                                            </Select.Root>
                                        </Form.Item>
                                    )} />

                                    <Form.Field control={form.control} name='reader.quote' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Quote</Form.Label>
                                            <Select.Root value={field.value || NONE} onValueChange={value => field.onChange(value === NONE ? '' : value)}>
                                                <Form.Control>
                                                    <Select.Trigger size='sm'><Select.Value /></Select.Trigger>
                                                </Form.Control>
                                                <Select.Content>
                                                    <Select.Item value='"'>Double quote (")</Select.Item>
                                                    <Select.Item value="'">Single quote (')</Select.Item>
                                                    <Select.Item value={NONE}>None</Select.Item>
                                                </Select.Content>
                                            </Select.Root>
                                        </Form.Item>
                                    )} />

                                    <Form.Field control={form.control} name='reader.escape' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Escape</Form.Label>
                                            <Select.Root value={field.value || NONE} onValueChange={value => field.onChange(value === NONE ? '' : value)}>
                                                <Form.Control>
                                                    <Select.Trigger size='sm'><Select.Value /></Select.Trigger>
                                                </Form.Control>
                                                <Select.Content>
                                                    <Select.Item value='"'>Doubled quote ("")</Select.Item>
                                                    <Select.Item value={'\\'}>Backslash (\)</Select.Item>
                                                    <Select.Item value={NONE}>None</Select.Item>
                                                </Select.Content>
                                            </Select.Root>
                                        </Form.Item>
                                    )} />

                                    <Form.Field control={form.control} name='reader.header' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Header row</Form.Label>
                                            <Form.Control>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} className='mt-1.5' />
                                            </Form.Control>
                                        </Form.Item>
                                    )} />
                                </section>

                                <section className='flex flex-col'>
                                    <div className='grid grid-cols-[1fr_12rem] gap-3 border-b border-border pb-1.5 text-xs text-muted-foreground'>
                                        <span>Column</span>
                                        <span>Type</span>
                                    </div>

                                    <div className='flex max-h-64 flex-col overflow-y-auto'>
                                        {fields.map((column, index) => (
                                            <div key={column.id} className='grid grid-cols-[1fr_12rem] items-start gap-3 border-b border-border py-1.5'>
                                                <Form.Field control={form.control} name={`columns.${index}.name`} render={({ field }) => (
                                                    <Form.Item>
                                                        <Form.Control>
                                                            <Input size='sm' {...field} />
                                                        </Form.Control>
                                                        <Form.Message />
                                                    </Form.Item>
                                                )} />

                                                <Form.Field control={form.control} name={`columns.${index}.type`} render={({ field }) => (
                                                    <Form.Item>
                                                        <Select.Root value={field.value} onValueChange={field.onChange}>
                                                            <Form.Control>
                                                                <Select.Trigger size='sm'><Select.Value /></Select.Trigger>
                                                            </Form.Control>
                                                            <Select.Content>
                                                                {TYPES.map(type => <Select.Item key={type} value={type}>{type}</Select.Item>)}
                                                                {!TYPES.includes(field.value as typeof TYPES[number]) && (
                                                                    <Select.Item value={field.value}>{field.value}</Select.Item>
                                                                )}
                                                            </Select.Content>
                                                        </Select.Root>
                                                    </Form.Item>
                                                )} />
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className='flex flex-col gap-2'>
                                    <div className='flex items-center justify-between'>
                                        <span className='text-sm font-medium'>Preview</span>
                                        <Button size='sm' icon='eye-open' loading={previewing} onClick={() => void previewDraft()}>
                                            Preview with these settings
                                        </Button>
                                    </div>

                                    <ErrorNotice error={previewError} />

                                    {preview && preview.schema && (
                                        <div className='h-56 overflow-hidden rounded-md border border-border'>
                                            <TableViewer columns={preview.schema.columns} rows={preview.rows} />
                                        </div>
                                    )}
                                </section>
                            </fieldset>
                        )}

                        <ErrorNotice error={form.formState.errors.root?.message ?? null} />
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Dialog.Cancel disabled={submitting}>Cancel</Dialog.Cancel>
                        <Dialog.Action type='submit' intent='primary' loading={submitting} disabled={format !== 'csv'}>
                            Save schema
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}
