import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { useId, useState, type FormEvent } from 'react'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Input } from '@quarry/standard-ui/foundations/input'
import type { Keychain, Library } from '@quarry/shared/domain'
import { KeychainSDK } from '../sdk'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { LocationPicker } from '@/components/LocationPicker'
import { SchemaFields, defaults, type Values } from '@/components/SchemaFields'

interface Props {
    templates: Keychain.Credential.Template.Schema[]
    dialog:    DialogSDK.TemplateProps
}

export function CredentialDialog({ templates, dialog }: Props) {
    const formId = useId()
    const task = useTask()

    const [templateId, setTemplateId] = useState(templates[0].id)
    const [name, setName] = useState('')
    const [parentRid, setParentRid] = useState<Library.Resource.Rid | null>(null)
    const [values, setValues] = useState<Values>(() => defaults(templates[0].fieldsSchema))

    const template = templates.find(item => item.id === templateId) ?? templates[0]

    const selectTemplate = (id: string) => {
        const nextTemplate = templates.find(item => item.id === id)

        if (!nextTemplate)
            return

        setTemplateId(id)
        setValues(defaults(nextTemplate.fieldsSchema))
    }

    const create = async () => {
        if (!parentRid)
            throw new Error('Choose a project or folder for this credential.')

        await KeychainSDK.actions.credential.create({
            name,
            description: null,
            parentRid,
            templateId,
            values,
        })
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (task.pending || !parentRid)
            return

        void task.run(async () => {
            await create()

            DialogSDK.actions.pop(dialog.entry.dialogId)
        })
    }

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!task.pending}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>New credential</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose create.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='credential-system'>System</Field.Label>
                            <Select.Root value={templateId} onValueChange={selectTemplate}>
                                <Select.Trigger id='credential-system' size='default'>
                                    <Select.Value />
                                </Select.Trigger>
                                <Select.Content className='z-[100]'>
                                    {templates.map(item => (
                                        <Select.Item key={item.id} value={item.id}>{item.displayName}</Select.Item>
                                    ))}
                                </Select.Content>
                            </Select.Root>
                        </Field.Root>

                        <Field.Root>
                            <Field.Label htmlFor='credential-name'>Name</Field.Label>
                            <Input
                                id='credential-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>

                        <LocationPicker value={parentRid} onChange={setParentRid} />

                        <div className='form-divider'>CONNECTION DETAILS</div>

                        <SchemaFields
                            key={template.id}
                            schema={template.fieldsSchema}
                            value={values}
                            onChange={setValues}
                        />
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
