import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Callout } from '@quarry/standard-ui/foundations/callout'
import { Card } from '@quarry/standard-ui/foundations/card'
import { Form } from '@quarry/standard-ui/foundations/form'
import { Input } from '@quarry/standard-ui/foundations/input'
import { errorMessage } from '@/SDKs/api'
import { AuthSDK } from '../sdk'
import { useTask } from '@/hooks/useTask'
import { ErrorNotice } from '@/components/ErrorNotice'

const Schema = z.object({
    email:    z.email('Enter your email address'),
    password: z.string().min(6, 'At least 6 characters'),
})

type Values = z.infer<typeof Schema>

export function AuthenticationPanel() {
    // Not form values: which form this is, and whether a sign-up now awaits its confirmation email.
    const [isSignup, setIsSignup] = useState(false)
    const [confirmation, setConfirmation] = useState(false)

    const hasSession = AuthSDK.useStore(state => state.hasSession)
    const accessError = AuthSDK.useStore(state => state.error)

    const form = useForm<Values>({
        resolver:      zodResolver(Schema),
        defaultValues: { email: '', password: '' },
    })

    const submitting = form.formState.isSubmitting

    // Signing out of a session without workspace access — a button, not the form.
    const [task, withTask] = useTask()

    async function submit(credentials: Values) {
        setConfirmation(false)

        try {
            if (isSignup) {
                const hasSession = await AuthSDK.actions.signup(credentials)

                setConfirmation(!hasSession)

                return
            }

            await AuthSDK.actions.login(credentials)
        }
        catch (error) {
            form.setError('root', { message: errorMessage(error) })
        }
    }

    return (
        <main className='auth-page'>
            <div className='auth-intro'>
                <div className='flex items-center gap-3'>
                    <div className='brand-mark'>Q</div>
                    <span className='text-xl font-semibold'>Quarry</span>
                </div>

                <h1>
                    Your data.
                    <br />
                    One workspace.
                </h1>
                <p>Connect your systems. Bring their data together. Build from a shared foundation.</p>
                <div className='auth-caption'>SELF-HOSTED DATA PLATFORM</div>
            </div>

            <Card.Root className='auth-card bg-transparent shadow-none ring-0 gap-0 p-6'>
                <div className='eyebrow'>QUARRY WORKSPACE</div>
                <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
                <p className='text-slate-500'>Sign in to explore your data and manage connections.</p>

                {hasSession ? (
                    <>
                        <Callout intent='warning' title='Workspace access required'>
                            {accessError ?? 'Your account is not a member of this workspace.'}
                        </Callout>

                        <p className='text-sm text-slate-500 mt-3'>
                            For a new workspace, use the bootstrap administrator email configured on the server.
                        </p>

                        <div className='flex gap-2 mt-4'>
                            <Button onClick={() => void AuthSDK.actions.syncUser()}>
                                Check access again
                            </Button>
                            <Button onClick={withTask(AuthSDK.actions.logout)}>
                                Sign out
                            </Button>
                        </div>
                    </>
                ) : (
                    <Form.Root {...form}>
                        <form onSubmit={form.handleSubmit(submit)} className='mt-6 flex flex-col gap-4'>
                            <Form.Field control={form.control} name='email' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Email</Form.Label>
                                    <Form.Control>
                                        <Input {...field} type='email' autoComplete='email' />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            <Form.Field control={form.control} name='password' render={({ field }) => (
                                <Form.Item>
                                    <Form.Label>Password</Form.Label>
                                    <Form.Control>
                                        <Input {...field} type='password' autoComplete={isSignup ? 'new-password' : 'current-password'} />
                                    </Form.Control>
                                    <Form.Message />
                                </Form.Item>
                            )} />

                            {confirmation && (
                                <Callout intent='success'>Check your email to confirm your account.</Callout>
                            )}

                            <ErrorNotice error={form.formState.errors.root?.message ?? null} />

                            <Button type='submit' intent='primary' className='w-full' loading={submitting}>
                                {isSignup ? 'Create account' : 'Sign in'}
                            </Button>

                            <Button
                                type='button'
                                variant='minimal'
                                className='w-full'
                                disabled={submitting}
                                onClick={() => setIsSignup(current => !current)}
                            >
                                {isSignup ? 'Already have an account? Sign in' : 'First time here? Create an account'}
                            </Button>
                        </form>
                    </Form.Root>
                )}

                <ErrorNotice error={task.error} />
            </Card.Root>
        </main>
    )
}
