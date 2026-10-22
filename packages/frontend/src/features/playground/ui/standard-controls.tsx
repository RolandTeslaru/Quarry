import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@quarry/standard-ui/foundations/button'
import { ButtonGroup } from '@quarry/standard-ui/foundations/button-group'
import { Input } from '@quarry/standard-ui/foundations/input'
import { SearchInput } from '@quarry/standard-ui/foundations/searchInput'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@quarry/standard-ui/foundations/input-group'
import { Textarea } from '@quarry/standard-ui/foundations/textarea'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Checkbox } from '@quarry/standard-ui/foundations/checkbox'
import { Switch } from '@quarry/standard-ui/foundations/switch'
import { RadioGroup, RadioGroupItem } from '@quarry/standard-ui/foundations/radio-group'
import { Slider } from '@quarry/standard-ui/foundations/slider'
import { DualRangeSlider } from '@quarry/standard-ui/foundations/dualRangeSlider'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Label } from '@quarry/standard-ui/foundations/label'
import { Form } from '@quarry/standard-ui/foundations/form'
import { StandardButtons } from './StandardButtons'
import { StandardNestedSelect } from './StandardNestedSelect'

function Inputs() {
    return (
        <div className='demo-stack'>
            <Input aria-label='Dataset name' placeholder='Dataset name' />
            <Input aria-label='Filled input' defaultValue='Customer transactions' />
            <Input aria-label='Disabled input' disabled placeholder='Disabled input' />
        </div>
    )
}

function Search() {
    const [value, setValue] = useState('')

    return (
        <div className='demo-stack'>
            <SearchInput aria-label='Search datasets' onSearch={setValue} placeholder='Search datasets…' />
            <p className='demo-note'>
                {value ? `Searching for “${value}”` : 'Type to search. Search updates after a short delay.'}
            </p>
        </div>
    )
}

function SelectExample() {
    return (
        <div className='select-examples'>
            <section className='select-example'>
                <h4>Flat select</h4>
                <Select.Root defaultValue='production'>
                    <Select.Trigger className='w-60' aria-label='Environment'>
                        <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value='production'>Production</Select.Item>
                        <Select.Item value='staging'>Staging</Select.Item>
                        <Select.Item value='development'>Development</Select.Item>
                    </Select.Content>
                </Select.Root>
            </section>
            <section className='select-example'>
                <h4>Deeply nested select · four levels</h4>
                <StandardNestedSelect />
            </section>
        </div>
    )
}

function Checkboxes() {
    return (
        <div className='demo-stack'>
            <label className='demo-line'>
                <Checkbox defaultChecked /> Include archived datasets
            </label>
            <label className='demo-line'>
                <Checkbox /> Notify on completion
            </label>
            <label className='demo-line'>
                <Checkbox disabled /> Disabled option
            </label>
        </div>
    )
}

function Switches() {
    return (
        <div className='demo-stack'>
            <label className='demo-line'>
                <Switch defaultChecked size='md' /> Scheduled sync
            </label>
            <label className='demo-line'>
                <Switch size='md' /> Automatic retries
            </label>
            <label className='demo-line'>
                <Switch disabled size='md' /> Disabled option
            </label>
        </div>
    )
}

function Radios() {
    return (
        <RadioGroup defaultValue='incremental' aria-label='Sync mode'>
            <label className='demo-line'>
                <RadioGroupItem value='incremental' /> Incremental sync
            </label>
            <label className='demo-line'>
                <RadioGroupItem value='snapshot' /> Full snapshot
            </label>
            <label className='demo-line'>
                <RadioGroupItem value='disabled' disabled /> Disabled option
            </label>
        </RadioGroup>
    )
}

function SliderExample() {
    const [value, setValue] = useState([40])

    return (
        <div className='demo-stack'>
            <Slider value={value} onValueChange={setValue} variant='primary' aria-label='Batch size' />
            <p className='demo-note'>Batch size: {value[0]}</p>
        </div>
    )
}

function RangeExample() {
    const [value, setValue] = useState([20, 80])

    return (
        <div className='demo-stack'>
            <DualRangeSlider value={value} onValueChange={setValue} aria-label='Date window' />
            <p className='demo-note'>Window: {value.join(' – ')}</p>
        </div>
    )
}

function FieldExample() {
    return (
        <Field.Root>
            <Field.Label htmlFor='standard-field'>Dataset name</Field.Label>
            <Input id='standard-field' defaultValue='Customer transactions' />
            <Field.Description>A unique name within this project.</Field.Description>
            <Field.Error>Choose a name that is not already in use.</Field.Error>
        </Field.Root>
    )
}

function FormExample() {
    const form = useForm({ defaultValues: { name: '' } })
    const [saved, setSaved] = useState(false)

    function submit() {
        setSaved(true)
    }

    function invalid() {
        setSaved(false)
    }

    return (
        <Form.Root {...form}>
            <form onSubmit={form.handleSubmit(submit, invalid)} className='demo-stack'>
                <Form.Field
                    control={form.control}
                    name='name'
                    rules={{ validate: (value) => value.trim().length > 0 || 'Enter a dataset name.' }}
                    render={({ field }) => (
                        <Form.Item>
                            <Form.Label>Dataset name</Form.Label>
                            <Form.Control>
                                <Input {...field} placeholder='Try submitting an empty name' />
                            </Form.Control>
                            <Form.Message />
                        </Form.Item>
                    )}
                />
                <div className='demo-line'>
                    <Button type='submit' intent='primary'>
                        Create dataset
                    </Button>
                    {saved && <Label>Created locally</Label>}
                </div>
            </form>
        </Form.Root>
    )
}

export const standardControls = {
    buttons: StandardButtons,
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
        <InputGroup className='max-w-80'>
            <InputGroupAddon>https://</InputGroupAddon>
            <InputGroupInput aria-label='Source host' placeholder='warehouse.example.com' />
        </InputGroup>
    ),
    textarea: () => (
        <Textarea aria-label='Dataset description' placeholder='Describe this dataset…' className='max-w-80' />
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
