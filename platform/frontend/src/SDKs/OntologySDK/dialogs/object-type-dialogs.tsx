import { useFieldArray, useForm, type UseFieldArrayReturn, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Textarea } from '@quarry/standard-ui/foundations/textarea'
import { type Catalog, Dataset, Library, Ontology } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { DEFAULT_OBJECT_TYPE_UI } from '../ui/ObjectTypeIcon'
import { ObjectTypeUiPicker } from '../ui/ObjectTypeUiPicker'
import { OntologySDK } from '../sdk'

/** One property as the form edits it: a row of the properties table. Keyed by API name once submitted. */
const PropertyRow = z.object({
    column:      z.string().min(1, 'Choose a column'),
    type:        Ontology.Property.Type,
    displayName: z.string().trim().min(1, 'Name it'),
    apiName:     Ontology.Property.ApiName,
})

type PropertyRow = z.infer<typeof PropertyRow>

// The create request, with the form's messages: properties are rows, in order, until they're submitted.
const Schema = Ontology.API.ObjectType.Create.Request
    .extend({
        backingDatasetRid: z.string({ error: 'Choose a dataset' }).pipe(Dataset.Rid),
        parentRid:         z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
        name:              z.string().trim().min(1, 'Name it').pipe(Library.Resource.Name),
        pluralDisplayName: z.string().trim().min(1, 'Name them'),
        description:       z.string().trim().transform(value => value || null),
        primaryKey:        z.string().min(1, 'Choose the property that identifies an object'),
        titleProperty:     z.string().min(1, 'Choose the property shown as an object’s title'),
        properties:        PropertyRow.array().min(1, 'Map at least one column'),
    })
    .superRefine((values, context) => {
        const apiNames = new Set<string>()

        // Keyed by API name once submitted: a second one would replace the first.
        for (let index = 0; index < values.properties.length; index++) {
            const apiName = values.properties[index].apiName

            if (apiNames.has(apiName))
                context.addIssue({ code: 'custom', path: ['properties', index, 'apiName'], message: 'Another property has this API name' })

            apiNames.add(apiName)
        }

        // A key or title whose property was removed or renamed.
        if (values.primaryKey && !apiNames.has(values.primaryKey))
            context.addIssue({ code: 'custom', path: ['primaryKey'], message: 'Choose the property that identifies an object' })

        if (values.titleProperty && !apiNames.has(values.titleProperty))
            context.addIssue({ code: 'custom', path: ['titleProperty'], message: 'Choose the property shown as an object’s title' })
    })
    .transform(values => {
        const properties: Record<Ontology.Property.ApiName, Ontology.Property> = {}

        for (const row of values.properties)
            properties[row.apiName] = {
                displayName: row.displayName,
                description: null,
                type:        row.type,
                column:      row.column,
            }

        return {
            ...values,
            properties,
        }
    })

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

const STEPS = [
    { id: 'datasource', title: 'Datasource', description: 'The dataset whose rows are the objects: one row, one object.' },
    { id: 'metadata',   title: 'Metadata',   description: 'What it’s called in apps and in code, and where it lives in the Library.' },
    { id: 'properties', title: 'Properties', description: 'The columns it maps, and the properties that identify and title an object.' },
] as const

type StepId = (typeof STEPS)[number]['id']

/** What each step asks for — validated before Next leaves it. */
const FIELDS: Record<StepId, (keyof FormInput)[]> = {
    datasource: ['backingDatasetRid'],
    metadata:   ['ui', 'name', 'pluralDisplayName', 'apiName', 'description', 'parentRid'],
    properties: ['properties', 'primaryKey', 'titleProperty'],
}

/** A property per column a property can map: `binary` ones have no property type. */
function getPropertyRows(schema: Catalog.ColumnSchema): PropertyRow[] {
    const rows: PropertyRow[] = []

    for (const column of schema.columns) {
        const type = Ontology.Property.getTypeOf(column.type)

        if (type)
            rows.push({
                column:      column.name,
                type,
                displayName: Ontology.Naming.getDisplayName(column.name),
                apiName:     Ontology.Naming.getCamelCase(column.name),
            })
    }

    return rows
}

/** The plural suggested for a name, until the user writes their own. */
const getSuggestedPlural = (name: string) => name ? `${name}s` : ''

interface Props {
    /** Where it goes, if known (the Library folder it was started from); otherwise its dataset's folder. */
    parentRid?: Library.Resource.Rid
    dialog:     DialogSDK.TemplateProps
}

