import { useState } from 'react'
import { FormGroup, InputGroup } from '@blueprintjs/core'
import { DataConnection, type Library } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { CreateDialog } from '@/components/CreateDialog'
import { LocationPicker } from '@/components/LocationPicker'
import { SchemaFields, defaults, type Values } from '@/components/SchemaFields'

interface Props {
    source:     DataConnection.Source.Schema
    definition: DataConnection.Source.Definition.Schema
    table?:     DataConnection.Source.Table
    onClose:    () => void
}

export function NewSyncDialog({ source, definition, table, onClose }: Props) {
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

    return (
        <CreateDialog title='Create a sync' onClose={onClose} onSubmit={create} disabled={!parentRid}>
            <FormGroup label='Sync name' labelFor='sync-name'>
                <InputGroup
                    id='sync-name'
                    autoFocus
                    required
                    value={name}
                    onChange={event => setName(event.target.value)}
                />
            </FormGroup>

            <SchemaFields schema={definition.syncConfigSchema} value={config} onChange={setConfig} />

            <FormGroup
                label='Schedule'
                labelFor='sync-schedule'
                helperText='Optional five-field cron expression. Leave empty to run manually.'
            >
                <InputGroup
                    id='sync-schedule'
                    placeholder='0 * * * *'
                    value={schedule}
                    onChange={event => setSchedule(event.target.value)}
                />
            </FormGroup>

            <div className='form-divider'>OUTPUT DATASET</div>

            <FormGroup label='Dataset name' labelFor='sync-dataset'>
                <InputGroup
                    id='sync-dataset'
                    required
                    value={datasetName}
                    onChange={event => setDatasetName(event.target.value)}
                />
            </FormGroup>

            <LocationPicker value={parentRid} onChange={setParentRid} />
        </CreateDialog>
    )
}
