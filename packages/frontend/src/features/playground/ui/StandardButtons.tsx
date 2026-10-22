import { useState } from 'react'
import { Button, type ButtonIntent, type ButtonVariant } from '@quarry/standard-ui/foundations/button'
import { Icon } from '@quarry/standard-ui/icons'
import './button-gallery.css'

interface VariantExample {
    variant: ButtonVariant
    label: string
}

interface IntentExample {
    intent: ButtonIntent
    label: string
}

const variants: VariantExample[] = [
    { variant: 'solid', label: 'Solid' },
    { variant: 'neon', label: 'Neon' },
    { variant: 'outlined', label: 'Outlined' },
    { variant: 'minimal', label: 'Minimal' },
]

const intents: IntentExample[] = [
    { intent: 'none', label: 'None' },
    { intent: 'primary', label: 'Primary' },
    { intent: 'success', label: 'Success' },
    { intent: 'warning', label: 'Warning' },
    { intent: 'danger', label: 'Danger' },
]

const additionalIntents: IntentExample[] = [
    { intent: 'accent', label: 'Accent' },
    { intent: 'active', label: 'Active' },
    { intent: 'ai', label: 'AI' },
    { intent: 'message', label: 'Message' },
]

export function StandardButtons() {
    const [active, setActive] = useState(true)
    const [loading, setLoading] = useState(false)
    const [action, setAction] = useState('')

    return (
        <div className='button-gallery'>
            <p className='demo-note'>Defaults: solid variant · none intent · default size.</p>

            {variants.map(({ variant, label }) => (
                <section key={variant} className='button-family' aria-label={`${label} buttons`}>
                    <h4>{label}</h4>
                    <div className='button-intents'>
                        {intents.map(({ intent, label: intentLabel }) => (
                            <Button key={intent} variant={variant} intent={intent}>
                                {intentLabel}
                            </Button>
                        ))}
                    </div>
                </section>
            ))}

            <section className='button-family' aria-label='Button sizes'>
                <h4>Sizes</h4>
                <div className='demo-line'>
                    <Button size='xs'>Extra small</Button>
                    <Button>Default</Button>
                    <Button size='lg'>Large</Button>
                </div>
            </section>

            <section className='button-family' aria-label='Button states'>
                <h4>States</h4>
                <div className='demo-line'>
                    <Button>Resting</Button>
                    <Button active={active} onClick={() => setActive(!active)}>
                        Active
                    </Button>
                    <Button disabled>Disabled</Button>
                    <Button loading aria-label='Loading button'>
                        Loading
                    </Button>
                </div>
            </section>

            <section className='button-family' aria-label='Button icons'>
                <h4>Icons</h4>
                <div className='demo-line'>
                    <Button icon='refresh' intent='primary' onClick={() => setAction('Sync selected')}>
                        Sync dataset
                    </Button>
                    <Button endIcon='arrow-right' onClick={() => setAction('Continue selected')}>
                        Continue
                    </Button>
                    <Button icon='cog' aria-label='Settings' onClick={() => setAction('Settings selected')} />
                </div>
            </section>

            <section className='button-family' aria-label='Additional color intents'>
                <h4>Your additional colors</h4>
                <div className='demo-line'>
                    {additionalIntents.map(({ intent, label }) => (
                        <Button key={intent} intent={intent}>
                            {label}
                        </Button>
                    ))}
                </div>
            </section>

            <section className='button-family' aria-label='Minimal shorthand and custom icons'>
                <h4>Minimal shorthand &amp; custom icons</h4>
                <div className='demo-line'>
                    <Button minimal intent='danger' icon='trash' onClick={() => setAction('Delete selected')}>
                        Delete
                    </Button>
                    <Button icon={<Icon name='add' />} intent='primary' onClick={() => setAction('Create selected')}>
                        Create
                    </Button>
                    <Button icon='database' endIcon='chevron-down' onClick={() => setAction('Datasets selected')}>
                        Datasets
                    </Button>
                </div>
            </section>

            <section className='button-family' aria-label='Loading and composed buttons'>
                <h4>Loading &amp; composition</h4>
                <div className='demo-line'>
                    <Button minimal onClick={() => setLoading(!loading)}>
                        {loading ? 'Stop loading' : 'Start loading'}
                    </Button>
                    <Button asChild icon='arrow-right' loading={loading}>
                        <a href='#buttons' onClick={() => setAction('Link selected')}>
                            Composed link
                        </a>
                    </Button>
                </div>
                <p className='demo-note' role='status'>
                    {action || 'Try an action above.'}
                </p>
            </section>
        </div>
    )
}
