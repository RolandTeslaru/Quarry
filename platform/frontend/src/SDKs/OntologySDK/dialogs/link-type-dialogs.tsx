import { useForm, type FieldPath, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@quarry/standard-ui/foundations/input-group'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Icon, type IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { Dataset, Library, Ontology } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ObjectTypeIcon } from '../ui/ObjectTypeIcon'
import { OntologySDK } from '../sdk'

type Kind = Ontology.LinkType.Backing['kind']

type SideKey = Ontology.LinkType.SideKey

const SIDE_KEYS = Ontology.LinkType.SideKey.options

const Side = Ontology.LinkType.Side.Schema.extend({
    objectTypeRid: z.string({ error: 'Choose an object type' }).pipe(Ontology.ObjectType.Rid),
    displayName:   z.string().trim().min(1, 'Name it'),
})

// The backings, with the form's messages: what isn't chosen yet is empty.
const Backing = z.discriminatedUnion('kind', [
    Ontology.LinkType.Backing.ForeignKey.extend({
        foreignKey: z.object({
            side:     Ontology.LinkType.SideKey,
            property: z.string().min(1, 'Choose the property holding the key').pipe(Ontology.Property.ApiName),
        }),
    }),
    Ontology.LinkType.Backing.JoinDataset.extend({
        datasetRid: z.string().min(1, 'Choose the join dataset').pipe(Dataset.Rid),
        columns:    z.object({
            a: z.string().min(1, 'Choose a column'),
            b: z.string().min(1, 'Choose a column'),
        }),
    }),
    Ontology.LinkType.Backing.IntermediaryObject.extend({
        objectTypeRid: z.string().min(1, 'Choose the object type').pipe(Ontology.ObjectType.Rid),
        foreignKeys:   z.object({
            a: z.string().min(1, 'Choose a property').pipe(Ontology.Property.ApiName),
            b: z.string().min(1, 'Choose a property').pipe(Ontology.Property.ApiName),
        }),
    }),
])

// The create request, with the form's messages. Unnamed, it's named after its object types.
const Schema = Ontology.API.LinkType.Create.Request.extend({
    parentRid: z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
    sides:     z.object({
        a: Side,
        b: Side,
    }),
    backing:   Backing,
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

type LinkTypeForm = UseFormReturn<FormInput, unknown, FormOutput>

/** Each backing as it starts, nothing chosen: the foreign key on side a. */
const EMPTY_BACKINGS: Record<Kind, FormInput['backing']> = {
    'foreign-key': {
        kind:       'foreign-key',
        foreignKey: { side: 'a', property: '' },
    },
    'dataset': {
        kind:       'dataset',
        datasetRid: '',
        columns:    { a: '', b: '' },
    },
    'object': {
        kind:          'object',
        objectTypeRid: '',
        foreignKeys:   { a: '', b: '' },
    },
}

const KINDS: Record<Kind, { icon: IconName; title: string; description: string }> = {
    'foreign-key': {
        icon:        'key',
        title:       'Foreign key',
        description: 'A property of one object type holds the other’s primary key. For one-to-one and one-to-many links.',
    },
    'dataset': {
        icon:        'th',
        title:       'Join dataset',
        description: 'A dataset with a column per side, each holding a primary key. For many-to-many links.',
    },
    'object': {
        icon:        'cube',
        title:       'Intermediary object type',
        description: 'An object type between the two, with a property per side. For many-to-many links with properties of their own.',
    },
}

const STEPS = [
    { id: 'kind',      title: 'Relationship type', description: 'Where the pairs of linked objects come from.' },
    { id: 'resources', title: 'Link resources',    description: 'The object types to link, and what joins them.' },
    { id: 'names',     title: 'Link type names',   description: 'What each side calls the other, in apps and in code.' },
] as const

type StepId = (typeof STEPS)[number]['id']

/** What each step asks for — validated before Next leaves it. */
const FIELDS: Record<StepId, FieldPath<FormInput>[]> = {
    kind:      ['backing.kind'],
    resources: ['sides.a.objectTypeRid', 'sides.b.objectTypeRid', 'backing'],
    names:     ['sides', 'parentRid'],
}

interface Props {
    /** Where it goes, if known; otherwise beside its first object type. */
    parentRid?: Library.Resource.Rid
    dialog:     DialogSDK.TemplateProps
}

/** A new link type between two object types: how they're joined, and what each side calls the other. */
export function openCreateLinkTypeDialog(args: { parentRid?: Library.Resource.Rid } = {}) {
    DialogSDK.actions.push('create-link-type', dialog => (
        <LinkTypeWizard parentRid={args.parentRid} dialog={dialog} />
    ))
}

/** The wizard from the first frame: the object types load inside it, and the second step waits for them. */
function LinkTypeWizard({ parentRid, dialog }: Props) {
    const [, [objectTypesRequest]] = OntologySDK.useWith(() => null, query => [query.objectTypes])

    const objectTypes: Record<Ontology.ObjectType.Rid, Ontology.ObjectType> = {}

    for (const objectType of objectTypesRequest.data ?? [])
        objectTypes[objectType.rid] = objectType

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: {
            parentRid,
            sides: {
                a: { displayName: '', apiName: '', cardinality: 'one' },
                b: { displayName: '', apiName: '', cardinality: 'many' },
            },
            backing: EMPTY_BACKINGS['foreign-key'],
        },
    })

    // Read here so the names' dirty state is kept: a name the user typed isn't replaced by a suggestion.
    const { dirtyFields } = form.formState
    const submitting = form.formState.isSubmitting

    // A foreign key's side leads to one object; the other to many, unless it's made one-to-one. Both many otherwise.
    function setCardinalities(backing: FormInput['backing']) {
        if (backing.kind === 'foreign-key') {
            form.setValue(`sides.${backing.foreignKey.side}.cardinality`, 'one')
            form.setValue(`sides.${Ontology.LinkType.getOtherSide(backing.foreignKey.side)}.cardinality`, 'many')

            return
        }

        form.setValue('sides.a.cardinality', 'many')
        form.setValue('sides.b.cardinality', 'many')
    }

    function selectBacking(backing: FormInput['backing']) {
        form.setValue('backing', backing, { shouldValidate: true })
        setCardinalities(backing)
    }

    // Each side's names after the other side's object type — singular or plural by what it leads to — unless typed.
    function suggestNames() {
        const sides = form.getValues('sides')

        for (const side of SIDE_KEYS) {
            const other = objectTypes[sides[Ontology.LinkType.getOtherSide(side)].objectTypeRid as Ontology.ObjectType.Rid]
            const displayName = sides[side].cardinality === 'one' ? other.name : other.pluralDisplayName

            if (!dirtyFields.sides?.[side]?.displayName)
                form.setValue(`sides.${side}.displayName`, displayName)

            if (!dirtyFields.sides?.[side]?.apiName)
                form.setValue(`sides.${side}.apiName`, Ontology.Naming.getCamelCase(displayName))
        }
    }

    async function leaveStep(step: DialogSDK.WizardTemplate.Step): Promise<boolean> {
        const id = step.id as StepId

        if (!await form.trigger(FIELDS[id]))
            return false

        if (id === 'resources')
            suggestNames()

        return true
    }

    async function submit(request: FormOutput) {
        try {
            const linkType = await OntologySDK.actions.createLinkType(request)

            NotificationSDK.toast.success(`Created link type ${linkType.name}`)
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
                title='Create a link type'
                steps={STEPS}
                contentClassName='w-[640px]'
                onNext={leaveStep}
                onSubmit={form.handleSubmit(submit)}
                submitLabel='Create'
                submitting={submitting}
                footer={<ErrorNotice error={form.formState.errors.root?.message ?? null} />}
                renderStep={step => {
                    switch (step.id as StepId) {
                        case 'kind':
                            return <KindStep form={form} onSelect={kind => selectBacking(EMPTY_BACKINGS[kind])} />

                        case 'resources':
                            if (objectTypesRequest.isPending)
                                return <Spinner className='size-6' role='status' aria-label='Loading object types' />

                            if (objectTypesRequest.error)
                                return <ErrorNotice error={objectTypesRequest.error} />

                            return <ResourcesStep form={form} objectTypes={objectTypes} onSelectBacking={selectBacking} />

                        case 'names':
                            return <NamesStep form={form} objectTypes={objectTypes} onCardinality={suggestNames} />
                    }
                }}
            />
        </Form.Root>
    )
}

interface KindStepProps {
    form:     LinkTypeForm
    onSelect: (kind: Kind) => void
}

/** The three ways to back a link, as cards: choosing one starts its backing over. */
function KindStep({ form, onSelect }: KindStepProps) {
    const kind = form.watch('backing.kind')

    return (
        <div role='radiogroup' aria-label='Relationship type' className='flex flex-col gap-2'>
            {(Object.keys(KINDS) as Kind[]).map(item => (
                <button
                    key={item}
                    type='button'
                    role='radio'
                    aria-checked={kind === item}
                    onClick={() => onSelect(item)}
                    className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left',
                        kind === item ? 'border-primary bg-primary/10' : 'hover:bg-accent/50',
                    )}
                >
                    <Icon name={KINDS[item].icon} size={16} className='mt-0.5 shrink-0 text-muted-foreground' />
                    <span className='flex min-w-0 flex-col gap-0.5'>
                        <span className='text-sm font-medium text-foreground'>{KINDS[item].title}</span>
                        <span className='text-xs text-muted-foreground'>{KINDS[item].description}</span>
                    </span>
                </button>
            ))}
        </div>
    )
}

