import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <EmptyState
        sticker="🧭"
        title="Nothing at this address"
        body="The page you were after does not exist. Head back and try again."
        action={
          <Link
            to="/"
            className="inline-flex h-12 items-center rounded-full border-2 border-ink bg-hype px-6 font-display font-semibold text-white shadow-pop sticker-lift"
          >
            Go home
          </Link>
        }
      />
    </div>
  );
}
