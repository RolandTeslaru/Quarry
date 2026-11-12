import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertDialog } from '@quarry/standard-ui/foundations/alertDialog'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ErrorNotice } from '@/components/ErrorNotice'
import { LibrarySDK } from '../sdk'

// The rename request, with what the form says when the name is missing.
const RenameSchema = Library.API.Resource.Rename.Request.extend({
    name: z.string().trim().min(1, 'Name it').pipe(Library.Resource.Name),
})

type RenameInput  = z.input<typeof RenameSchema>
type RenameOutput = z.output<typeof RenameSchema>

export function openRenameResourceDialog(resource: Library.Resource.Base) {
    DialogSDK.actions.push(`rename-resource-${resource.rid}`, dialog => (
        <RenameResourceDialog resource={resource} dialog={dialog} />
    ))
}

interface RenameResourceDialogProps {
    resource: Library.Resource.Base
    dialog:   DialogSDK.TemplateProps
}

function RenameResourceDialog({ resource, dialog }: RenameResourceDialogProps) {
    const form = useForm<RenameInput, unknown, RenameOutput>({
        resolver:      zodResolver(RenameSchema),
        defaultValues: { name: resource.name },
    })

    const submitting = form.formState.isSubmitting

    async function submit(values: RenameOutput) {
        try {
            await LibrarySDK.actions.resource.rename(resource, values)

            DialogSDK.actions.pop(dialog.entry.dialogId)
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <DialogSDK.Template {...dialog} dismissible={!submitting} className='w-[min(520px,calc(100vw-32px))]'>
            <Dialog.Header>
                <Dialog.Title>Rename “{resource.name}”</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>Enter a new name, then choose rename.</Dialog.Description>

            <Form.Root {...form}>
                <form onSubmit={form.handleSubmit(submit)} autoComplete='off' className='flex min-h-0 flex-col'>
                    <Dialog.Body>
                        <fieldset disabled={submitting} className='flex flex-col gap-4'>
                            <Form.Field control={form.control} name='name' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Name</Form.Label>
                                    <Form.Control>
                                        <Input {...field} autoFocus onFocus={event => event.currentTarget.select()} />
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
                            Rename
                        </Dialog.Action>
                    </Dialog.Footer>
                </form>
            </Form.Root>
        </DialogSDK.Template>
    )
}

/** Asks before trashing: there's no restoring from the trash yet. */
export function openTrashResourceDialog(resource: Library.Resource.Base) {
    const isContainer = Library.Resource.CONTAINERS.includes(resource.type)

    DialogSDK.actions.push(`trash-resource-${resource.rid}`, dialog => (
        <DialogSDK.AlertTemplate
            {...dialog}
            type='danger'
            className='w-[min(480px,calc(100vw-32px))]'
            approveLabel='Move to trash'
            // The action reports its own failure.
            onApprove={() => void LibrarySDK.actions.resource.trash(resource).catch(() => {})}
        >
            <AlertDialog.Title>Move “{resource.name}” to the trash?</AlertDialog.Title>
            <AlertDialog.Description>
                {isContainer && 'Everything in it goes too. '}
                It disappears from the Library, and it can't be restored here yet.
            </AlertDialog.Description>
        </DialogSDK.AlertTemplate>
    ))
}