interface ResourcesStepProps {
    form:            LinkTypeForm
    objectTypes:     Record<Ontology.ObjectType.Rid, Ontology.ObjectType>
    onSelectBacking: (backing: FormInput['backing']) => void
}

/**
 * Side a on the left, side b on the right: each its object type, then what it holds — the foreign key, or its
 * primary key; its join dataset column; or its intermediary object type's property.
 */
function ResourcesStep({ form, objectTypes, onSelectBacking }: ResourcesStepProps) {
    const sides = form.watch('sides')
    const backing = form.watch('backing')

    const joinDatasetRid = backing.kind === 'dataset' && backing.datasetRid ? backing.datasetRid as Dataset.Rid : null

    const [, [viewRequest]] = CatalogSDK.useWith(
        () => null,
        query => (joinDatasetRid ? [query.view(joinDatasetRid)] : []),
    )

    const getObjectType = (rid: string | undefined) => objectTypes[rid as Ontology.ObjectType.Rid] as Ontology.ObjectType | undefined

    /** The type of a side's primary key: what its foreign key, join column or intermediary property must hold. */
    function getKeyType(side: SideKey): Ontology.Property.Type | undefined {
        const objectType = getObjectType(sides[side].objectTypeRid)

        return objectType?.properties[objectType.primaryKey].type
    }

    /** The properties of an object type holding keys of this type, by API name; all of them if the type isn't known yet. */
    function getKeyProperties(objectType: Ontology.ObjectType | undefined, keyType: Ontology.Property.Type | undefined) {
        const properties: Record<Ontology.Property.ApiName, Ontology.Property> = {}

        if (!objectType)
            return properties

        for (const apiName of Object.keys(objectType.properties))
            if (!keyType || objectType.properties[apiName].type === keyType)
                properties[apiName] = objectType.properties[apiName]

        return properties
    }

    // The first object type chosen also places the link type, unless it's placed already.
    function selectObjectType(side: SideKey, rid: string) {
        form.setValue(`sides.${side}.objectTypeRid`, rid, { shouldValidate: true })

        if (!form.getValues('parentRid'))
            form.setValue('parentRid', objectTypes[rid as Ontology.ObjectType.Rid].parentRid)
    }

    function renderSide(side: SideKey) {
        const objectType = getObjectType(sides[side].objectTypeRid)
        const keyType = getKeyType(Ontology.LinkType.getOtherSide(side))

        return (
            <div className='flex min-w-0 flex-col gap-2'>
                <Form.Field control={form.control} name={`sides.${side}.objectTypeRid`} render={({ field }) => (
                    <Form.Item>
                        <Form.Label>{side === 'a' ? 'Object type' : 'Linked to'}</Form.Label>
                        <ObjectTypeSelect
                            value={field.value ?? ''}
                            objectTypes={objectTypes}
                            onChange={rid => selectObjectType(side, rid)}
                        />
                        <Form.Message />
                    </Form.Item>
                )} />

                {backing.kind === 'foreign-key' && backing.foreignKey.side === side && (
                    <Form.Field control={form.control} name='backing.foreignKey.property' render={({ field }) => (
                        <Form.Item>
                            <Form.Label>Foreign key</Form.Label>
                            <PropertySelect
                                value={field.value}
                                properties={getKeyProperties(objectType, keyType)}
                                placeholder='Property holding the key…'
                                onChange={field.onChange}
                            />
                            <Form.Message />
                        </Form.Item>
                    )} />
                )}

                {backing.kind === 'foreign-key' && backing.foreignKey.side !== side && (
                    <div className='flex flex-col gap-2'>
                        <span className='text-sm font-medium'>Primary key</span>
                        <span className='flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm text-muted-foreground'>
                            <Icon name='key' size={12} />
                            {objectType ? objectType.properties[objectType.primaryKey].displayName : '—'}
                        </span>
                    </div>
                )}

                {backing.kind === 'dataset' && (
                    <Form.Field control={form.control} name={`backing.columns.${side}`} render={({ field }) => (
                        <Form.Item>
                            <Form.Label>Join column</Form.Label>
                            <Select.Root value={field.value} onValueChange={field.onChange} disabled={!viewRequest?.data}>
                                <Form.Control>
                                    <Select.Trigger size='default'>
                                        <Select.Value placeholder='Column holding its key…' />
                                    </Select.Trigger>
                                </Form.Control>
                                <Select.Content>
                                    {(viewRequest?.data?.view.schema?.columns ?? []).map(column => (
                                        <Select.Item key={column.name} value={column.name}>
                                            {column.name}
                                            <span className='font-mono text-xs text-muted-foreground'>{column.type}</span>
                                        </Select.Item>
                                    ))}
                                </Select.Content>
                            </Select.Root>
                            <Form.Message />
                        </Form.Item>
                    )} />
                )}

                {backing.kind === 'object' && (
                    <Form.Field control={form.control} name={`backing.foreignKeys.${side}`} render={({ field }) => (
                        <Form.Item>
                            <Form.Label>Its property</Form.Label>
                            <PropertySelect
                                value={field.value}
                                properties={getKeyProperties(getObjectType(backing.objectTypeRid), getKeyType(side))}
                                placeholder='Property holding its key…'
                                onChange={field.onChange}
                            />
                            <Form.Message />
                        </Form.Item>
                    )} />
                )}
            </div>
        )
    }

    return (
        <>
            {backing.kind === 'dataset' && (
                <Form.Field control={form.control} name='backing.datasetRid' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Join dataset</Form.Label>
                        <Form.Control>
                            <ResourceInput
                                value={(field.value as Library.Resource.Rid) || null}
                                onChange={dataset => onSelectBacking({ kind: 'dataset', datasetRid: dataset.rid, columns: { a: '', b: '' } })}
                                accept='dataset'
                                placeholder='Choose a dataset…'
                            />
                        </Form.Control>
                        <ErrorNotice error={viewRequest?.error ?? null} />
                        <Form.Message />
                    </Form.Item>
                )} />
            )}

            {backing.kind === 'object' && (
                <Form.Field control={form.control} name='backing.objectTypeRid' render={({ field }) => (
                    <Form.Item>
                        <Form.Label>Intermediary object type</Form.Label>
                        <ObjectTypeSelect
                            value={field.value}
                            objectTypes={objectTypes}
                            onChange={rid => onSelectBacking({ kind: 'object', objectTypeRid: rid, foreignKeys: { a: '', b: '' } })}
                        />
                        <Form.Message />
                    </Form.Item>
                )} />
            )}

            <div className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3'>
                {renderSide('a')}

                <div className='flex h-full items-start pt-6'>
                    {backing.kind === 'foreign-key'
                        ? (
                            <Button
                                type='button'
                                variant='outlined'
                                icon='swap-horizontal'
                                aria-label='Hold the foreign key on the other side'
                                onClick={() => onSelectBacking({
                                    kind:       'foreign-key',
                                    foreignKey: { side: Ontology.LinkType.getOtherSide(backing.foreignKey.side), property: '' },
                                })}
                            />
                        )
                        : <Icon name='arrows-horizontal' size={16} className='mt-2 text-muted-foreground' />}
                </div>

                {renderSide('b')}
            </div>
        </>
    )
}

