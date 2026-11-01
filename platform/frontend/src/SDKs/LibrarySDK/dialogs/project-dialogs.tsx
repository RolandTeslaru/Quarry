import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ErrorNotice } from '@/components/ErrorNotice'
import { LibrarySDK } from '../sdk'

// The create request, with what the form says when a field is missing; an empty description is none.
const Schema = Library.API.Project.Create.Request.extend({
    name:        z.string().trim().min(1, 'Name the project').pipe(Library.Resource.Name),
    description: z.string().trim().transform(value => value || null),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

/** A new project — a root of the Library (workspace admins only: RLS refuses others). */
export function openCreateProjectDialog() {
    DialogSDK.actions.push('create-project', dialog => <NewProjectDialog dialog={dialog} />)
}

interface DialogProps {
    dialog: DialogSDK.TemplateProps
}

function NewProjectDialog({ dialog }: DialogProps) {
    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: { name: '', description: '' },
    })

    const submitting = form.formState.isSubmitting

    async function submit(values: FormOutput) {
        try {
            await LibrarySDK.actions.project.create(values)

            DialogSDK.actions.pop(dialog.entry.dialogId)
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <DialogSDK.Template {...dialog} dismissible={!submitting} className='w-[min(520px,calc(100vw-32px))]'>
            <Dialog.Header>
                <Dialog.Title>New project</Dialog.Title>
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

                            <Form.Field control={form.control} name='description' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Description</Form.Label>
                                    <Form.Control>
                                        <Input {...field} value={field.value ?? ''} placeholder='Optional' />
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
