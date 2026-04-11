import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";

export async function generateLeadsXlsx(filters = {}) {
  const where = {};
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      campaign: true,
      replies: { orderBy: { receivedAt: "desc" }, take: 1 },
      emails: { where: { status: "SENT" }, orderBy: { sentAt: "desc" }, take: 1 }
    },
    orderBy: { createdAt: "desc" }
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow(["Name", "Company", "Title", "Email", "Status", "Sentiment", "Campaign", "Contacted At", "Reply Body"]);

  for (const l of leads) {
    ws.addRow([
      `${l.firstName} ${l.lastName}`,
      l.company || "",
      l.title || "",
      l.email || "",
      l.status,
      l.replies[0]?.sentiment || "",
      l.campaign?.name || "",
      l.emails[0]?.sentAt ? new Date(l.emails[0].sentAt).toISOString() : "",
      l.replies[0]?.body || ""
    ]);
  }

  return await wb.xlsx.writeBuffer();
}
