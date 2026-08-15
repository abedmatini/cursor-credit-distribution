import { prisma } from '../lib/prisma';

/** Assigns the oldest AVAILABLE, unassigned voucher to a guest. Returns null if none are left. */
export async function assignNextAvailableVoucher(guestId: string, guestEmail: string) {
  const voucher = await prisma.voucher.findFirst({
    where: { status: 'AVAILABLE', guestId: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!voucher) return null;

  return prisma.voucher.update({
    where: { id: voucher.id },
    data: { guestId, status: 'ASSIGNED', assignedEmail: guestEmail },
  });
}
