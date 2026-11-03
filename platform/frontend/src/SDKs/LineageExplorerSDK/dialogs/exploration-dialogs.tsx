import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Library, LineageExplorer } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceRoute } from '@/routes/shell.layout/components/apps'
import { LineageExplorerSDK } from '../sdk'

// The create request, with what the form says when something's missing.
const Schema = LineageExplorer.API.Exploration.Create.Request.extend({
    name:      z.string().trim().min(1, 'Name the exploration').pipe(Library.Resource.Name),
    parentRid: z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

/** A new, empty exploration. Opens it when it's created. */
export function openCreateExplorationDialog(args: { parentRid?: Library.Resource.Rid } = {}) {
    DialogSDK.actions.push('create-exploration', dialog => (
        <NewExplorationDialog parentRid={args.parentRid} dialog={dialog} />
    ))
}

interface NewExplorationDialogProps {
    /** Where it goes, if known (the Library folder it was started from); chosen here otherwise. */
    parentRid?: Library.Resource.Rid
    dialog:     DialogSDK.TemplateProps
}

function NewExplorationDialog({ parentRid, dialog }: NewExplorationDialogProps) {
    const navigate = useNavigate()

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: { parentRid, name: '' },
    })

    const submitting = form.formState.isSubmitting

    async function submit(values: FormOutput) {
        try {
            const exploration = await LineageExplorerSDK.actions.exploration.create(values)

            DialogSDK.actions.pop(dialog.entry.dialogId)

            await navigate(resourceRoute('lineage-exploration', exploration.rid))
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <DialogSDK.Template {...dialog} dismissible={!submitting} className='w-[min(520px,calc(100vw-32px))]'>
            <Dialog.Header>
                <Dialog.Title>New exploration</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>Complete the fields below, then choose create.</Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(submit)} autoComplete='off' className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        <fieldset disabled={submitting} className='flex flex-col gap-4'>
                            <Form.Field control={form.control} name='name' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Name</Form.Label>
                                    <Form.Control>
                                        <Input {...field} autoFocus />
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
                                            onChange={folder => field.onChange(folder.rid)}
                                            accept={['project', 'folder']}
                                            placeholder='Choose a project or folder'
                                        />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />
                        </fieldset>

                        <ErrorNotice error={form.formState.errors.root?.message ?? null} />
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Dialog.Cancel disabled={submitting}>Cancel</Dialog.Cancel>
                        <Dialog.Action type='submit' intent='primary' loading={submitting}>
                            Create
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}
