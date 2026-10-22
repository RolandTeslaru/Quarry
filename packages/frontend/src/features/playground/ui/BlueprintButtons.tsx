import { Button, type ButtonVariant, type Intent } from '@blueprintjs/core'
import './button-gallery.css'

interface VariantExample {
    variant: ButtonVariant
    label: string
}

interface IntentExample {
    intent: Intent
    label: string
}

const variants: VariantExample[] = [
    { variant: 'solid', label: 'Solid' },
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

export function BlueprintButtons() {
    return (
        <div className='button-gallery'>
            <p className='demo-note'>Defaults: solid variant · none intent · medium size.</p>

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
                    <Button size='small'>Small</Button>
                    <Button size='medium'>Medium (default)</Button>
                    <Button size='large'>Large</Button>
                </div>
            </section>

            <section className='button-family' aria-label='Button states'>
                <h4>States</h4>
                <div className='demo-line'>
                    <Button>Resting</Button>
                    <Button active>Active</Button>
                    <Button disabled>Disabled</Button>
                    <Button loading aria-label='Loading button'>
                        Loading
                    </Button>
                </div>
            </section>

            <section className='button-family' aria-label='Button icons'>
                <h4>Icons</h4>
                <div className='demo-line'>
                    <Button icon='refresh' intent='primary'>
                        Sync dataset
                    </Button>
                    <Button endIcon='arrow-right'>Continue</Button>
                    <Button icon='cog' aria-label='Settings' />
                </div>
            </section>
        </div>
    )
}
