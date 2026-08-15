import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { FullPageLoader } from '@/components/common/Loader';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { resetPassword } from '@/services/auth';
import { isValidEmail } from '@/lib/utils';

export default function LoginPage() {
  const { isAdmin, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  if (loading) return <FullPageLoader label="Checking your session" />;
  if (isAdmin) return <Navigate to="/admin" replace />;

  const submit = async () => {
    if (!isValidEmail(email) || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await signIn(email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      // Deliberately vague: do not confirm which accounts exist.
      setError(
        err instanceof Error && err.message.includes('admin access')
          ? err.message
          : 'That email and password did not match.',
      );
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!isValidEmail(email)) {
      setError('Enter your email first, then we can send a reset link.');
      return;
    }
    await resetPassword(email).catch(() => {});
    toast.success('If that account exists, a reset link is on its way.');
  };

  return (
    <div className="grain grid min-h-dvh place-items-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-7 text-center">
          <span className="inline-grid h-14 w-14 place-items-center rounded-2xl border-2 border-ink bg-zap text-3xl shadow-pop">
            📌
          </span>
          <h1 className="mt-5 text-3xl">Admin sign in</h1>
          <p className="mt-1.5 text-sm text-muted">Only admins create boards. Guests never sign in.</p>
        </div>

        <div className="sticker space-y-4 p-6">
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adminvivek@gmail.com"
            />
          </Field>

          <Field label="Password" htmlFor="password" required error={error}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </Field>

          <Button onClick={() => void submit()} loading={busy} size="lg" className="w-full" icon={<LogIn className="h-4 w-4" />}>
            Sign in
          </Button>

          <button
            onClick={() => void forgot()}
            className="w-full text-center text-[13px] text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
          >
            Forgot your password?
          </button>
        </div>
      </motion.div>
    </div>
  );
}
