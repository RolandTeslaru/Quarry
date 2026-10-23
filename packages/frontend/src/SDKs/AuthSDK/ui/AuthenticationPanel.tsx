import { useState, type FormEvent } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Callout } from '@quarry/standard-ui/foundations/callout'
import { Card } from '@quarry/standard-ui/foundations/card'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Input } from '@quarry/standard-ui/foundations/input'
import { AuthSDK } from '../sdk'
import { useTask } from '@/hooks/useTask'
import { ErrorNotice } from '@/components/ErrorNotice'

export function AuthenticationPanel() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignup, setIsSignup] = useState(false)
    const [confirmation, setConfirmation] = useState(false)

    const hasSession = AuthSDK.useStore(state => state.hasSession)
    const accessError = AuthSDK.useStore(state => state.error)

    const [task, withTask] = useTask()

    const submit = withTask(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        setConfirmation(false)

        if (isSignup) {
            const hasSession = await AuthSDK.actions.signup({ email, password })

            setConfirmation(!hasSession)

            return
        }

        await AuthSDK.actions.login({ email, password })
    })

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
                    <form onSubmit={submit} className='mt-6 flex flex-col gap-4'>
                        <Field.Root>
                            <Field.Label htmlFor='auth-email'>Email</Field.Label>
                            <Input
                                id='auth-email'
                                type='email'
                                autoComplete='email'
                                required
                                value={email}
                                onChange={event => setEmail(event.target.value)}
                            />
                        </Field.Root>

                        <Field.Root>
                            <Field.Label htmlFor='auth-password'>Password</Field.Label>
                            <Input
                                id='auth-password'
                                type='password'
                                autoComplete={isSignup ? 'new-password' : 'current-password'}
                                required
                                minLength={6}
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                            />
                        </Field.Root>

                        {confirmation && (
                            <Callout intent='success'>Check your email to confirm your account.</Callout>
                        )}

                        <Button type='submit' intent='primary' className='w-full' loading={task.pending}>
                            {isSignup ? 'Create account' : 'Sign in'}
                        </Button>

                        <Button
                            type='button'
                            variant='minimal'
                            className='w-full'
                            disabled={task.pending}
                            onClick={() => setIsSignup(current => !current)}
                        >
                            {isSignup ? 'Already have an account? Sign in' : 'First time here? Create an account'}
                        </Button>
                    </form>
                )}

                <ErrorNotice error={task.error} />
            </Card.Root>
        </main>
    )
}
