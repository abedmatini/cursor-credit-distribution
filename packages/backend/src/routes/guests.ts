import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { parseSpreadsheet, pickField } from '../services/importService';
import { sendVoucherEmail } from '../services/brevo';
import { assignNextAvailableVoucher } from '../services/voucherAssignment';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

const GUEST_NAME_FIELDS = ['name', 'full_name', 'guest_name', 'attendee_name'];
const GUEST_EMAIL_FIELDS = ['email', 'email_address', 'e_mail'];
const GUEST_PHONE_FIELDS = ['phone', 'phone_number', 'mobile', 'mobile_number'];
const GUEST_STATUS_FIELDS = ['approval_status', 'rsvp_status', 'status'];
const GUEST_QR_CODE_URL_FIELDS = [
  'qr_code_url',
  'qr_code',
  'qr_url',
  'checkin_url',
  'check_in_url',
  'check_in_qr_code',
  'check_in_qr_code_url',
];

// List / search guests
router.get('/', async (req, res, next) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const guests = await prisma.guest.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { voucher: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(guests);
  } catch (err) {
    next(err);
  }
});

// Arrival check-in lookup by email (must be declared before /:id)
router.get('/lookup', async (req, res, next) => {
  try {
    const email = ((req.query.email as string) || '').trim();
    if (!email) return res.status(400).json({ error: 'email query param is required' });

    const guests = await prisma.guest.findMany({
      where: { email: { contains: email, mode: 'insensitive' } },
      include: { voucher: true },
      orderBy: { name: 'asc' },
      take: 15,
    });
    res.json(guests);
  } catch (err) {
    next(err);
  }
});

// Arrival check-in lookup by scanned QR code URL (must be declared before /:id)
router.get('/lookup-by-qr', async (req, res, next) => {
  try {
    const qrCodeUrl = ((req.query.url as string) || '').trim();
    if (!qrCodeUrl) return res.status(400).json({ error: 'url query param is required' });

    const guest = await prisma.guest.findFirst({
      where: { qrCodeUrl: { equals: qrCodeUrl, mode: 'insensitive' } },
      include: { voucher: true },
    });
    if (!guest) return res.status(404).json({ error: 'No guest matches that QR code' });

    res.json(guest);
  } catch (err) {
    next(err);
  }
});

// Manually add a single guest. Voucher pool is not touched here - a voucher is only assigned once
// the guest actually checks in (see /:id/send-voucher), so no-shows never consume voucher inventory.
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, rsvpStatus, qrCodeUrl } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

    const normalizedEmail = String(email).toLowerCase().trim();
    const guest = await prisma.guest.upsert({
      where: { email: normalizedEmail },
      update: { name, phone: phone || null, rsvpStatus: rsvpStatus || null, qrCodeUrl: qrCodeUrl || undefined },
      create: {
        name,
        email: normalizedEmail,
        phone: phone || null,
        rsvpStatus: rsvpStatus || null,
        qrCodeUrl: qrCodeUrl || null,
        source: 'manual',
      },
      include: { voucher: true },
    });

    res.status(201).json(guest);
  } catch (err) {
    next(err);
  }
});

// Import guests from a Luma CSV/XLSX export. Vouchers are NOT auto-assigned here - they stay in the shared
// pool and only get assigned to a guest once they actually check in (see /:id/send-voucher).
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const rows = parseSpreadsheet(req.file.buffer);
    let created = 0;
    let updated = 0;
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = pickField(row, GUEST_EMAIL_FIELDS).toLowerCase();
      const name = pickField(row, GUEST_NAME_FIELDS);

      if (!email) {
        skipped.push({ row: i + 2, reason: 'missing email' });
        continue;
      }

      const phone = pickField(row, GUEST_PHONE_FIELDS) || null;
      const rsvpStatus = pickField(row, GUEST_STATUS_FIELDS) || null;
      const qrCodeUrl = pickField(row, GUEST_QR_CODE_URL_FIELDS) || null;
      const existing = await prisma.guest.findUnique({ where: { email }, include: { voucher: true } });

      await prisma.guest.upsert({
        where: { email },
        update: {
          name: name || existing?.name || email,
          phone: phone ?? existing?.phone ?? null,
          rsvpStatus: rsvpStatus ?? existing?.rsvpStatus ?? null,
          qrCodeUrl: qrCodeUrl ?? existing?.qrCodeUrl ?? null,
        },
        create: { name: name || email, email, phone, rsvpStatus, qrCodeUrl, source: 'luma' },
      });

      if (existing) updated++;
      else created++;
    }

    res.json({ total: rows.length, created, updated, skipped });
  } catch (err) {
    next(err);
  }
});

