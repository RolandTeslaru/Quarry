import { useState } from 'react'
import { Button } from '@blueprintjs/core'
import type { Keychain } from '@quarry/shared/domain'
import { KeychainSDK } from '../sdk'
import { CreateDialog } from '@/components/CreateDialog'
import { ErrorNotice } from '@/components/ErrorNotice'
import { SchemaFields, type Values } from '@/components/SchemaFields'
import { useTask } from '@/hooks/useTask'

interface Props {
    credential: Keychain.Credential.Schema
    template:   Keychain.Credential.Template.Schema
    onClose:    () => void
}

export function CredentialEditor({ credential, template, onClose }: Props) {
    const [values, setValues] = useState<Values | null>(null)

    const task = useTask()

    const reveal = () => task.run(async () => {
        const result = await KeychainSDK.actions.credential.reveal(credential.rid)

        setValues(result.values)
    })

    const save = async () => {
        if (!values)
            return

        await KeychainSDK.actions.credential.update(credential.rid, values)
    }

    return (
        <CreateDialog
            title={`Edit ${credential.name}`}
            submitLabel='Save values'
            onClose={onClose}
            onSubmit={save}
            disabled={!values}
        >
            {values ? (
                <SchemaFields schema={template.fieldsSchema} value={values} onChange={setValues} />
            ) : (
                <>
                    <p>Load this credential’s values to edit them. This requires write access and is logged.</p>
                    <Button icon='unlock' loading={task.pending} onClick={() => void reveal()}>
                        Load values
                    </Button>
                </>
            )}

            <ErrorNotice error={task.error} />
        </CreateDialog>
    )
}
