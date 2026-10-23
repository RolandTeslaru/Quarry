import { useTask } from '@/hooks/useTask'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Input } from '@quarry/standard-ui/foundations/input'
import { useNavigate } from '@tanstack/react-router'
import type { Catalog, Library } from '@quarry/shared/domain'
import { CatalogSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceRoute } from '@/shell/apps'

type Mode = Catalog.API.Dataset.Upload.Fields['mode']

/** Where the file goes: a new dataset in a folder, or a new version of an existing dataset. */
type UploadTarget =
    | { kind: 'new'; parentRid: Library.Resource.Rid }
    | { kind: 'dataset'; datasetRid: Catalog.Dataset.Rid }

interface Props {
    target: UploadTarget
    dialog: DialogSDK.TemplateProps
}

const ACCEPTED_FILES = '.csv,.parquet'

/** A new dataset from a CSV or Parquet file, in this folder; opens it when it's created. */
export function openCreateDatasetFromFileDialog(args: { parentRid: Library.Resource.Rid }) {
    DialogSDK.actions.push(`create-dataset-${args.parentRid}`, dialog => (
        <UploadDialog target={{ kind: 'new', parentRid: args.parentRid }} dialog={dialog} />
    ))
}

/** A new version of this dataset from a file: snapshot (replace) or append. */
export function openUploadToDatasetDialog(args: { datasetRid: Catalog.Dataset.Rid }) {
    DialogSDK.actions.push(`upload-${args.datasetRid}`, dialog => (
        <UploadDialog target={{ kind: 'dataset', datasetRid: args.datasetRid }} dialog={dialog} />
    ))
}

function UploadDialog({ target, dialog }: Props) {
    const formId = useId()
    const fileInputId = useId()
    const modeId = useId()
    const [task, withTask] = useTask()
    const navigate = useNavigate()

    const [file, setFile] = useState<File | null>(null)
    const [mode, setMode] = useState<Mode>('snapshot')

    function selectFile(event: ChangeEvent<HTMLInputElement>) {
        setFile(event.target.files?.[0] ?? null)
        task.reset()
    }

    function selectMode(value: string) {
        if (value === 'snapshot' || value === 'append')
            setMode(value)
    }

    const upload = async (selected: File) => {
        if (target.kind === 'dataset') {
            const { dataset } = await CatalogSDK.actions.dataset.upload(target.datasetRid, mode, selected)

            NotificationSDK.toast.success(`Uploaded ${selected.name}`, {
                description: `${dataset.name} is now at version ${dataset.lastSequence}.`,
            })

            return
        }

        const { dataset } = await CatalogSDK.actions.dataset.createFromFile(target.parentRid, selected)

        NotificationSDK.toast.success(`Created dataset ${dataset.name}`, { description: `From ${selected.name}.` })

        await navigate(resourceRoute('dataset', dataset.rid))
    }

    const submit = withTask(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (!file)
            return

        await upload(file)

        DialogSDK.actions.pop(dialog.entry.dialogId)
    })

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!task.pending}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>{target.kind === 'new' ? 'New dataset from file' : 'Upload file'}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description>
                A CSV or Parquet file, stored as uploaded. Its columns and types are inferred, and CSV parsing
                options are detected.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor={fileInputId}>File</Field.Label>
                            <Input
                                id={fileInputId}
                                type='file'
                                accept={ACCEPTED_FILES}
                                required
                                onChange={selectFile}
                            />
                        </Field.Root>

                        {target.kind === 'dataset' && (
                            <ModeField id={modeId} mode={mode} onModeChange={selectMode} />
                        )}
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
                    disabled={!file}
                    loading={task.pending}
                >
                    Upload
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}

interface ModeFieldProps {
    id:           string
    mode:         Mode
    onModeChange: (value: string) => void
}

function ModeField({ id, mode, onModeChange }: ModeFieldProps) {
    return (
        <Field.Root>
            <Field.Label htmlFor={id}>Mode</Field.Label>
            <Select.Root value={mode} onValueChange={onModeChange}>
                <Select.Trigger id={id} size='default'>
                    <Select.Value />
                </Select.Trigger>
                <Select.Content className='z-[100]'>
                    <Select.Item value='snapshot'>Snapshot: replace the files and schema</Select.Item>
                    <Select.Item value='append'>Append: add the file (same columns)</Select.Item>
                </Select.Content>
            </Select.Root>
        </Field.Root>
    )
}