/** A new object type: its backing dataset, what it's called, and the columns it maps. */
export function openCreateObjectTypeDialog(args: { parentRid?: Library.Resource.Rid } = {}) {
    DialogSDK.actions.push('create-object-type', dialog => (
        <ObjectTypeWizard parentRid={args.parentRid} dialog={dialog} />
    ))
}

function ObjectTypeWizard({ parentRid, dialog }: Props) {
    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: {
            parentRid,
            name:              '',
            pluralDisplayName: '',
            apiName:           '',
            description:       '',
            ui:                DEFAULT_OBJECT_TYPE_UI,
            primaryKey:        '',
            titleProperty:     '',
            properties:        [],
        },
    })

    const properties = useFieldArray({ control: form.control, name: 'properties' })

    const submitting = form.formState.isSubmitting

    // Another dataset: its own columns, read when Next leaves this step. Placed beside it unless placed already.
    function selectDataset(dataset: Library.Resource.Base) {
        form.setValue('backingDatasetRid', dataset.rid, { shouldValidate: true })
        properties.replace([])
        form.setValue('primaryKey', '')
        form.setValue('titleProperty', '')

        if (!form.getValues('parentRid') && dataset.parentRid)
            form.setValue('parentRid', dataset.parentRid)
    }

    /** Its columns, as the properties to start from — or why it has none. Kept when coming back to the same dataset. */
    async function readDataset(): Promise<boolean> {
        if (form.getValues('properties').length > 0)
            return true

        const datasetRid = form.getValues('backingDatasetRid') as Dataset.Rid

        try {
            const { view } = await CatalogSDK.fetch(CatalogSDK.query.view(datasetRid))

            if (!view.schema) {
                form.setError('backingDatasetRid', { message: 'This dataset has no columns: it has no data yet, or holds raw files.' })

                return false
            }

            properties.replace(getPropertyRows(view.schema))

            return true
        }
        catch (error) {
            form.setError('backingDatasetRid', { message: errorMessage(error) })

            return false
        }
    }

    async function leaveStep(step: DialogSDK.WizardTemplate.Step): Promise<boolean> {
        const id = step.id as StepId

        if (!await form.trigger(FIELDS[id]))
            return false

        if (id === 'datasource')
            return readDataset()

        return true
    }

    // The plural and the API name follow the name while they're still what it suggested.
    function rename(name: string) {
        const previous = form.getValues('name') ?? ''

        form.setValue('name', name, { shouldDirty: true })

        if (form.getValues('pluralDisplayName') === getSuggestedPlural(previous))
            form.setValue('pluralDisplayName', getSuggestedPlural(name))

        if (form.getValues('apiName') === Ontology.Naming.getPascalCase(previous))
            form.setValue('apiName', Ontology.Naming.getPascalCase(name))
    }

    async function submit(request: FormOutput) {
        try {
            const objectType = await OntologySDK.actions.createObjectType(request)

            NotificationSDK.toast.success(`Created object type ${objectType.name}`)
            DialogSDK.actions.pop(dialog.entry.dialogId)
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <Form.Root {...form}>
            <DialogSDK.WizardTemplate
                {...dialog}
                title='Create an object type'
                steps={STEPS}
                className='h-[min(680px,calc(100vh-64px))]'
                contentClassName='w-[720px]'
                onNext={leaveStep}
                onSubmit={form.handleSubmit(submit)}
                submitLabel='Create'
                submitting={submitting}
                footer={<ErrorNotice error={form.formState.errors.root?.message ?? null} />}
                renderStep={step => {
                    switch (step.id as StepId) {
                        case 'datasource':
                            return (
                                <Form.Field control={form.control} name='backingDatasetRid' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Backing dataset</Form.Label>
                                        <Form.Description>
                                            Shaped for the ontology: a row per object, a column that identifies it, readable column names.
                                        </Form.Description>
                                        <Form.Control>
                                            <ResourceInput
                                                value={(field.value as Library.Resource.Rid | undefined) ?? null}
                                                onChange={selectDataset}
                                                accept='dataset'
                                                placeholder='Choose a dataset…'
                                            />
                                        </Form.Control>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )

                        case 'metadata':
                            return <MetadataStep form={form} onRename={rename} />

                        case 'properties':
                            return (
                                <PropertiesStep
                                    form={form}
                                    datasetRid={form.getValues('backingDatasetRid') as Dataset.Rid}
                                    properties={properties}
                                />
                            )
                    }
                }}
            />
        </Form.Root>
    )
}

