import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { parseSpreadsheet, parseSpreadsheetRaw, pickField } from '../services/importService';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

const VOUCHER_CODE_FIELDS = ['code', 'voucher_code', 'voucher', 'coupon_code'];
const VOUCHER_LINK_FIELDS = ['link', 'url', 'voucher_link', 'redeem_link'];
const VOUCHER_EMAIL_FIELDS = ['email', 'email_address', 'assigned_email'];
const KNOWN_VOUCHER_FIELDS = new Set([...VOUCHER_CODE_FIELDS, ...VOUCHER_LINK_FIELDS, ...VOUCHER_EMAIL_FIELDS]);

// Used when a voucher only has a link and no explicit code (many voucher lists are link-only).
export function generateVoucherCode(): string {
  return `VCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

router.get('/', async (_req, res, next) => {
  try {
    const vouchers = await prisma.voucher.findMany({
      include: { guest: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(vouchers);
  } catch (err) {
    next(err);
  }
});

// Manually add a single voucher. If an email is given and matches a guest without a voucher yet,
// it's assigned directly to them (explicit intent). Otherwise it just joins the shared AVAILABLE
// pool - vouchers are only auto-assigned to a guest once they actually check in.
router.post('/', async (req, res, next) => {
  try {
    const { code, link, email } = req.body;
    if (!code && !link) return res.status(400).json({ error: 'code or link is required' });

    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
    let guestId: string | null = null;
    let assignedEmail: string | null = normalizedEmail;
    let status: 'AVAILABLE' | 'ASSIGNED' = 'AVAILABLE';

    if (normalizedEmail) {
      const guest = await prisma.guest.findUnique({ where: { email: normalizedEmail } });
      if (guest) {
        const guestHasVoucher = await prisma.voucher.findUnique({ where: { guestId: guest.id } });
        if (!guestHasVoucher) {
          guestId = guest.id;
          status = 'ASSIGNED';
        }
      }
    }

    const voucher = await prisma.voucher.create({
      data: { code: code || generateVoucherCode(), link: link || null, assignedEmail, guestId, status },
    });

    res.status(201).json(voucher);
  } catch (err) {
    next(err);
  }
});

// Import vouchers from CSV/XLSX. Rows with a matching guest email are assigned to that guest directly
// (explicit intent from the source file); everything else joins the shared AVAILABLE pool and is only
// assigned to a guest once they actually check in (see /api/guests/:id/send-voucher). This keeps the
// pool intact for no-shows: vouchers aren't consumed just because a guest was imported/RSVP'd.
// Files with no recognizable header row (e.g. a plain list of links, nothing else) are also supported.
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const headerRows = parseSpreadsheet(req.file.buffer);
    const hasRecognizedHeader = headerRows.length > 0 && Object.keys(headerRows[0]).some((key) => KNOWN_VOUCHER_FIELDS.has(key));

    type Entry = { rowNumber: number; code: string; link: string | null; email: string | null };
    let entries: Entry[];

    if (hasRecognizedHeader) {
      entries = headerRows.map((row, i) => ({
        rowNumber: i + 2, // row 1 is the header
        code: pickField(row, VOUCHER_CODE_FIELDS),
        link: pickField(row, VOUCHER_LINK_FIELDS) || null,
        email: pickField(row, VOUCHER_EMAIL_FIELDS).toLowerCase() || null,
      }));
    } else {
      // No recognizable header - treat every non-empty cell as data (nothing consumed as a header),
      // guessing which cell is a link/code vs. an email per row.
      entries = parseSpreadsheetRaw(req.file.buffer)
        .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
        .filter((cells) => cells.length > 0)
        .map((cells, i) => {
          const emailCell = cells.find((cell) => cell.includes('@'));
          const otherCells = cells.filter((cell) => cell !== emailCell);
          const primary = otherCells[0] || '';
          const isLink = /^https?:\/\//i.test(primary);
          return {
            rowNumber: i + 1,
            code: isLink ? '' : primary,
            link: isLink ? primary : otherCells[1] || null,
            email: emailCell ? emailCell.toLowerCase() : null,
          };
        });
    }

    let created = 0;
    let matchedByEmail = 0;
    const skipped: { row: number; reason: string }[] = [];

    for (const entry of entries) {
      const { rowNumber, link, email } = entry;

      if (!entry.code && !link) {
        skipped.push({ row: rowNumber, reason: 'missing both code and link' });
        continue;
      }

      const code = entry.code || generateVoucherCode();
      const existingVoucher = await prisma.voucher.findUnique({ where: { code } });
      if (existingVoucher) {
        skipped.push({ row: rowNumber, reason: 'duplicate code, skipped' });
        continue;
      }

      let guestId: string | null = null;
      let assignedEmail: string | null = email;
      let status: 'AVAILABLE' | 'ASSIGNED' = 'AVAILABLE';

      if (email) {
        const guest = await prisma.guest.findUnique({ where: { email } });
        if (guest) {
          const guestHasVoucher = await prisma.voucher.findUnique({ where: { guestId: guest.id } });
          if (!guestHasVoucher) {
            guestId = guest.id;
            status = 'ASSIGNED';
            matchedByEmail++;
          }
        }
      }

      await prisma.voucher.create({ data: { code, link, assignedEmail, guestId, status } });
      created++;
    }

    const available = created - matchedByEmail;
    res.json({ total: entries.length, created, matchedByEmail, available, skipped });
  } catch (err) {
    next(err);
  }
});

// Delete ALL vouchers (bulk cleanup of test/dummy data). Detaches them from any send logs first.
router.delete('/', async (_req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.sendLog.updateMany({ where: { voucherId: { not: null } }, data: { voucherId: null } }),
      prisma.voucher.deleteMany({}),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Delete a voucher (testing/cleanup). Detaches it from any send logs first.
router.delete('/:id', async (req, res, next) => {
  try {
    const voucher = await prisma.voucher.findUnique({ where: { id: req.params.id } });
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

    await prisma.$transaction([
      prisma.sendLog.updateMany({ where: { voucherId: voucher.id }, data: { voucherId: null } }),
      prisma.voucher.delete({ where: { id: voucher.id } }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
