/**
 * Emails the board owner when a message arrives.
 *
 * Invoked by a Database Webhook on `public.entries` INSERT — see the README.
 *
 * Never returns a non-2xx for a delivery failure: the message is already safely
 * in the database, and a retry storm would only duplicate email.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    board_id: string;
    author_name: string;
    is_anonymous: boolean;
    message: string;
    media: unknown[];
    status: string;
  };
}

const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Hypewall <noreply@example.com>';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!RESEND_KEY) {
    console.log('No mail provider configured; skipping notification', { to });
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html, text }),
  });

  if (!res.ok) console.error('Notification failed to send', res.status, await res.text());
}

Deno.serve(async (req) => {
  // The webhook is a public URL; a shared secret keeps strangers from firing it.
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const payload = (await req.json()) as WebhookPayload;
    const entry = payload.record;
    if (!entry) return new Response('ok');

    const { data: board } = await supabase
      .from('boards')
      .select('title, slug, created_by, notify_on_new_entry')
      .eq('id', entry.board_id)
      .single();

    if (!board || !board.notify_on_new_entry) return new Response('ok');

    const { data: owner } = await supabase
      .from('admins')
      .select('email')
      .eq('id', board.created_by)
      .single();

    if (!owner?.email) {
      console.warn('Board owner has no admin row; skipping', { boardId: entry.board_id });
      return new Response('ok');
    }

    const excerptSource = stripTags(entry.message);
    const excerpt =
      excerptSource.length > 240 ? `${excerptSource.slice(0, 239)}\u2026` : excerptSource;
    const needsApproval = entry.status === 'pending';
    const author = entry.is_anonymous ? 'Anonymous' : entry.author_name;
    const link = needsApproval ? `${APP_URL}/admin/boards/${entry.board_id}` : `${APP_URL}/b/${board.slug}`;
    const mediaCount = Array.isArray(entry.media) ? entry.media.length : 0;

    // Table-free markup, because it has to survive Outlook.
    const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6C668A">
    ${needsApproval ? 'Waiting for approval' : 'New message'}
  </p>
  <h1 style="margin:0 0 20px;font-size:22px;color:#141122">${escapeHtml(board.title)}</h1>
  <div style="border:2px solid #141122;border-radius:16px;padding:18px;background:#fff">
    <p style="margin:0 0 10px;font-weight:600;color:#141122">${escapeHtml(author)}</p>
    <p style="margin:0;color:#141122;line-height:1.6">${escapeHtml(excerpt)}</p>
  </div>
  ${mediaCount ? `<p style="margin:16px 0 0;color:#6C668A;font-size:13px">${mediaCount} attachment${mediaCount === 1 ? '' : 's'}</p>` : ''}
  <p style="margin:20px 0 0">
    <a href="${link}" style="display:inline-block;background:#FF2E88;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;border:2px solid #141122">
      ${needsApproval ? 'Review it' : 'Open the board'}
    </a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#6C668A">
    You are getting this because you own this board. Turn notifications off in the board settings.
  </p>
</div>`.trim();

    const text = [
      needsApproval ? 'A message is waiting for approval' : 'New message',
      board.title,
      '',
      `${author}: ${excerpt}`,
      mediaCount ? `${mediaCount} attachment(s)` : '',
      '',
      link,
    ]
      .filter(Boolean)
      .join('\n');

    await sendMail(
      owner.email,
      needsApproval ? `Approval needed on "${board.title}"` : `New message on "${board.title}"`,
      html,
      text,
    );

    return new Response('ok');
  } catch (error) {
    // Swallow: the entry is already stored, and a 500 would make the webhook retry.
    console.error('notify-admin failed', error);
    return new Response('ok');
  }
});
