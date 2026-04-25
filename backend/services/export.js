import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";

const SENTIMENT_PRIORITY = { INTERESTED: 0, CONVERTIBLE: 1, NEUTRAL: 2, NOT_INTERESTED: 3 };

const STATUS_LABEL = {
  INTERESTED:     "Interested",
  CONVERTIBLE:    "Convertible",
  NEUTRAL:        "Neutral",
  NOT_INTERESTED: "Not Interested"
};

const ACTION_LABEL = {
  INTERESTED:     "Call Now",
  CONVERTIBLE:    "Follow Up",
  NEUTRAL:        "Monitor",
  NOT_INTERESTED: "Do Not Call"
};

const ROW_FILL = {
  INTERESTED:     { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } },
  CONVERTIBLE:    { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1ECF1" } },
  NEUTRAL:        { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FA" } },
  NOT_INTERESTED: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } }
};

function daysSince(date) {
  if (!date) return "";
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function monthYear(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

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

  // Sort: replied leads by priority first, then unreplied
  leads.sort((a, b) => {
    const pa = SENTIMENT_PRIORITY[a.replies[0]?.sentiment] ?? 99;
    const pb = SENTIMENT_PRIORITY[b.replies[0]?.sentiment] ?? 99;
    return pa - pb;
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");

  const HEADERS = [
    "Channel", "Date", "Month, Year",
    "First Name", "Last Name", "Email",
    "Company Name", "Status", "Campaign Name",
    "Step", "Reply", "Job Title",
    "Lead Age (In Days)", "Action", "Follow-Up Draft",
    "LinkedIn URL", "Phone Number", "Seniority", "City"
  ];

  ws.columns = [
    { width: 10 }, { width: 14 }, { width: 18 },
    { width: 16 }, { width: 16 }, { width: 32 },
    { width: 22 }, { width: 18 }, { width: 30 },
    { width: 8  }, { width: 50 }, { width: 28 },
    { width: 16 }, { width: 18 }, { width: 40 },
    { width: 36 }, { width: 18 }, { width: 14 }, { width: 16 }
  ];

  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF212529" } };
    cell.alignment = { vertical: "middle", wrapText: false };
  });
  ws.getRow(1).height = 20;

  for (const l of leads) {
    const sentiment   = l.replies[0]?.sentiment;
    const sentAt      = l.emails[0]?.sentAt;
    const replyDate   = l.replies[0]?.receivedAt;
    const displayDate = replyDate || sentAt;

    const row = ws.addRow([
      "Email",
      displayDate ? new Date(displayDate).toLocaleDateString("en-IN") : "",
      monthYear(displayDate),
      l.firstName,
      l.lastName,
      l.email || "",
      l.company || "",
      STATUS_LABEL[sentiment] || l.status,
      l.campaign?.name || "",
      l.emails[0]?.version || "",
      l.replies[0]?.body || "",
      l.title || "",
      daysSince(l.createdAt),
      ACTION_LABEL[sentiment] || "",
      l.replies[0]?.draftFollowUp || "",
      l.linkedinUrl || "",
      l.phone || "",
      l.seniority || "",
      l.location || ""
    ]);

    if (ROW_FILL[sentiment]) {
      row.eachCell((cell) => { cell.fill = ROW_FILL[sentiment]; });
    }
  }

  return await wb.xlsx.writeBuffer();
}
