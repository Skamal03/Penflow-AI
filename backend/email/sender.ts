import nodemailer, { type Transporter } from 'nodemailer';
import { renderEmail, type EmailTemplate } from './templates.js';

let transport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
      requireTLS: process.env.SMTP_STARTTLS === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
}

function queueEmail(to: string, template: EmailTemplate): void {
  setImmediate(() => {
    const mailer = getTransport();
    if (!mailer) {
      process.stdout.write('Outgoing email skipped: SMTP_HOST is not configured.\n');
      return;
    }
    const { subject, text, html } = renderEmail(template);
    mailer.sendMail({ from: process.env.SMTP_FROM ?? 'PenflowAI <no-reply@penflow.local>', to, subject, text, html })
      .catch(() => process.stdout.write('Outgoing email could not be delivered.\n'));
  });
}

export const sendVerificationEmail = (to: string, token: string): void => queueEmail(to, { kind: 'verify_email', token });
export const sendPasswordResetEmail = (to: string, token: string): void => queueEmail(to, { kind: 'reset_password', token });
export const sendPasswordChangedEmail = (to: string): void => queueEmail(to, { kind: 'password_changed' });
export const sendAccountExistsEmail = (to: string): void => queueEmail(to, { kind: 'account_exists' });
