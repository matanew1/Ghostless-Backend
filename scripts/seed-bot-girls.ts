import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Gender, PacePreference, PrismaClient, Zone } from '../generated/prisma/client';

type BotSeed = {
  email: string;
  googleId: string;
  displayName: string;
  bio: string;
  tags: string[];
  pacePreference: PacePreference;
  zone: Zone;
  rts: number;
  eds: number;
  gi: number;
  reciprocity: number;
  avatarImg: number;
};

async function fetchAvatarBase64(imgIndex: number): Promise<string> {
  const res = await fetch(`https://i.pravatar.cc/300?img=${imgIndex}`);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

const BOT_GIRLS: BotSeed[] = [
  {
    email: 'lina.bot@ghostless.seed',
    googleId: 'seed-bot-girl-lina',
    displayName: 'Lina',
    bio: 'Warm replies, dry humor, and late-night music loops.',
    tags: ['Music', 'Humor', 'Night owl', 'Coffee', 'Movies'],
    pacePreference: PacePreference.BALANCED,
    zone: Zone.STEADY,
    rts: 0.62,
    eds: 0.72,
    gi: 0.06,
    reciprocity: 0.86,
    avatarImg: 1,
  },
  {
    email: 'maya.bot@ghostless.seed',
    googleId: 'seed-bot-girl-maya',
    displayName: 'Maya',
    bio: 'Quick, curious, and always up for playful questions.',
    tags: ['Travel', 'Foodie', 'Tech', 'Deep talks', 'Fitness'],
    pacePreference: PacePreference.FAST,
    zone: Zone.SPARK,
    rts: 0.88,
    eds: 0.81,
    gi: 0.03,
    reciprocity: 0.9,
    avatarImg: 5,
  },
  {
    email: 'noa.bot@ghostless.seed',
    googleId: 'seed-bot-girl-noa',
    displayName: 'Noa',
    bio: 'Thoughtful voice notes energy, minus the voice notes.',
    tags: ['Books', 'Art', 'Philosophy', 'Cooking', 'Pets'],
    pacePreference: PacePreference.SLOW,
    zone: Zone.CHILL,
    rts: 0.38,
    eds: 0.78,
    gi: 0.08,
    reciprocity: 0.82,
    avatarImg: 9,
  },
  {
    email: 'tali.bot@ghostless.seed',
    googleId: 'seed-bot-girl-tali',
    displayName: 'Tali',
    bio: 'Fast replies, clean jokes, and weekend adventure planning.',
    tags: ['Outdoors', 'Sports', 'Travel', 'Coffee', 'Fashion'],
    pacePreference: PacePreference.FAST,
    zone: Zone.PULSE,
    rts: 0.82,
    eds: 0.54,
    gi: 0.05,
    reciprocity: 0.74,
    avatarImg: 12,
  },
  {
    email: 'ella.bot@ghostless.seed',
    googleId: 'seed-bot-girl-ella',
    displayName: 'Ella',
    bio: 'Balanced pace, thoughtful check-ins, and very serious snack opinions.',
    tags: ['Gaming', 'Anime', 'Movies', 'Foodie', 'Humor'],
    pacePreference: PacePreference.BALANCED,
    zone: Zone.STEADY,
    rts: 0.57,
    eds: 0.68,
    gi: 0.04,
    reciprocity: 0.88,
    avatarImg: 16,
  },
];

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

async function main() {
  const prisma = createClient();

  try {
    for (const bot of BOT_GIRLS) {
      const avatarData = await fetchAvatarBase64(bot.avatarImg);

      const user = await prisma.user.upsert({
        where: { googleId: bot.googleId },
        create: {
          email: bot.email,
          googleId: bot.googleId,
        },
        update: {
          email: bot.email,
        },
      });

      await prisma.userProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          displayName: bot.displayName,
          bio: bot.bio,
          tags: bot.tags,
          pacePreference: bot.pacePreference,
          gender: Gender.FEMALE,
          seekingGenders: [Gender.MALE],
          onboardingComplete: true,
          avatarData,
        },
        update: {
          displayName: bot.displayName,
          bio: bot.bio,
          tags: bot.tags,
          pacePreference: bot.pacePreference,
          gender: Gender.FEMALE,
          seekingGenders: [Gender.MALE],
          onboardingComplete: true,
          avatarData,
        },
      });

      await prisma.userMetrics.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          rts: bot.rts,
          eds: bot.eds,
          gi: bot.gi,
          reciprocity: bot.reciprocity,
          compositeScore: bot.rts + bot.eds + bot.reciprocity - bot.gi,
          zone: bot.zone,
          totalMessages: 24,
        },
        update: {
          rts: bot.rts,
          eds: bot.eds,
          gi: bot.gi,
          reciprocity: bot.reciprocity,
          compositeScore: bot.rts + bot.eds + bot.reciprocity - bot.gi,
          zone: bot.zone,
          totalMessages: 24,
        },
      });

      console.log(`Seeded ${bot.displayName} (${bot.zone}) seeking men`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