interface NamesStepProps {
    form:          LinkTypeForm
    objectTypes:   Record<Ontology.ObjectType.Rid, Ontology.ObjectType>
    onCardinality: () => void
}

/** Each side read as a sentence — "Each Flight Alert has one Flight" — then its names; where the link type lives. */
function NamesStep({ form, objectTypes, onCardinality }: NamesStepProps) {
    const sides = form.watch('sides')
    const backing = form.watch('backing')

    // Only a foreign key's other side can choose: one-to-many, or one-to-one.
    function isCardinalityFixed(side: SideKey): boolean {
        return backing.kind !== 'foreign-key' || backing.foreignKey.side === side
    }

    function changeCardinality(side: SideKey, cardinality: Ontology.LinkType.Side.Cardinality) {
        form.setValue(`sides.${side}.cardinality`, cardinality)
        onCardinality()
    }

    return (
        <>
            {SIDE_KEYS.map(side => {
                const from = objectTypes[sides[side].objectTypeRid as Ontology.ObjectType.Rid]
                const to = objectTypes[sides[Ontology.LinkType.getOtherSide(side)].objectTypeRid as Ontology.ObjectType.Rid]
                const cardinality = sides[side].cardinality

                return (
                    <section key={side} className='flex flex-col gap-3 rounded-lg border p-3'>
                        <p className='flex flex-wrap items-center gap-1.5 text-sm'>
                            Each
                            <ObjectTypeName objectType={from} />
                            has
                            {isCardinalityFixed(side)
                                ? <span className='font-semibold'>{cardinality}</span>
                                : (
                                    <Select.Root value={cardinality} onValueChange={value => changeCardinality(side, value as Ontology.LinkType.Side.Cardinality)}>
                                        <Select.Trigger size='sm' className='w-auto'>
                                            <Select.Value />
                                        </Select.Trigger>
                                        <Select.Content>
                                            <Select.Item value='one'>one</Select.Item>
                                            <Select.Item value='many'>many</Select.Item>
                                        </Select.Content>
                                    </Select.Root>
                                )}
                            <ObjectTypeName objectType={to} plural={cardinality === 'many'} />
                        </p>

                        <div className='grid grid-cols-2 gap-3'>
                            <Form.Field control={form.control} name={`sides.${side}.displayName`} render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Name</Form.Label>
                                    <Form.Control>
                                        <Input {...field} />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <Form.Field control={form.control} name={`sides.${side}.apiName`} render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>API name</Form.Label>
                                    <InputGroup>
                                        <InputGroupAddon className='font-mono text-xs'>
                                            {Ontology.Naming.getCamelCase(from.apiName)}.
                                        </InputGroupAddon>
                                        <Form.Control>
                                            <InputGroupInput {...field} className='font-mono' />
                                        </Form.Control>
                                        <InputGroupAddon align='inline-end' className='font-mono text-xs'>
                                            {cardinality === 'one' ? '.get()' : '.all()'}
                                        </InputGroupAddon>
                                    </InputGroup>
                                    <Form.Message />
                                </Form.Item>
                            )} />
                        </div>
                    </section>
                )
            })}

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

