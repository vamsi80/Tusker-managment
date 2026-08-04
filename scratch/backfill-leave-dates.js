/**
 * One-off backfill for the leave/attendance off-by-one-day bug.
 *
 * Before the fix, the leave dialog sent a browser-local midnight through
 * toISOString(). Prisma truncates `@db.Date` on the UTC day, so every leave
 * picked in IST was stored one day EARLIER than the day the user clicked
 * (pick 31 Jan -> stored 30 Jan), and the ON_LEAVE attendance rows written on
 * approval inherited that same wrong day.
 *
 * This script shifts affected rows forward by one day.
 *
 * IMPORTANT: rows created AFTER the fix was deployed are already correct.
 * Shifting them would introduce the very bug you just removed, so a cutoff is
 * mandatory: only rows with createdAt < CUTOFF are touched.
 *
 * Usage (dry run, prints what would change and touches nothing):
 *   node scratch/backfill-leave-dates.js --cutoff 2026-08-04T00:00:00Z
 *
 * Apply for real:
 *   node scratch/backfill-leave-dates.js --cutoff 2026-08-04T00:00:00Z --apply
 *
 * Take a database backup before running with --apply.
 */
const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const cutoffArg = args[args.indexOf('--cutoff') + 1];

const day = (d) => d.toISOString().slice(0, 10);
const shift = (d) => new Date(d.getTime() + MS_PER_DAY);

async function main() {
  if (args.indexOf('--cutoff') === -1 || !cutoffArg) {
    throw new Error('--cutoff <ISO timestamp> is required (the moment the fix went live).');
  }
  const cutoff = new Date(cutoffArg);
  if (isNaN(cutoff.getTime())) throw new Error(`Invalid --cutoff value: ${cutoffArg}`);

  console.log(`Mode   : ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log(`Cutoff : rows created before ${cutoff.toISOString()}\n`);

  const leaves = await prisma.leave_request.findMany({
    where: { createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`leave_request rows in scope: ${leaves.length}`);
  for (const leave of leaves) {
    const from = `${day(leave.startDate)} -> ${day(leave.endDate)}`;
    const to = `${day(shift(leave.startDate))} -> ${day(shift(leave.endDate))}`;
    console.log(`  ${leave.id}  ${from}  =>  ${to}   [${leave.status}]`);

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.leave_request.update({
        where: { id: leave.id },
        data: { startDate: shift(leave.startDate), endDate: shift(leave.endDate) },
      });

      // Move the ON_LEAVE attendance rows this leave generated. Only rows still
      // marked ON_LEAVE are touched: if someone actually checked in that day the
      // record is real attendance and must be left alone.
      if (leave.status !== 'APPROVED') return;

      for (let t = leave.startDate.getTime(); t <= leave.endDate.getTime(); t += MS_PER_DAY) {
        const wrongDay = new Date(t);
        const rightDay = shift(wrongDay);

        const stale = await tx.attendance.findFirst({
          where: {
            workspaceMemberId: leave.workspaceMemberId,
            date: wrongDay,
            status: 'ON_LEAVE',
          },
        });
        if (!stale) continue;

        const clash = await tx.attendance.findFirst({
          where: { workspaceMemberId: leave.workspaceMemberId, date: rightDay },
        });

        if (clash) {
          // Target day already has a record; keep it and drop the stale one,
          // promoting it to ON_LEAVE only if nobody checked in.
          if (!clash.checkIn) {
            await tx.attendance.update({ where: { id: clash.id }, data: { status: 'ON_LEAVE' } });
          }
          await tx.attendance.delete({ where: { id: stale.id } });
        } else {
          await tx.attendance.update({ where: { id: stale.id }, data: { date: rightDay } });
        }
      }
    });
  }

  console.log(`\n${apply ? 'Backfill complete.' : 'Dry run complete — nothing was written.'}`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
