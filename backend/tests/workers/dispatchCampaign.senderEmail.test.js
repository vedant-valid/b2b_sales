import { jest } from "@jest/globals";
import { prisma } from "../../lib/prisma.js";
import { runDispatchJob, __setInstantlyImpl } from "../../workers/dispatchCampaign.js";
import { createUser } from "../helpers/factory.js";
import { resetDb } from "../setup.js";
import { stopBoss } from "../../lib/pgboss.js";

afterAll(async () => { await stopBoss(); });
beforeEach(resetDb);

test("dispatch uses campaign.senderEmail when set", async () => {
  const { user } = await createUser({ role: "MANAGER" });
  const campaign = await prisma.campaign.create({
    data: {
      name: "Test",
      rawGoal: "test",
      extractedFilters: {},
      createdById: user.id,
      senderEmail: "alice@nstx.co.in"
    }
  });
  await prisma.lead.create({
    data: {
      firstName: "John", lastName: "Doe", email: "john@acme.com",
      campaignId: campaign.id,
      emails: { create: { subject: "Hi", body: "Hello", status: "DRAFT" } }
    }
  });

  let capturedEmailList;
  __setInstantlyImpl({
    createCampaign: async (_name, opts) => {
      capturedEmailList = opts.senderEmails;
      return { instantlyCampaignId: "instantly_abc" };
    },
    pushLeads: async () => ({ accepted: 1, rejected: [] }),
    activateCampaign: async () => {}
  });

  await runDispatchJob({ data: { campaignId: campaign.id } });
  expect(capturedEmailList).toEqual(["alice@nstx.co.in"]);
});

test("dispatch falls back to env var when campaign.senderEmail is null", async () => {
  const { user } = await createUser({ role: "MANAGER", email: "mgr@x.com" });
  const campaign = await prisma.campaign.create({
    data: {
      name: "Old Campaign",
      rawGoal: "test",
      extractedFilters: {},
      createdById: user.id,
      senderEmail: null
    }
  });
  await prisma.lead.create({
    data: {
      firstName: "Jane", lastName: "Smith", email: "jane@acme.com",
      campaignId: campaign.id,
      emails: { create: { subject: "Hi", body: "Hello", status: "DRAFT" } }
    }
  });

  let capturedEmailList;
  __setInstantlyImpl({
    createCampaign: async (_name, opts) => {
      capturedEmailList = opts.senderEmails;
      return { instantlyCampaignId: "instantly_xyz" };
    },
    pushLeads: async () => ({ accepted: 1, rejected: [] }),
    activateCampaign: async () => {}
  });

  await runDispatchJob({ data: { campaignId: campaign.id } });
  // senderEmails is undefined when no campaign.senderEmail and no env var set in test
  expect(capturedEmailList).toBeUndefined();
});
