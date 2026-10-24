import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { DataConnection, Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { JSONFieldSchemaRenderer, defaults, type Values } from '@/components/JSONFieldSchemaRenderer'
import { DataConnectionSDK } from '../sdk'

// The create request, with the form's messages; an empty schedule is none (manual runs only).
const Schema = DataConnection.API.Sync.Create.Request.extend({
    name:     z.string().trim().min(1, 'Name the sync'),
    schedule: z.string().trim().transform(value => value || null).pipe(DataConnection.Sync.Schedule),
    output:   z.object({
        parentRid: z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
        name:      z.string().trim().min(1, 'Name the dataset').pipe(Library.Resource.Name),
    }),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

const STEPS = [
    { id: 'name',     title: 'Name',         description: 'What to call this sync.' },
    { id: 'what',     title: 'What to copy', description: 'A table, or the result of a query, from the source.' },
    { id: 'schedule', title: 'Schedule',     description: 'When it runs on its own — or only when you run it.' },
    { id: 'output',   title: 'Output',       description: 'The dataset each run writes a new version of.' },
] as const

type StepId = (typeof STEPS)[number]['id']

/** What each step asks for — validated before Next leaves it. */
const FIELDS: Record<StepId, (keyof FormInput)[]> = {
    name:     ['name'],
    what:     ['config'],
    schedule: ['schedule'],
    output:   ['output'],
}

interface Props {
    source:     DataConnection.Source.Schema
    definition: DataConnection.Source.Definition.Schema
    table?:     DataConnection.Source.Table
    dialog:     DialogSDK.TemplateProps
}

/** A new sync on this source — prefilled for a table when one is given. */
export function openCreateSyncDialog(args: Omit<Props, 'dialog'>) {
    DialogSDK.actions.push(`create-sync-${args.source.rid}`, dialog => (
        <NewSyncDialog {...args} dialog={dialog} />
    ))
}

/** The sync's config from its defaults — for a table, that table. */
function initialConfig(definition: DataConnection.Source.Definition.Schema, table?: DataConnection.Source.Table): Values {
    const config = defaults(definition.syncConfigSchema)

    if (table) {
        config.kind = 'table'
        config.schema = table.schema
        config.table = table.name
    }

    return config
}

function NewSyncDialog({ source, definition, table, dialog }: Props) {
    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: {
            name:     table?.name ?? '',
            config:   initialConfig(definition, table),
            schedule: '',
            // The source's output folder if it has one, else its own folder.
            output:   { parentRid: source.outputFolderRid ?? source.parentRid, name: table?.name ?? '' },
        },
    })

    const submitting = form.formState.isSubmitting

    async function submit(values: FormOutput) {
        try {
            await DataConnectionSDK.actions.sync.create(source.rid, values)

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
                title='Create a sync'
                steps={STEPS}
                onNext={step => form.trigger(FIELDS[step.id as StepId])}
                onSubmit={form.handleSubmit(submit)}
                submitLabel='Create'
                submitting={submitting}
                footer={<ErrorNotice error={form.formState.errors.root?.message ?? null} />}
                renderStep={step => {
                    switch (step.id as StepId) {
                        case 'name':
                            return (
                                <Form.Field control={form.control} name='name' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Sync name</Form.Label>
                                        <Form.Control>
                                            <Input {...field} autoFocus />
                                        </Form.Control>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )

                        case 'what':
                            return (
                                <Form.Field control={form.control} name='config' render={({ field }) => (
                                    <JSONFieldSchemaRenderer schema={definition.syncConfigSchema} value={field.value} onChange={field.onChange} />
                                )} />
                            )

                        case 'schedule':
                            return (
                                <Form.Field control={form.control} name='schedule' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Schedule</Form.Label>
                                        <Form.Description>Optional five-field cron expression. Leave empty to run manually.</Form.Description>
                                        <Form.Control>
                                            <Input {...field} value={field.value ?? ''} placeholder='0 * * * *' autoFocus />
                                        </Form.Control>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )

                        case 'output':
                            return (
                                <>
                                    <Form.Field control={form.control} name='output.name' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Dataset name</Form.Label>
                                            <Form.Control>
                                                <Input {...field} autoFocus />
                                            </Form.Control>
                                            <Form.Message />
                                        </Form.Item>
                                    )} />

                                    <Form.Field control={form.control} name='output.parentRid' render={({ field }) => (
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
                }}
            />
        </Form.Root>
    )
}
