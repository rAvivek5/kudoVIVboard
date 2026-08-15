import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Field, Input } from '@/components/ui';
import { validateGuestEmail } from '@/lib/validation';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Address the browser already remembers, if any. */
  initialEmail?: string;
  onSubmit: (email: string) => void;
}

/**
 * "I posted from another device."
 *
 * The email is the only thing that ties a person to their entries, so finding
 * them again is just a matter of supplying it. Nothing is sent, nothing is
 * verified — the same trade the composer makes, stated out loud here because
 * this is the screen where it is easiest to misread as a login.
 */
export function EditAccessModal({ open, onClose, initialEmail = '', onSubmit }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setError('');
    }
  }, [open, initialEmail]);

  const submit = () => {
    const check = validateGuestEmail(email);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    onSubmit(email.trim().toLowerCase());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Find your messages"
      description="Enter the email you posted with and your own cards become editable."
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border-2 border-dashed border-ink/30 bg-ink/[0.03] p-4">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-aqua" aria-hidden />
          <p className="text-[13px] leading-relaxed text-muted">
            No password and no link to click — this board is open on purpose. Your address is only
            used to match the messages you wrote.
          </p>
        </div>

        <Field label="Your email" htmlFor="claim-email" required error={error}>
          <Input
            id="claim-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            aria-invalid={Boolean(error)}
          />
        </Field>

        <Button onClick={submit} size="lg" className="w-full">
          Show my messages
        </Button>
      </div>
    </Modal>
  );
}
