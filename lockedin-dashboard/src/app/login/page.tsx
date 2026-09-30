'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import styles from './login.module.css';
import Image from 'next/image';
import { Input, Spacer } from '@heroui/react';
import { PrimaryButton, SecondaryButton, AlertBox, FormContainer } from '@/components/heroui-components';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');

  const loginInputClassNames = {
    inputWrapper:
      'bg-default-100/85 border-default-300/80 data-[hover=true]:bg-default-100 data-[focus=true]:bg-default-100',
    input: 'text-foreground placeholder:text-default-500',
  };

  const router = useRouter();
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();

  // Check if any users exist - if not, allow sign-up for first admin
  const hasUsers = useQuery(api.publicApi.hasAnyUsers);
  const canSignUp = hasUsers === false; // explicitly false means we know there are 0 users

  // Auto-switch to signUp mode if no users exist
  useEffect(() => {
    if (canSignUp) {
      setMode('signUp');
    }
  }, [canSignUp]);

  // Check for error parameters in URL (e.g., redirected from dashboard due to pending approval)
  useEffect(() => {
    const errorParam = new URLSearchParams(window.location.search).get('error');
    if (errorParam === 'pending_approval') {
      setError('❌ Váš účet čeká na schválení správcem. Kontaktujte správce.');
    }
  }, []);

  const currentUser = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (!isAuthenticated || isLoading || !currentUser) return;
    if (currentUser.isApproved === false || currentUser.isActive === false) {
      void signOut().then(() => setError('V?? ??et ?ek? na schv?len? spr?vcem nebo je neaktivn?.'));
      return;
    }
    router.replace('/dashboard');
  }, [isAuthenticated, isLoading, currentUser, router, signOut]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      if (!normalizedUsername) throw new Error('Invalid username');
      await signIn('password', { email: normalizedUsername, password, flow: mode });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) {
        setError('??et ji? existuje. P?ihlaste se.');
        setMode('signIn');
      } else if (mode === 'signUp') {
        setError('??et se nepoda?ilo vytvo?it. Heslo mus? m?t alespo? 8 znak?.');
      } else if (/InvalidSecret|InvalidAccountId|Invalid credentials/i.test(message)) {
        setError('Neplatn? u?ivatelsk? jm?no nebo heslo.');
      } else {
        setError('P?ihl??en? nen? dostupn?. Zkuste to znovu pozd?ji.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      {/* SSPS Logo in top left */}
      <div className={styles.logoContainer}>
        <Image
          src="/media/logo_ssps.svg"
          alt="SSPS Logo"
          width={318}
          height={111}
          className={styles.sspsLogo}
          priority
        />
      </div>

      {/* Main Login Card */}
      <div className={styles.loginCard}>
        {/* LockedIN Logo */}
        <div className={styles.lockedinLogoContainer}>
          <Image
            src="/media/logo-v2.svg"
            alt="LockedIN Logo"
            width={718}
            height={521}
            className={styles.lockedinLogo}
            priority
          />
        </div>
        <FormContainer onSubmit={handleSubmit}>
          {/* Error/Success Message */}
          {error && (
            <>
              <AlertBox 
                type={error.includes('✅') ? 'success' : 'error'} 
                message={error.replace('✅ ', '').replace('❌ ', '')} 
              />
              <Spacer y={2} />
            </>
          )}

          {/* Username Input */}
          <Input
            id="username"
            name="username"
            placeholder="uživatelské jméno"
            type="text"
            variant="bordered"
            size="lg"
            radius="md"
            fullWidth
            classNames={loginInputClassNames}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="username"
          />

          {/* Password Input */}
          <Input
            id="password"
            name="password"
            placeholder="heslo"
            type="password"
            variant="bordered"
            size="lg"
            radius="md"
            fullWidth
            classNames={loginInputClassNames}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          />

          {/* Login Button */}
          <PrimaryButton
            type="submit"
            disabled={isLoading || hasUsers === undefined}
            className="mt-4"
          >
            {isLoading
              ? (mode === 'signUp' ? 'CREATING ACCOUNT...' : 'LOGGING IN...')
              : (mode === 'signUp' ? 'CREATE ACCOUNT' : 'LOGIN')
            }
          </PrimaryButton>

          {/* Toggle between Sign In and Sign Up */}
          <SecondaryButton
            type="button"
            onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            className="mt-2 w-full"
            variant="light"
          >
            {mode === 'signIn'
              ? 'Need to create an account? Sign up'
              : 'Already have an account? Sign in'
            }
          </SecondaryButton>
        </FormContainer>

        {/* Verification Info - Only show during signup */}
        {mode === 'signUp' && (
          <div className="mt-4">
            <AlertBox 
              type="info" 
              message="You must be verified by an administrator before you can log in. New accounts require approval." 
            />
          </div>
        )}
      </div>
    </div>
  );
}
