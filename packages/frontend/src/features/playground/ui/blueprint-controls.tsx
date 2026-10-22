import { useState, type FormEvent } from 'react'
import {
    Button,
    ButtonGroup,
    Checkbox,
    FormGroup,
    InputGroup,
    MenuItem,
    Radio,
    RadioGroup,
    RangeSlider,
    Slider,
    Switch,
    TextArea,
} from '@blueprintjs/core'
import { Select } from '@blueprintjs/select'
import { BlueprintButtons } from './BlueprintButtons'
import { BlueprintNestedSelect } from './BlueprintNestedSelect'

function Inputs() {
    return (
        <div className='demo-stack'>
            <InputGroup aria-label='Dataset name' placeholder='Dataset name' />
            <InputGroup aria-label='Filled input' defaultValue='Customer transactions' />
            <InputGroup aria-label='Disabled input' disabled placeholder='Disabled input' />
        </div>
    )
}

function Search() {
    const [value, setValue] = useState('')

    return (
        <div className='demo-stack'>
            <InputGroup
                type='search'
                leftIcon='search'
                aria-label='Search datasets'
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder='Search datasets…'
                rightElement={
                    value ? (
                        <Button variant='minimal' icon='cross' aria-label='Clear search' onClick={() => setValue('')} />
                    ) : undefined
                }
            />
            <p className='demo-note'>
                {value ? `Searching for “${value}”` : 'Type to search. Clear with the × button.'}
            </p>
        </div>
    )
}

function SelectExample() {
    const [value, setValue] = useState('Production')

    return (
        <div className='select-examples'>
            <section className='select-example'>
                <h4>Flat select</h4>
                <Select<string>
                    className='blueprint-select-example'
                    items={['Production', 'Staging', 'Development']}
                    filterable={false}
                    onItemSelect={setValue}
                    itemRenderer={(item, { handleClick, modifiers }) => (
                        <MenuItem
                            key={item}
                            text={item}
                            onClick={handleClick}
                            active={modifiers.active}
                            roleStructure='listoption'
                            selected={item === value}
                        />
                    )}
                >
                    <Button text={value} endIcon='double-caret-vertical' aria-label='Environment' />
                </Select>
            </section>
            <section className='select-example'>
                <h4>Deeply nested select · four levels</h4>
                <BlueprintNestedSelect />
            </section>
        </div>
    )
}

function Checkboxes() {
    return (
        <div className='demo-stack'>
            <Checkbox defaultChecked label='Include archived datasets' />
            <Checkbox label='Notify on completion' />
            <Checkbox disabled label='Disabled option' />
        </div>
    )
}

function Switches() {
    return (
        <div className='demo-stack'>
            <Switch defaultChecked label='Scheduled sync' />
            <Switch label='Automatic retries' />
            <Switch disabled label='Disabled option' />
        </div>
    )
}

function Radios() {
    const [value, setValue] = useState('incremental')

    return (
        <RadioGroup
            selectedValue={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            aria-label='Sync mode'
        >
            <Radio value='incremental' label='Incremental sync' />
            <Radio value='snapshot' label='Full snapshot' />
            <Radio value='disabled' label='Disabled option' disabled />
        </RadioGroup>
    )
}

function SliderExample() {
    const [value, setValue] = useState(40)

    return (
        <div className='demo-stack'>
            <Slider value={value} onChange={setValue} min={0} max={100} labelRenderer={false} />
            <p className='demo-note'>Batch size: {value}</p>
        </div>
    )
}

function RangeExample() {
    const [value, setValue] = useState<[number, number]>([20, 80])

    return (
        <div className='demo-stack'>
            <RangeSlider value={value} onChange={setValue} min={0} max={100} labelRenderer={false} />
            <p className='demo-note'>Window: {value.join(' – ')}</p>
        </div>
    )
}

function FieldExample() {
    return (
        <div className='demo-stack'>
            <FormGroup
                label='Dataset name'
                labelFor='blueprint-field'
                intent='danger'
                helperText='Choose a name that is not already in use.'
            >
                <InputGroup id='blueprint-field' defaultValue='Customer transactions' intent='danger' />
            </FormGroup>
            <p className='demo-note'>A unique name within this project.</p>
        </div>
    )
}

function FormExample() {
    const [name, setName] = useState('')
    const [error, setError] = useState(false)
    const [saved, setSaved] = useState(false)

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(name.trim().length === 0)
        setSaved(name.trim().length > 0)
    }

    return (
        <form onSubmit={submit} className='demo-stack'>
            <FormGroup
                label='Dataset name'
                labelFor='blueprint-form-name'
                intent={error ? 'danger' : undefined}
                helperText={error ? 'Enter a dataset name.' : undefined}
            >
                <InputGroup
                    id='blueprint-form-name'
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder='Try submitting an empty name'
                    intent={error ? 'danger' : undefined}
                />
            </FormGroup>
            <div className='demo-line'>
                <Button type='submit' intent='primary'>
                    Create dataset
                </Button>
                {saved && <span>Created locally</span>}
            </div>
        </form>
    )
}

export const blueprintControls = {
    buttons: BlueprintButtons,
    'button-group': () => (
        <ButtonGroup>
            <Button>Overview</Button>
            <Button>Schema</Button>
            <Button>History</Button>
        </ButtonGroup>
    ),
    input: Inputs,
    search: Search,
    'input-group': () => (
        <InputGroup
            aria-label='Source host'
            placeholder='warehouse.example.com'
            leftElement={<span className='bp6-tag bp6-minimal'>https://</span>}
            style={{ maxWidth: 320 }}
        />
    ),
    textarea: () => (
        <TextArea
            aria-label='Dataset description'
            placeholder='Describe this dataset…'
            rows={3}
            style={{ width: 320, maxWidth: '100%' }}
        />
    ),
    select: SelectExample,
    checkbox: Checkboxes,
    switch: Switches,
    radio: Radios,
    slider: SliderExample,
    range: RangeExample,
    field: FieldExample,
    form: FormExample,
}
