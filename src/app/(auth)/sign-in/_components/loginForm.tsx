"use client"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-clint'
import { Loader, Loader2, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FaGithub, FaGoogle } from 'react-icons/fa'
import { toast } from 'sonner'

export const LoginForm = () => {

  const router = useRouter()

  const [githubPending, startGithubTransition] = useTransition()
  const [googlePending, startGoogleTransition] = useTransition()
  const [emailPending, startEmailTransition] = useTransition()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")


  async function signInWithGithub() {
    startGithubTransition(async () => {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: "/",
        fetchOptions: {
          onSuccess: () => {
            toast.success('Signed in with Github, you will be redirected...')
          },
          onError: (error) => {
            toast.error('Internal server error')
          }
        }
      })
    })
  }

  async function signInWithGoogle() {
    startGoogleTransition(async () => {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: "/",
        fetchOptions: {
          onSuccess: () => {
            toast.success('Signed in with google, you will be redirected...')
          },
          onError: (error) => {
            toast.error('Internal server error')
          }
        }
      })
    })
  }

  function signInWithEmail() {
    startEmailTransition(async () => {
      await authClient.emailOtp.sendVerificationOtp({
        email: email,
        type: "sign-in",
        fetchOptions: {
          onSuccess: () => {
            toast.success('Email sent')
            router.push(`/verify-request?email=${email}`)
          },
          onError: (error) => {
            toast.error('Internal server error')
            toast.error("Error sending email")
          }

        }
      })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl'>
          Welcome back!
        </CardTitle>
        <CardDescription>
          Login with your Github or email account
        </CardDescription>
      </CardHeader>

      <CardContent className='flex flex-col gap-4'>
        <div className='grid gap-3'>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                required
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='your@email.com'
              required
            />
          </div>

          <Button
            onClick={signInWithEmail}
            disabled={emailPending}
          >
            {emailPending ? (
              <>
                <Loader2 className='size-4 animate-spin' />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Send className='size-4' />
                <span>Continue with Email</span>
              </>
            )}
          </Button>
        </div>

        <div className='relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border'>
          <span className='relative z-10 bg-card px-2 text-muted-foreground'>Or</span>
        </div>

        <div className="flex items-center justify-center gap-5">
          {/* GitHub */}
          <Button
            disabled={githubPending}
            title="Sign up with GitHub"
            className="h-8 w-8 flex items-center justify-center rounded-full cursor-pointer"
            onClick={signInWithGithub}
          >
            {githubPending ? (
              <Loader className="size-5 animate-spin" />
            ) : (
              <FaGithub className="size-6" />
            )}
          </Button>

          {/* Google */}
          <Button
            disabled={googlePending}
            title="Sign up with Google"
            className="h-8 w-8 flex items-center justify-center rounded-full cursor-pointer"
            onClick={signInWithGoogle}
          >
            {googlePending ? (
              <Loader className="size-5 animate-spin" />
            ) : (
              <FaGoogle className="size-6" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