// Get a single guest with voucher + send history
router.get('/:id', async (req, res, next) => {
  try {
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
      include: { voucher: true, sendLogs: { orderBy: { createdAt: 'desc' } } },
    });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    res.json(guest);
  } catch (err) {
    next(err);
  }
});

// Manually assign a specific/available voucher to a guest
router.post('/:id/assign-voucher', async (req, res, next) => {
  try {
    const { voucherId, code } = req.body;
    const guest = await prisma.guest.findUnique({ where: { id: req.params.id }, include: { voucher: true } });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    let voucher = null;
    if (voucherId) {
      voucher = await prisma.voucher.findUnique({ where: { id: voucherId } });
    } else if (code) {
      voucher = await prisma.voucher.findUnique({ where: { code } });
    } else {
      voucher = await prisma.voucher.findFirst({
        where: { status: 'AVAILABLE', guestId: null },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!voucher) return res.status(404).json({ error: 'No available voucher found' });
    if (voucher.guestId && voucher.guestId !== guest.id) {
      return res.status(409).json({ error: 'Voucher already assigned to another guest' });
    }

    const updated = await prisma.voucher.update({
      where: { id: voucher.id },
      data: { guestId: guest.id, status: 'ASSIGNED', assignedEmail: guest.email },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Send (or resend) the guest's assigned voucher via Brevo
router.post('/:id/send-voucher', async (req, res, next) => {
  try {
    const guest = await prisma.guest.findUnique({ where: { id: req.params.id }, include: { voucher: true } });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    let voucher = guest.voucher;
    if (!voucher) {
      voucher = await assignNextAvailableVoucher(guest.id, guest.email);
    }

    if (!voucher) {
      return res.status(400).json({ error: 'No voucher assigned or available for this guest' });
    }

    await prisma.guest.update({ where: { id: guest.id }, data: { sendStatus: 'SENDING' } });

    try {
      const result = await sendVoucherEmail({
        toEmail: guest.email,
        toName: guest.name,
        voucherCode: voucher.code,
        voucherLink: voucher.link,
      });

      const [updatedGuest] = await prisma.$transaction([
        prisma.guest.update({
          where: { id: guest.id },
          data: {
            sendStatus: 'SENT',
            lastSentAt: new Date(),
            lastError: null,
            checkedInAt: guest.checkedInAt ?? new Date(),
          },
          include: { voucher: true },
        }),
        prisma.sendLog.create({
          data: { guestId: guest.id, voucherId: voucher.id, status: 'SENT', brevoMessageId: result.messageId },
        }),
      ]);

      res.json(updatedGuest);
    } catch (sendError: any) {
      const message = sendError?.message || 'Failed to send email';

      const [updatedGuest] = await prisma.$transaction([
        prisma.guest.update({
          where: { id: guest.id },
          data: { sendStatus: 'FAILED', lastError: message },
          include: { voucher: true },
        }),
        prisma.sendLog.create({
          data: { guestId: guest.id, voucherId: voucher.id, status: 'FAILED', error: message },
        }),
      ]);

      res.status(502).json(updatedGuest);
    }
  } catch (err) {
    next(err);
  }
});

// Delete ALL guests (bulk cleanup of test/dummy data). Frees any assigned vouchers back to AVAILABLE.
router.delete('/', async (_req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.sendLog.deleteMany({}),
      prisma.voucher.updateMany({
        where: { guestId: { not: null } },
        data: { guestId: null, status: 'AVAILABLE', assignedEmail: null },
      }),
      prisma.guest.deleteMany({}),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Delete a guest (testing/cleanup). Frees up their voucher (back to AVAILABLE) instead of deleting it.
router.delete('/:id', async (req, res, next) => {
  try {
    const guest = await prisma.guest.findUnique({ where: { id: req.params.id }, include: { voucher: true } });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    await prisma.$transaction([
      prisma.sendLog.deleteMany({ where: { guestId: guest.id } }),
      ...(guest.voucher
        ? [
            prisma.voucher.update({
              where: { id: guest.voucher.id },
              data: { guestId: null, status: 'AVAILABLE', assignedEmail: null },
            }),
          ]
        : []),
      prisma.guest.delete({ where: { id: guest.id } }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
