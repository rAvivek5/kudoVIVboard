import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { BoardForm } from '@/components/admin/BoardForm';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { createBoard } from '@/services/boards';

export default function NewBoardPage() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/boards"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-muted hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Boards
        </Link>
        <h1 className="mt-2 text-3xl">Create a board</h1>
        <p className="mt-1 text-sm text-muted">
          Pick the occasion, set the rules, share the link. You can change all of it later.
        </p>
      </div>

      <BoardForm
        submitLabel="Create board"
        onSubmit={async (input) => {
          if (!admin) return;
          try {
            const board = await createBoard(input, admin.uid);
            toast.success('Board created. Copy the link and share it.');
            navigate(`/admin/boards/${board.id}`, { replace: true });
          } catch {
            toast.error('The board could not be created. Try again.');
          }
        }}
      />
    </div>
  );
}
