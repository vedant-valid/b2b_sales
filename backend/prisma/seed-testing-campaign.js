import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAMPAIGN_NAME = "Testing";

const LEADS = [
  { firstName: "Tanmay",  lastName: "Pandya",  email: "tanmay.pandya@nstx.co.in",      title: "Team Member", company: "Newton School" },
  { firstName: "Lokesh",  lastName: "Tiwari",  email: "lokesh.tiwari@nstx.co.in",      title: "Team Member", company: "Newton School" },
  { firstName: "Akshata", lastName: "Athani",  email: "akshata.athani@nstx.co.in",     title: "Team Member", company: "Newton School" },
  { firstName: "Kritika", lastName: "Jain",    email: "kritika.jain@newtonschool.co",   title: "Team Member", company: "Newton School" },
  { firstName: "Shweta",  lastName: "Khanna",  email: "shweta.khanna@nstx.co.in",      title: "Team Member", company: "Newton School" },
];

function buildEmail(firstName) {
  const subject = "Campaign Automation Test | Vedant Madne";
  const body = `Hi ${firstName},

This is a quick test email as part of a campaign automation demo built by Vedant Madne.

We are validating the end-to-end outreach pipeline — lead enrichment, AI-based email generation, and dispatch via Instantly.ai. No action needed on your end; this is purely to confirm delivery and pipeline functionality.

Thanks for being part of the demo!

- Vedant`;
  return { subject, body };
}

async function main() {
  // Find the admin user
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user found. Run seed.js first.");
  console.log(`[seed-testing] Using admin: ${admin.email}`);

  // Idempotent: skip if campaign already exists
  const existing = await prisma.campaign.findFirst({ where: { name: CAMPAIGN_NAME } });
  if (existing) {
    console.log(`[seed-testing] Campaign "${CAMPAIGN_NAME}" already exists (id: ${existing.id}), skipping.`);
    return;
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: CAMPAIGN_NAME,
      rawGoal: "Demo campaign — manual leads only, no Lusha fetch needed",
      extractedFilters: {},
      mode: "TEST",
      status: "AWAITING_EMAIL_APPROVAL",
      createdById: admin.id,
    },
  });
  console.log(`[seed-testing] Created campaign "${CAMPAIGN_NAME}" (id: ${campaign.id})`);

  for (const lead of LEADS) {
    const personId = `testing-manual-${lead.email}`;
    const created = await prisma.lead.create({
      data: {
        lushaPersonId: personId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        title: lead.title,
        company: lead.company,
        campaignId: campaign.id,
      },
    });

    const { subject, body } = buildEmail(lead.firstName);
    await prisma.email.create({
      data: {
        leadId: created.id,
        subject,
        body,
        version: 1,
        status: "DRAFT",
      },
    });

    console.log(`[seed-testing]  + ${lead.firstName} ${lead.lastName} <${lead.email}>`);
  }

  console.log(`\n[seed-testing] Done. Campaign is in AWAITING_EMAIL_APPROVAL — go approve in the UI to dispatch.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
