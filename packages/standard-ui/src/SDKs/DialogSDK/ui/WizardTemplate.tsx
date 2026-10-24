import { useState, type FormEvent } from 'react'
import { DialogSDK } from '../sdk'
import { Button } from '../../../foundations/button'
import { Dialog } from '../../../foundations/dialog'
import { Icon } from '../../../icons'
import { cn } from '../../../utils/cn'
import { useAnimationDelay, SPLIT_SHELL } from './motion'

/**
 * A dialog in steps — for forms with too many fields for one page. The split
 * shell (like TabsTemplate): the steps down the sidebar, the current one's
 * fields beside it, Back / Next — and on the last step, submit. Steps are
 * walked in order; a step already passed can be gone back to.
 *
 * Knows nothing of forms: `onNext` decides whether a step may be left (with
 * react-hook-form, `step => form.trigger(fieldsOf[step.id])`), `onSubmit` runs
 * on the last (`form.handleSubmit(submit)`). Enter advances, like the Next button.
 *
 *   <DialogSDK.WizardTemplate
 *       {...dialog}
 *       title='New credential'
 *       steps={[{ id: 'system', title: 'System' }, { id: 'connection', title: 'Connection' }]}
 *       renderStep={step => …the step's fields…}
 *       onNext={step => form.trigger(FIELDS[step.id])}
 *       onSubmit={form.handleSubmit(submit)}
 *       submitLabel='Create'
 *       submitting={form.formState.isSubmitting}
 *   />
 */
export const WizardTemplate: DialogSDK.WizardTemplate = ({
    title,
    steps,
    renderStep,
    onNext,
    onSubmit,
    submitLabel = 'Done',
    submitting = false,
    footer,
    sidebarClassName,
    contentClassName,
    surfaceStyle,
    entry,
    dialogsSize,
    index,
    className,
    dismissible = true,
}) => {
    const delayStyle = useAnimationDelay(entry.isOpen)
    const scaleOffset = (index - (dialogsSize - 1)) * 8
    const verticalOffset = (index - (dialogsSize - 1)) * 40
    const finalScale = 1 + scaleOffset / 100

    // Not a form value: where in the dialog the user is.
    const [current, setCurrent] = useState(0)
    const [advancing, setAdvancing] = useState(false)

    const step = steps[current]
    const isLast = current === steps.length - 1
    const busy = submitting || advancing
    const closable = dismissible && !busy

    async function next() {
        setAdvancing(true)

        try {
            if (onNext && !(await onNext(step)))
                return

            setCurrent(position => Math.min(position + 1, steps.length - 1))
        }
        finally {
            setAdvancing(false)
        }
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (busy)
            return

        if (isLast)
            void onSubmit()
        else
            void next()
    }

    return (
        <Dialog.Root
            open={entry.isOpen}
            onOpenChange={(open) => {
                if (!open && closable) {
                    DialogSDK.actions.pop(entry.dialogId)
                }
            }}
        >
            <Dialog.Content
                unstyled
                style={{
                    ...delayStyle,
                    transform: `translate(-50%, -50%) translateY(${verticalOffset}px) scale(${finalScale})`,
                }}
                darkenBackground={index === 0}
                className={cn(SPLIT_SHELL, 'h-[min(560px,calc(100vh-64px))]', className)}
                onInteractOutside={closable ? undefined : (e) => e.preventDefault()}
                onEscapeKeyDown={closable ? undefined : (e) => e.preventDefault()}
            >
                <div
                    className={cn(
                        'surface-elevated-sidebar flex w-56 shrink-0 flex-col gap-1 rounded-l-2xl border border-r-separator px-3 pt-5 pb-4',
                        sidebarClassName,
                    )}
                    style={{ ...surfaceStyle, ...delayStyle }}
                >
                    <Dialog.Title className='px-2 pb-3 text-sm font-semibold'>{title}</Dialog.Title>

                    <ol className='flex flex-col gap-1'>
                        {steps.map((item, position) => {
                            const done = position < current
                            const active = position === current

                            return (
                                <li key={item.id}>
                                    <button
                                        type='button'
                                        // Only back: a step ahead opens through Next, which validates.
                                        disabled={!done || busy}
                                        onClick={() => setCurrent(position)}
                                        aria-current={active ? 'step' : undefined}
                                        className={cn(
                                            'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm',
                                            active && 'bg-accent font-medium text-foreground',
                                            done && 'cursor-pointer text-foreground hover:bg-accent/50',
                                            !done && !active && 'text-muted-foreground',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold',
                                                active && 'border-primary bg-primary text-primary-foreground',
                                                done && 'border-primary text-primary',
                                            )}
                                        >
                                            {done ? <Icon name='tick' size={10} /> : position + 1}
                                        </span>
                                        <span className='min-w-0 truncate'>{item.title}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ol>
                </div>

                <form
                    noValidate
                    autoComplete='off'
                    onSubmit={handleSubmit}
                    className={cn(
                        'surface-elevated relative flex w-[480px] shrink-0 flex-col rounded-r-2xl border-y border-r',
                        contentClassName,
                    )}
                    style={{ ...surfaceStyle, ...delayStyle }}
                >
                    <div className='flex shrink-0 flex-col gap-1 border-b border-separator px-5 pt-5 pb-4'>
                        <h3 className='text-base font-semibold text-foreground'>{step.title}</h3>
                        {step.description
                            ? <Dialog.Description className='text-sm text-muted-foreground'>{step.description}</Dialog.Description>
                            : <Dialog.Description className='sr-only'>{`${title}: ${step.title}`}</Dialog.Description>}
                    </div>

                    <fieldset disabled={busy} className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-4'>
                        {renderStep(step, current)}
                    </fieldset>

                    {footer && <div className='shrink-0 px-5'>{footer}</div>}

                    <div className='flex shrink-0 items-center gap-2 border-t px-5 py-3'>
                        <Dialog.Cancel disabled={!closable}>Cancel</Dialog.Cancel>
                        <div className='ml-auto flex items-center gap-2'>
                            {current > 0 && (
                                <Button type='button' variant='outlined' disabled={busy} onClick={() => setCurrent(position => position - 1)}>
                                    Back
                                </Button>
                            )}
                            <Button type='submit' intent='primary' loading={isLast ? submitting : advancing}>
                                {isLast ? submitLabel : 'Next'}
                            </Button>
                        </div>
                    </div>
                </form>
            </Dialog.Content>
        </Dialog.Root>
    )
}