interface ObjectTypeNameProps {
    objectType: Ontology.ObjectType
    plural?:    boolean
}

/** An object type in a sentence: its icon and name, as a chip. */
function ObjectTypeName({ objectType, plural = false }: ObjectTypeNameProps) {
    return (
        <span className='inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-medium'>
            <ObjectTypeIcon ui={objectType.ui} size={12} />
            {plural ? objectType.pluralDisplayName : objectType.name}
        </span>
    )
}

interface ObjectTypeSelectProps {
    value:       string
    objectTypes: Record<Ontology.ObjectType.Rid, Ontology.ObjectType>
    onChange:    (rid: string) => void
}

function ObjectTypeSelect({ value, objectTypes, onChange }: ObjectTypeSelectProps) {
    return (
        <Select.Root value={value} onValueChange={onChange}>
            <Form.Control>
                <Select.Trigger size='default'>
                    <Select.Value placeholder='Choose an object type…' />
                </Select.Trigger>
            </Form.Control>
            <Select.Content>
                {Object.values(objectTypes).map(objectType => (
                    <Select.Item key={objectType.rid} value={objectType.rid}>
                        <ObjectTypeIcon ui={objectType.ui} />
                        {objectType.name}
                    </Select.Item>
                ))}
            </Select.Content>
        </Select.Root>
    )
}

interface PropertySelectProps {
    value:       string
    properties:  Record<Ontology.Property.ApiName, Ontology.Property>
    placeholder: string
    onChange:    (apiName: string) => void
}

function PropertySelect({ value, properties, placeholder, onChange }: PropertySelectProps) {
    return (
        <Select.Root value={value} onValueChange={onChange}>
            <Form.Control>
                <Select.Trigger size='default'>
                    <Select.Value placeholder={placeholder} />
                </Select.Trigger>
            </Form.Control>
            <Select.Content>
                {Object.keys(properties).map(apiName => (
                    <Select.Item key={apiName} value={apiName}>
                        {properties[apiName].displayName}
                        <span className='font-mono text-xs text-muted-foreground'>{properties[apiName].type}</span>
                    </Select.Item>
                ))}
            </Select.Content>
        </Select.Root>
    )
}
