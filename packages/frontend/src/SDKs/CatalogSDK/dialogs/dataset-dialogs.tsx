import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Catalog, type Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceRoute } from '@/shell/apps'
import { CatalogSDK } from '../sdk'

// The upload's fields (its mode) and the file itself.
const Schema = Catalog.API.Dataset.Upload.Fields.extend({
    file: z.instanceof(File, { error: 'Choose a CSV or Parquet file' }),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

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
    const navigate = useNavigate()

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: { mode: 'snapshot' },
    })

    const submitting = form.formState.isSubmitting

    async function upload({ file, mode }: FormOutput) {
        if (target.kind === 'dataset') {
            const { dataset } = await CatalogSDK.actions.dataset.upload(target.datasetRid, mode, file)

            NotificationSDK.toast.success(`Uploaded ${file.name}`, {
                description: `${dataset.name} is now at version ${dataset.lastSequence}.`,
            })

            return
        }

        const { dataset } = await CatalogSDK.actions.dataset.createFromFile(target.parentRid, file)

        NotificationSDK.toast.success(`Created dataset ${dataset.name}`, { description: `From ${file.name}.` })

        await navigate(resourceRoute('dataset', dataset.rid))
    }

    async function submit(values: FormOutput) {
        try {
            await upload(values)

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
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>{target.kind === 'new' ? 'New dataset from file' : 'Upload file'}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description>
                A CSV or Parquet file, stored as uploaded. Its columns and types are inferred, and CSV parsing
                options are detected.
            </Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(submit)} className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        <fieldset disabled={submitting} className='flex flex-col gap-4'>
                            {/* A file input can't be given a value — it only reports the chosen file. */}
                            <Form.Field control={form.control} name='file' render={({ field: { value: _file, onChange, ...field } }) => (
                                <Form.Item>
                                    <Form.Label>File</Form.Label>
                                    <Form.Control>
                                        <Input
                                            {...field}
                                            type='file'
                                            accept={ACCEPTED_FILES}
                                            onChange={event => onChange(event.target.files?.[0])}
                                        />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            {target.kind === 'dataset' && (
                                <Form.Field control={form.control} name='mode' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Mode</Form.Label>
                                        <Select.Root value={field.value} onValueChange={field.onChange}>
                                            <Form.Control>
                                                <Select.Trigger size='default'>
                                                    <Select.Value />
                                                </Select.Trigger>
                                            </Form.Control>
                                            <Select.Content className='z-[100]'>
                                                <Select.Item value='snapshot'>Snapshot: replace the files and schema</Select.Item>
                                                <Select.Item value='append'>Append: add the file (same columns)</Select.Item>
                                            </Select.Content>
                                        </Select.Root>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )}
                        </fieldset>

                        <ErrorNotice error={form.formState.errors.root?.message ?? null} />
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Dialog.Cancel disabled={submitting}>Cancel</Dialog.Cancel>
                        <Dialog.Action type='submit' intent='primary' loading={submitting}>
                            Upload
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}
