import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Textarea } from '@quarry/standard-ui/foundations/textarea'
import { cn } from '@quarry/standard-ui/utils/cn'
import { Catalog, CodeWorkspace, Library } from '@quarry/shared/domain'
import { errorMessage } from '@/SDKs/api'
import { ResourceInput } from '@/SDKs/LibrarySDK/ui/ResourceInput'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceIcon } from '@/components/ResourceIcon'
import { resourceRoute } from '@/shell/apps'
import { CodeWorkspaceSDK } from '../sdk'

/** The create request, with the form's messages. */
const Schema = CodeWorkspace.API.Create.Request.extend({
    templateId:      z.string().min(1, 'Choose a template').pipe(CodeWorkspace.Template.Id),
    name:            z.string().trim().min(1, 'Name the workspace').pipe(Library.Resource.Name),
    parentRid:       z.string({ error: 'Choose a project or folder' }).pipe(Library.Resource.Rid),
    description:     z.string().trim().transform(value => value || null),
    exampleInputRid: Catalog.Dataset.Rid.nullable(),
})

type FormInput  = z.input<typeof Schema>
type FormOutput = z.output<typeof Schema>

type StepId = 'template' | 'details' | 'example'

const STEPS: DialogSDK.WizardTemplate.Step[] = [
    { id: 'template', title: 'Template', description: 'What the workspace starts from.' },
    { id: 'details',  title: 'Details',  description: 'Its name, where it lives in the Library, and what it’s for.' },
    { id: 'example',  title: 'Example',  description: 'A first transform that reads a dataset of yours — optional.' },
]

/** What each step asks for — validated before Next leaves it. */
const FIELDS: Record<StepId, (keyof FormInput)[]> = {
    template: ['templateId'],
    details:  ['name', 'parentRid', 'description'],
    example:  ['exampleInputRid'],
}

interface Props {
    /** Where it goes, if known (the Library folder it was started from); chosen in the wizard otherwise. */
    parentRid?: Library.Resource.Rid
    dialog:     DialogSDK.TemplateProps
}

/** A new Code Workspace from a template. Opens it when it's created. */
export function openCreateWorkspaceDialog(args: { parentRid?: Library.Resource.Rid } = {}) {
    DialogSDK.actions.push('create-code-workspace', dialog => (
        <WorkspaceWizard parentRid={args.parentRid} dialog={dialog} />
    ))
}

/** The wizard from the first frame — its templates load inside the first step. */
function WorkspaceWizard({ parentRid, dialog }: Props) {
    const navigate = useNavigate()

    const [templates, [templatesRequest]] = CodeWorkspaceSDK.useWith(
        state => state.templates,
        query => [query.templates],
    )

    const form = useForm<FormInput, unknown, FormOutput>({
        resolver:      zodResolver(Schema),
        defaultValues: {
            templateId:      '',
            name:            '',
            parentRid,
            description:     '',
            exampleInputRid: null,
        },
    })

    const submitting = form.formState.isSubmitting

    async function submit(values: FormOutput) {
        try {
            const workspace = await CodeWorkspaceSDK.actions.workspace.create(values)

            NotificationSDK.toast.success(`Created ${workspace.name}`)
            DialogSDK.actions.pop(dialog.entry.dialogId)

            await navigate(resourceRoute('workspace', workspace.rid))
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <Form.Root {...form}>
            <DialogSDK.WizardTemplate
                {...dialog}
                title='New code workspace'
                steps={STEPS}
                onNext={step => form.trigger(FIELDS[step.id as StepId])}
                onSubmit={form.handleSubmit(submit)}
                submitLabel='Create workspace'
                submitting={submitting}
                footer={<ErrorNotice error={form.formState.errors.root?.message ?? null} />}
                renderStep={step => {
                    switch (step.id as StepId) {
                        case 'template':
                            return (
                                <TemplateStep
                                    templates={templates}
                                    pending={templatesRequest.isPending}
                                    error={templatesRequest.error}
                                    onRetry={() => void templatesRequest.refetch()}
                                />
                            )

                        case 'details':
                            return (
                                <>
                                    <Form.Field control={form.control} name='name' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Name</Form.Label>
                                            <Form.Control>
                                                <Input {...field} autoFocus placeholder='Sales cleaning' />
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

                                    <Form.Field control={form.control} name='description' render={({ field }) => (
                                        <Form.Item>
                                            <Form.Label>Description</Form.Label>
                                            <Form.Control>
                                                <Textarea {...field} value={field.value ?? ''} placeholder='Optional' />
                                            </Form.Control>
                                            <Form.Message />
                                        </Form.Item>
                                    )} />
                                </>
                            )

                        case 'example':
                            return (
                                <Form.Field control={form.control} name='exampleInputRid' render={({ field }) => (
                                    <Form.Item>
                                        <Form.Label>Input dataset</Form.Label>
                                        <Form.Description>
                                            The example transform copies it unchanged into a new dataset beside the workspace,
                                            ready to preview. Without one, the example is commented out.
                                        </Form.Description>
                                        <Form.Control>
                                            <ResourceInput
                                                value={(field.value as Catalog.Dataset.Rid | null | undefined) ?? null}
                                                onChange={dataset => field.onChange(dataset.rid)}
                                                accept='dataset'
                                                placeholder='No example input'
                                            />
                                        </Form.Control>
                                        <Form.Message />
                                    </Form.Item>
                                )} />
                            )
                    }
                }}
            />
        </Form.Root>
    )
}

interface TemplateStepProps {
    templates: CodeWorkspaceSDK.State['templates']
    pending:   boolean
    error:     Error | null
    onRetry:   () => void
}

/** The templates; choosing one is the form's `templateId`. */
function TemplateStep({ templates, pending, error, onRetry }: TemplateStepProps) {
    if (pending)
        return <Spinner className='size-6' role='status' aria-label='Loading templates' />

    if (error) {
        return (
            <>
                <ErrorNotice error={error} />
                <Button className='self-start' onClick={onRetry}>Try again</Button>
            </>
        )
    }

    return (
        <Form.Field name='templateId' render={({ field }) => (
            <Form.Item>
                <div role='radiogroup' aria-label='Template' className='flex flex-col gap-1'>
                    {Object.values(templates).map(template => (
                        <button
                            key={template.id}
                            type='button'
                            role='radio'
                            aria-checked={field.value === template.id}
                            onClick={() => field.onChange(template.id)}
                            className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left',
                                field.value === template.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent/50',
                            )}
                        >
                            <ResourceIcon type='workspace' size='sm' />
                            <span className='flex min-w-0 flex-col'>
                                <span className='text-sm font-medium text-foreground'>{template.displayName}</span>
                                <span className='truncate text-xs text-muted-foreground'>{template.description}</span>
                            </span>
                        </button>
                    ))}
                </div>

                <Form.Message />
            </Form.Item>
        )} />
    )
}