type ObjectTypeForm = UseFormReturn<FormInput, unknown, FormOutput>

interface MetadataStepProps {
    form:     ObjectTypeForm
    onRename: (name: string) => void
}

/** Its icon, names, description and place in the Library. */
function MetadataStep({ form, onRename }: MetadataStepProps) {
    return (
        <>
            <div className='grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3'>
                <Form.Field control={form.control} name='ui' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Icon</Form.Label>
                        <ObjectTypeUiPicker value={field.value} onChange={field.onChange} />
                    </Form.Item>
                )} />

                <Form.Field control={form.control} name='name' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Name</Form.Label>
                        <Form.Control>
                            <Input
                                {...field}
                                onChange={event => onRename(event.target.value)}
                                autoFocus
                                placeholder='Flight Alert'
                            />
                        </Form.Control>
                        <Form.Message />
                    </Form.Item>
                )} />

                <Form.Field control={form.control} name='pluralDisplayName' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Plural name</Form.Label>
                        <Form.Control>
                            <Input {...field} placeholder='Flight Alerts' />
                        </Form.Control>
                        <Form.Message />
                    </Form.Item>
                )} />
            </div>

            <Form.Field control={form.control} name='apiName' render={({ field }) => (
                <Form.Item>
                    <Form.Label>API name</Form.Label>
                    <Form.Description>What code calls it: PascalCase, unique in the ontology.</Form.Description>
                    <Form.Control>
                        <Input {...field} className='font-mono' placeholder='FlightAlert' />
                    </Form.Control>
                    <Form.Message />
                </Form.Item>
            )} />

            <Form.Field control={form.control} name='description' render={({ field }) => (
                <Form.Item>
                    <Form.Label>Description</Form.Label>
                    <Form.Control>
                        <Textarea {...field} value={field.value ?? ''} placeholder='Optional' />
                    </Form.Control>
                    <Form.Message />
                </Form.Item>
            )} />

            <Form.Field control={form.control} name='parentRid' render={({ field }) => (
                <Form.Item>
                    <Form.Label>Location</Form.Label>
                    <Form.Control>
                        <ResourceInput
                            value={(field.value as Library.Resource.Rid | undefined) ?? null}
                            onChange={location => field.onChange(location.rid)}
                            accept={['project', 'folder']}
                            placeholder='Choose a project or folder…'
                        />
                    </Form.Control>
                    <Form.Message />
                </Form.Item>
            )} />
        </>
    )
}

interface PropertiesStepProps {
    form:       ObjectTypeForm
    datasetRid: Dataset.Rid
    properties: UseFieldArrayReturn<FormInput, 'properties'>
}

