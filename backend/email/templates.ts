export type EmailTemplate =
  | { kind: 'verify_email'; token: string }
  | { kind: 'reset_password'; token: string }
  | { kind: 'password_changed' }
  | { kind: 'account_exists' };

export type RenderedEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const appBaseUrl = (): string => (process.env.APP_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');

function layout(heading: string, body: string, action?: { label: string; url: string }): string {
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#0A0A0B;color:#E8E8EA;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #2A2A2E;border-radius:12px;background:#111114">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 18px">${escapeHtml(body)}</p>
${action ? `<p style="margin:0 0 18px"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#C6F24E;color:#0A0A0B;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p><p style="font-size:12px;color:#9A9AA2;word-break:break-all;margin:0">${escapeHtml(action.url)}</p>` : ''}
<p style="font-size:12px;color:#9A9AA2;margin:20px 0 0">PenflowAI sends this message as part of account security. If you did not expect it, you can ignore it.</p>
</div></body></html>`;
}

export function renderEmail(template: EmailTemplate): RenderedEmail {
  const base = appBaseUrl();
  switch (template.kind) {
    case 'verify_email': {
      const url = `${base}/verify-email#token=${encodeURIComponent(template.token)}`;
      return {
        subject: 'Verify your PenflowAI email address',
        text: `Confirm your email address to finish setting up your PenflowAI account. This link expires in 24 hours.\n\n${url}\n\nIf you did not create an account, ignore this message.`,
        html: layout('Verify your email address', 'Confirm your email address to finish setting up your PenflowAI account. This link expires in 24 hours. If you did not create an account, ignore this message.', { label: 'Verify email', url }),
      };
    }
    case 'reset_password': {
      const url = `${base}/reset-password#token=${encodeURIComponent(template.token)}`;
      return {
        subject: 'Reset your PenflowAI password',
        text: `Use this link to choose a new password. It expires in 30 minutes and can be used once.\n\n${url}\n\nIf you did not request a reset, ignore this message; your password has not changed.`,
        html: layout('Reset your password', 'Use this link to choose a new password. It expires in 30 minutes and can be used once. If you did not request a reset, ignore this message; your password has not changed.', { label: 'Choose a new password', url }),
      };
    }
    case 'password_changed':
      return {
        subject: 'Your PenflowAI password was changed',
        text: 'Your password was changed and every signed-in session was signed out. If this was not you, reset your password immediately and contact support.',
        html: layout('Your password was changed', 'Your password was changed and every signed-in session was signed out. If this was not you, reset your password immediately and contact support.'),
      };
    case 'account_exists':
      return {
        subject: 'A PenflowAI account already uses this address',
        text: 'Someone tried to create a PenflowAI account with this email address, but an account already exists. Sign in instead, or reset your password if you do not remember it.',
        html: layout('An account already uses this address', 'Someone tried to create a PenflowAI account with this email address, but an account already exists. Sign in instead, or reset your password if you do not remember it.'),
      };
  }
}
