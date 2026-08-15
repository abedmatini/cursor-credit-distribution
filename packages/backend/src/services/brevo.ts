const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface SendVoucherEmailParams {
  toEmail: string;
  toName: string;
  voucherCode: string;
  voucherLink?: string | null;
}

interface BrevoSendResult {
  messageId: string;
}

export async function sendVoucherEmail({
  toEmail,
  toName,
  voucherCode,
  voucherLink,
}: SendVoucherEmailParams): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Cafe Cursor';

  if (!apiKey) throw new Error('BREVO_API_KEY is not configured');
  if (!senderEmail) throw new Error('BREVO_SENDER_EMAIL is not configured');

  const creditAmount = process.env.CREDIT_AMOUNT_USD || '50';

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: toEmail, name: toName }],
      subject: `Your $${creditAmount} Cursor Credits`,
      htmlContent: buildVoucherEmailHtml({ toName, voucherCode, voucherLink, creditAmount }),
    }),
  });

  const data: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || `Brevo request failed with status ${response.status}`);
  }

  return { messageId: data.messageId };
}

// Codes we auto-generate at import time (e.g. link-only voucher lists) aren't meaningful to show.
const AUTO_GENERATED_CODE_PATTERN = /^VCH-[0-9A-F]{8}$/;

const REDEMPTION_TERMS = [
  'You must be logged in to Cursor in the same browser where you open this credits link (the same applies if using a QR code).',
  "As long as the credits haven't been redeemed yet, you can reopen this link in the same or a different browser - just make sure you're logged into the correct account (a non-Team, single-user account).",
  'Credits can be redeemed on Free or Paid accounts and will appear under Dashboard > Credits. Redeeming adds the credits to your account but does not apply them immediately.',
  "If you're on the Free plan, keep using it as normal - once you hit the plan limit, you'll need to start a Pro account with a valid payment method for verification.",
  'Credits are automatically applied to your next invoice: if you start a Pro trial/account after redeeming as a Free user, credits apply once the subscription starts; if you already have a paid account, they apply to your next invoice.',
  "Don't see the credits under Dashboard > Credits after redeeming? Try a hard refresh, or log out and back in. Still not showing? Check out via Stripe from your dashboard to confirm it's applying correctly.",
  'Credits do not work on Team plans - only for single-user accounts (Pro / Pro+ / Ultra).',
  'Note: some features like Background Agents / Web require a paid plan and will not work with credits alone on a Free account.',
];

function buildVoucherEmailHtml({
  toName,
  voucherCode,
  voucherLink,
  creditAmount,
}: {
  toName: string;
  voucherCode: string;
  voucherLink?: string | null;
  creditAmount: string;
}): string {
  const logoUrl = process.env.EMAIL_LOGO_URL;
  const header = logoUrl
    ? `<img src="${logoUrl}" alt="Cursor" width="180" height="45" style="display:block;width:180px;height:45px;margin:0 auto 20px;border:0;" />`
    : '<h2 style="color:#111827;text-align:center;">Cursor</h2>';

  const button = voucherLink
    ? `<p style="text-align:center;margin:24px 0;">
         <a href="${voucherLink}" style="background:#111827;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Redeem your credits</a>
       </p>`
    : '';

  const showCode = !AUTO_GENERATED_CODE_PATTERN.test(voucherCode) || !voucherLink;
  const codeBlock = showCode
    ? `<p style="font-size:20px;font-weight:700;text-align:center;letter-spacing:1px;background:#f3f4f6;padding:12px;border-radius:8px;">
         ${escapeHtml(voucherCode)}
       </p>`
    : '';

  const termsList = REDEMPTION_TERMS.map((term) => `<li style="margin-bottom:8px;">${escapeHtml(term)}</li>`).join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
    ${header}
    <p>Hi ${escapeHtml(toName)},</p>
    <p>Thanks for joining us! You've received <strong>$${escapeHtml(creditAmount)} in Cursor credits</strong> for this event.</p>
    ${codeBlock}
    ${button}
    <h3 style="color:#111827;font-size:15px;margin-top:32px;">How to redeem &amp; terms</h3>
    <ul style="color:#4b5563;font-size:13px;padding-left:20px;">
      ${termsList}
    </ul>
    <p style="color:#6b7280;font-size:13px;">If you weren't expecting this email, you can ignore it.</p>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
