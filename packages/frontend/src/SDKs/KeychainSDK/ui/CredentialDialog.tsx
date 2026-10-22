import { useState } from 'react'
import { FormGroup, HTMLSelect, InputGroup } from '@blueprintjs/core'
import type { Keychain, Library } from '@quarry/shared/domain'
import { KeychainSDK } from '../sdk'
import { CreateDialog } from '@/components/CreateDialog'
import { LocationPicker } from '@/components/LocationPicker'
import { SchemaFields, defaults, type Values } from '@/components/SchemaFields'

interface Props {
    templates: Keychain.Credential.Template.Schema[]
    onClose:   () => void
}

export function CredentialDialog({ templates, onClose }: Props) {
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

    return (
        <CreateDialog
            title='New credential'
            onClose={onClose}
            onSubmit={create}
            disabled={!parentRid}
        >
            <FormGroup label='System' labelFor='credential-system'>
                <HTMLSelect
                    id='credential-system'
                    fill
                    value={templateId}
                    options={templates.map(item => ({ value: item.id, label: item.displayName }))}
                    onChange={event => selectTemplate(event.target.value)}
                />
            </FormGroup>

            <FormGroup label='Name' labelFor='credential-name'>
                <InputGroup
                    id='credential-name'
                    autoFocus
                    required
                    value={name}
                    onChange={event => setName(event.target.value)}
                />
            </FormGroup>

            <LocationPicker value={parentRid} onChange={setParentRid} />

            <div className='form-divider'>CONNECTION DETAILS</div>

            <SchemaFields
                key={template.id}
                schema={template.fieldsSchema}
                value={values}
                onChange={setValues}
            />
        </CreateDialog>
    )
}
