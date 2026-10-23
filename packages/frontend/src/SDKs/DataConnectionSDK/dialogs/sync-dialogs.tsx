import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { useId, useState, type FormEvent } from 'react'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Input } from '@quarry/standard-ui/foundations/input'
import { DataConnection, type Library } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { LocationPicker } from '@/components/LocationPicker'
import { SchemaFields, defaults, type Values } from '@/components/SchemaFields'

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

function NewSyncDialog({ source, definition, table, dialog }: Props) {
    const formId = useId()
    const [task, withTask] = useTask()

    const [name, setName] = useState(table?.name ?? '')
    const [datasetName, setDatasetName] = useState(table?.name ?? '')
    const [parentRid, setParentRid] = useState<Library.Resource.Rid | null>(source.parentRid)
    const [schedule, setSchedule] = useState('')
    const [config, setConfig] = useState<Values>(() => {
        const initial = defaults(definition.syncConfigSchema)

        if (table) {
            initial.kind = 'table'
            initial.schema = table.schema
            initial.table = table.name
        }

        return initial
    })

    const create = async () => {
        const request = DataConnection.API.Sync.Create.Request.parse({
            name,
            config,
            schedule: schedule.trim() || null,
            output: {
                parentRid,
                name: datasetName,
            },
        })

        await DataConnectionSDK.actions.sync.create(source.rid, request)
    }

    const submit = withTask(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (!parentRid)
            return

        await create()

        DialogSDK.actions.pop(dialog.entry.dialogId)
    })

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!task.pending}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>Create a sync</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose create.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='sync-name'>Sync name</Field.Label>
                            <Input
                                id='sync-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>

                        <SchemaFields schema={definition.syncConfigSchema} value={config} onChange={setConfig} />

                        <Field.Root>
                            <Field.Label htmlFor='sync-schedule'>Schedule</Field.Label>
                            <Field.Description>Optional five-field cron expression. Leave empty to run manually.</Field.Description>
                            <Input
                                id='sync-schedule'
                                placeholder='0 * * * *'
                                value={schedule}
                                onChange={event => setSchedule(event.target.value)}
                            />
                        </Field.Root>

                        <div className='form-divider'>OUTPUT DATASET</div>

                        <Field.Root>
                            <Field.Label htmlFor='sync-dataset'>Dataset name</Field.Label>
                            <Input
                                id='sync-dataset'
                                required
                                value={datasetName}
                                onChange={event => setDatasetName(event.target.value)}
                            />
                        </Field.Root>

                        <LocationPicker value={parentRid} onChange={setParentRid} />
                    </Field.Set>
                    <ErrorNotice error={task.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={task.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action
                    type='submit'
                    form={formId}
                    intent='primary'
                    loading={task.pending}
                    disabled={!parentRid}
                >
                    Create
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}
