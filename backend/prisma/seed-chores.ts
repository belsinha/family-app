import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

async function main() {
  const celiane = await prisma.householdMember.upsert({
    where: { id: 1 },
    create: { name: 'Celiane', canEditChores: true },
    update: { canEditChores: true },
  });
  const isabel = await prisma.householdMember.upsert({
    where: { id: 2 },
    create: { name: 'Isabel', canEditChores: false },
    update: {},
  });
  const nicholas = await prisma.householdMember.upsert({
    where: { id: 3 },
    create: { name: 'Nicholas', canEditChores: false },
    update: {},
  });
  const laura = await prisma.householdMember.upsert({
    where: { id: 4 },
    create: { name: 'Laura', canEditChores: false },
    update: {},
  });
  const members = { Celiane: celiane, Isabel: isabel, Nicholas: nicholas, Laura: laura };

  const templates = [
    { name: 'Walk Toby (Morning)', category: 'Pet Care', assignedTo: 'Laura', frequencyType: 'DAILY', timeBlock: 'MORNING' },
    { name: 'Walk Toby (Afternoon)', category: 'Pet Care', assignedTo: 'Isabel', frequencyType: 'DAILY', timeBlock: 'AFTERNOON' },
    { name: 'Walk Toby (Night, Safety)', category: 'Pet Care', assignedTo: 'Nicholas', frequencyType: 'DAILY', timeBlock: 'NIGHT' },
    { name: 'Refill pet food and water', category: 'Pet Care', assignedTo: 'Laura', frequencyType: 'DAILY', timeBlock: 'MORNING' },
    { name: 'Vacuum shared areas (light)', category: 'Shared Areas', assignedTo: 'Laura', frequencyType: 'DAILY', timeBlock: 'MORNING' },
    { name: 'Vacuum pet hair critical areas', category: 'Shared Areas', assignedTo: 'Laura', frequencyType: 'DAILY', timeBlock: 'NIGHT' },
    { name: 'Kitchen dishes (keep sink clear)', category: 'Kitchen', assignedTo: 'Nicholas', frequencyType: 'DAILY', timeBlock: 'NIGHT' },
    { name: 'Wipe tables and countertops', category: 'Kitchen', assignedTo: 'Isabel', frequencyType: 'DAILY', timeBlock: 'MORNING' },
    { name: 'Verify kitchen trash (>70%)', category: 'Trash', assignedTo: 'Nicholas', frequencyType: 'DAILY', timeBlock: 'NIGHT' },
    { name: "Scoop Penelope's litter", category: 'Pet Care', assignedTo: 'Laura', frequencyType: 'EVERY_OTHER_DAY', timeBlock: 'AFTERNOON' },
    { name: 'Mop shared floors', category: 'Shared Areas', assignedTo: 'Laura', frequencyType: 'EVERY_OTHER_DAY', timeBlock: 'AFTERNOON' },
    { name: 'Vacuum shared areas (full)', category: 'Shared Areas', assignedTo: 'Laura', frequencyType: 'EVERY_OTHER_DAY', timeBlock: 'ANY' },
    { name: 'Wash pet bedding', category: 'Pet Care', assignedTo: 'Laura', frequencyType: 'WEEKLY', dayOfWeek: DAY.MON, timeBlock: 'ANY' },
    { name: "Clean Penelope's food area", category: 'Pet Care', assignedTo: 'Isabel', frequencyType: 'WEEKLY', dayOfWeek: DAY.WED, timeBlock: 'ANY' },
    { name: 'Clean microwave, air fryer, stove', category: 'Kitchen', assignedTo: 'Isabel', frequencyType: 'WEEKLY', dayOfWeek: DAY.WED, timeBlock: 'ANY' },
    { name: 'Check fridge for expired food', category: 'Kitchen', assignedTo: 'Celiane', frequencyType: 'WEEKLY', dayOfWeek: DAY.WED, timeBlock: 'ANY' },
    { name: 'Dust and polish furniture (social areas)', category: 'Shared Areas', assignedTo: 'Laura', frequencyType: 'WEEKLY', dayOfWeek: DAY.THU, timeBlock: 'ANY' },
    { name: 'Keep lanai clean and organized', category: 'Shared Areas', assignedTo: 'Nicholas', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Vacuum bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Celiane', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Vacuum bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Isabel', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Vacuum bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Nicholas', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Vacuum bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Laura', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Mop bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Celiane', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Mop bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Isabel', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Mop bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Nicholas', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Mop bedroom floor (each person)', category: 'Bedrooms', assignedTo: 'Laura', frequencyType: 'WEEKLY', dayOfWeek: DAY.SAT, timeBlock: 'ANY' },
    { name: 'Wash bedsheets (rotation)', category: 'Laundry', assignedTo: 'Celiane', frequencyType: 'WEEKLY', dayOfWeek: DAY.FRI, timeBlock: 'ANY' },
    { name: 'Social bathroom quick maintenance', category: 'Bathroom', assignedTo: 'Laura', frequencyType: 'DAILY', timeBlock: 'ANY' },
    { name: 'Girls bathroom quick maintenance', category: 'Bathroom', assignedTo: 'Isabel', frequencyType: 'DAILY', timeBlock: 'ANY' },
    { name: 'Master bathroom quick maintenance', category: 'Bathroom', assignedTo: 'Celiane', frequencyType: 'DAILY', timeBlock: 'ANY' },
    { name: 'Social bathroom deep clean', category: 'Bathroom', assignedTo: 'Laura', frequencyType: 'WEEKLY', dayOfWeek: DAY.MON, timeBlock: 'ANY' },
    { name: 'Girls bathroom deep clean', category: 'Bathroom', assignedTo: 'Isabel', frequencyType: 'WEEKLY', dayOfWeek: DAY.WED, timeBlock: 'ANY' },
    { name: 'Master bathroom deep clean', category: 'Bathroom', assignedTo: 'Celiane', frequencyType: 'WEEKLY', dayOfWeek: DAY.FRI, timeBlock: 'ANY' },
    { name: "Change Penelope's litter", category: 'Pet Care', assignedTo: 'Laura', frequencyType: 'MONTHLY', weekOfMonth: 1, timeBlock: 'ANY' },
    { name: 'Groom pets', category: 'Pet Care', assignedTo: 'Isabel', frequencyType: 'MONTHLY', weekOfMonth: 2, timeBlock: 'ANY' },
    { name: 'Clean glass doors', category: 'Shared Areas', assignedTo: 'Nicholas', frequencyType: 'MONTHLY', weekOfMonth: 3, timeBlock: 'ANY' },
    { name: 'Clean breakfast area ceiling fan', category: 'Shared Areas', assignedTo: 'Laura', frequencyType: 'MONTHLY', weekOfMonth: 3, timeBlock: 'ANY' },
    { name: 'Clean and organize pantry', category: 'Kitchen', assignedTo: 'Celiane', frequencyType: 'MONTHLY', weekOfMonth: 4, timeBlock: 'ANY' },
    { name: 'Clean inside of fridge', category: 'Kitchen', assignedTo: 'Isabel', frequencyType: 'MONTHLY', weekOfMonth: 4, timeBlock: 'ANY' },
    { name: 'Change air filters', category: 'Household Maintenance', assignedTo: 'Nicholas', frequencyType: 'SEMIANNUAL', semiannualMonths: '[1,7]', timeBlock: 'ANY' },
    { name: 'Apply pesticides', category: 'Household Maintenance', assignedTo: 'Celiane', frequencyType: 'SEMIANNUAL', semiannualMonths: '[1,7]', timeBlock: 'ANY' },
    { name: 'Take out all trash: yard + recyclable + regular', category: 'Trash', assignedTo: 'Nicholas', frequencyType: 'CONDITIONAL_SCHEDULE', conditionalDayOfWeek: DAY.THU, conditionalAfterTime: '18:00', timeBlock: 'ANY' },
    { name: 'Take out regular trash for Tuesday pickup', category: 'Trash', assignedTo: 'Nicholas', frequencyType: 'CONDITIONAL_SCHEDULE', conditionalDayOfWeek: DAY.FRI, conditionalAfterTime: '21:00', timeBlock: 'NIGHT' },
    { name: 'Empty bedroom trash', category: 'Trash', assignedTo: 'Celiane', frequencyType: 'WEEKLY', dayOfWeek: DAY.TUE, timeBlock: 'NIGHT' },
    { name: 'Empty bedroom trash', category: 'Trash', assignedTo: 'Isabel', frequencyType: 'WEEKLY', dayOfWeek: DAY.TUE, timeBlock: 'NIGHT' },
    { name: 'Empty bedroom trash', category: 'Trash', assignedTo: 'Nicholas', frequencyType: 'WEEKLY', dayOfWeek: DAY.TUE, timeBlock: 'NIGHT' },
    { name: 'Empty bedroom trash', category: 'Trash', assignedTo: 'Laura', frequencyType: 'WEEKLY', dayOfWeek: DAY.TUE, timeBlock: 'NIGHT' },
  ];

  const existingCount = await prisma.taskTemplate.count();
  if (existingCount >= templates.length) {
    console.log('Chores seed: templates already present, skipping.');
  } else {
    await prisma.taskTemplate.deleteMany({});
    for (const t of templates) {
      const assignedToId = members[t.assignedTo as keyof typeof members].id;
      await prisma.taskTemplate.create({
        data: {
          name: t.name,
          category: t.category,
          assignedToId,
          frequencyType: t.frequencyType,
          dayOfWeek: 'dayOfWeek' in t ? t.dayOfWeek : null,
          weekOfMonth: 'weekOfMonth' in t ? t.weekOfMonth : null,
          semiannualMonths: 'semiannualMonths' in t ? t.semiannualMonths : null,
          conditionalDayOfWeek: 'conditionalDayOfWeek' in t ? t.conditionalDayOfWeek : null,
          conditionalAfterTime: 'conditionalAfterTime' in t ? t.conditionalAfterTime : null,
          timeBlock: t.timeBlock,
          pointsBase: 1,
          active: true,
        },
      });
    }
  }
  console.log('Chores seed: household members and task templates ready.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