/** The properties table — a column, its type, a name and an API name per row — then the key and the title. */
function PropertiesStep({ form, datasetRid, properties }: PropertiesStepProps) {
    // Read already, by Next on the first step.
    const [, [viewRequest]] = CatalogSDK.useWith(() => null, query => [query.view(datasetRid)])

    const columns: Record<string, Ontology.Property.Type> = {}

    for (const column of viewRequest.data?.view.schema?.columns ?? []) {
        const type = Ontology.Property.getTypeOf(column.type)

        if (type)
            columns[column.name] = type
    }

    const rows = form.watch('properties')

    // Another column: its type, and its suggested names unless the row has its own.
    function selectColumn(index: number, column: string) {
        const row = form.getValues(`properties.${index}`)

        form.setValue(`properties.${index}.column`, column, { shouldValidate: true })
        form.setValue(`properties.${index}.type`, columns[column])

        if (row.displayName === Ontology.Naming.getDisplayName(row.column))
            form.setValue(`properties.${index}.displayName`, Ontology.Naming.getDisplayName(column))

        if (row.apiName === Ontology.Naming.getCamelCase(row.column))
            renameProperty(index, Ontology.Naming.getCamelCase(column))
    }

    // The key and the title name a property by API name: they follow it.
    function renameProperty(index: number, apiName: string) {
        const previous = form.getValues(`properties.${index}.apiName`)

        form.setValue(`properties.${index}.apiName`, apiName, { shouldDirty: true })

        if (form.getValues('primaryKey') === previous)
            form.setValue('primaryKey', apiName)

        if (form.getValues('titleProperty') === previous)
            form.setValue('titleProperty', apiName)
    }

    // The first column no row maps yet, or the first column.
    function addProperty() {
        const mapped = new Set<string>()

        for (const row of form.getValues('properties'))
            mapped.add(row.column)

        let next = Object.keys(columns)[0]

        for (const column of Object.keys(columns))
            if (!mapped.has(column)) {
                next = column
                break
            }

        properties.append({
            column:      next,
            type:        columns[next],
            displayName: Ontology.Naming.getDisplayName(next),
            apiName:     Ontology.Naming.getCamelCase(next),
        })
    }

    return (
        <>
            {/* The rows scroll on their own: the header, Add property, and the key and title stay in view. */}
            <section className='flex min-h-0 flex-1 flex-col'>
                <div className='grid shrink-0 grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 border-b pb-1.5 text-xs text-muted-foreground'>
                    <span>Column</span>
                    <span>Type</span>
                    <span>Name</span>
                    <span>API name</span>
                </div>

                <div className='flex min-h-0 flex-col overflow-y-auto'>
                    {properties.fields.map((property, index) => (
                        <div
                            key={property.id}
                            className='grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-start gap-2 border-b py-1.5'
                        >
                            <Form.Field control={form.control} name={`properties.${index}.column`} render={({ field }) => (
                                <Form.Item>
                                    <Select.Root value={field.value} onValueChange={column => selectColumn(index, column)}>
                                        <Form.Control>
                                            <Select.Trigger size='sm'>
                                                <Select.Value placeholder='Column…' />
                                            </Select.Trigger>
                                        </Form.Control>
                                        <Select.Content>
                                            {Object.keys(columns).map(column => (
                                                <Select.Item key={column} value={column}>{column}</Select.Item>
                                            ))}
                                        </Select.Content>
                                    </Select.Root>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <span className='py-1.5 font-mono text-xs text-muted-foreground'>{rows[index]?.type}</span>

                            <Form.Field control={form.control} name={`properties.${index}.displayName`} render={({ field }) => (
                                <Form.Item>
                                    <Form.Control>
                                        <Input size='sm' {...field} />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <Form.Field control={form.control} name={`properties.${index}.apiName`} render={({ field }) => (
                                <Form.Item>
                                    <Form.Control>
                                        <Input
                                            size='sm'
                                            {...field}
                                            onChange={event => renameProperty(index, event.target.value)}
                                            className='font-mono'
                                        />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <Button
                                type='button'
                                variant='minimal'
                                icon='remove'
                                aria-label='Remove property'
                                onClick={() => properties.remove(index)}
                            />
                        </div>
                    ))}
                </div>

                <Button type='button' variant='minimal' icon='plus' className='mt-1 shrink-0 self-start' onClick={addProperty}>
                    Add property
                </Button>

                <ErrorNotice error={form.formState.errors.properties?.root?.message ?? form.formState.errors.properties?.message ?? null} />
            </section>

            <div className='grid shrink-0 grid-cols-2 gap-3'>
                <Form.Field control={form.control} name='primaryKey' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Primary key</Form.Label>
                        <Select.Root value={field.value} onValueChange={field.onChange}>
                            <Form.Control>
                                <Select.Trigger size='default'>
                                    <Select.Value placeholder='Select a property…' />
                                </Select.Trigger>
                            </Form.Control>
                            <Select.Content>
                                {rows.map((row, index) => Ontology.Property.PRIMARY_KEY_TYPES.includes(row.type) && row.apiName && (
                                    <Select.Item key={index} value={row.apiName}>{row.displayName}</Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Root>
                        <Form.Description>A string, integer or long, unique to each row.</Form.Description>
                        <Form.Message />
                    </Form.Item>
                )} />

                <Form.Field control={form.control} name='titleProperty' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Title</Form.Label>
                        <Select.Root value={field.value} onValueChange={field.onChange}>
                            <Form.Control>
                                <Select.Trigger size='default'>
                                    <Select.Value placeholder='Select a property…' />
                                </Select.Trigger>
                            </Form.Control>
                            <Select.Content>
                                {rows.map((row, index) => row.apiName && (
                                    <Select.Item key={index} value={row.apiName}>{row.displayName}</Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Root>
                        <Form.Description>What an object is called wherever it's shown.</Form.Description>
                        <Form.Message />
                    </Form.Item>
                )} />
            </div>
        </>
    )
}
