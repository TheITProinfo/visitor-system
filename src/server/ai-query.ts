import "server-only";

import { prisma } from "@/server/db";
import { callAi, parseAiJson, AiProviderError } from "@/server/ai-provider";
import { getLocalDateRange, getLocalDayRange } from "@/server/dates";
import type { UserRole } from "@/generated/prisma/client";

const ALLOWED_ROLES: UserRole[] = ["ADMINISTRATOR", "RECEPTIONIST"];
const MAX_QUERY_LENGTH = 500;
const MAX_RANGE_DAYS = 90;

type Intent = {
  intent: "today_arrivals" | "date_range_stats" | "not_checked_out" | "filter_visits" | "clarify" | "unsupported";
  dateFrom?: string;
  dateTo?: string;
  host?: string;
  purpose?: string;
  question?: string;
};

export type AiQueryResult = {
  kind: "records" | "stats" | "clarify" | "unsupported";
  message: string;
  count?: number;
  from?: string;
  to?: string;
  breakdown?: Array<{ label: string; arrivals: number; open: number }>;
  rows?: Array<{
    id: string;
    visitorName: string;
    host: string;
    purpose: string;
    checkedInAt: string;
    checkedOutAt: string | null;
  }>;
  inputTokens: number;
  outputTokens: number;
};

export class AiQueryError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "AiQueryError";
  }
}

function safeTimeZone(value: string | undefined) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value || "UTC" }).format();
    return value || "UTC";
  } catch {
    return "UTC";
  }
}

function currentLocalDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateRange(from: string | undefined, to: string | undefined, timeZone: string) {
  if (!from || !to) return null;
  const start = getLocalDateRange(from, timeZone);
  const endDay = getLocalDateRange(to, timeZone);
  if (!start || !endDay || from > to) return null;
  const days = Math.round((endDay.start.getTime() - start.start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > MAX_RANGE_DAYS) return null;
  return { start: start.start, end: endDay.end, days };
}

function queryHasSensitiveIdentifier(question: string, visitorNames: string[]) {
  const withoutDates = question.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(withoutDates)) return true;
  if (/(?:\+?\d[\d ().-]{7,}\d)/.test(withoutDates)) return true;
  const normalized = withoutDates.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return visitorNames.some((name) => {
    const normalizedName = name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!normalizedName || normalizedName.length < 3) return false;
    return (` ${normalized} `).includes(` ${normalizedName} `);
  });
}

function parseIntent(text: string) {
  const value = parseAiJson<Intent>(text);
  if (!value || typeof value !== "object" ||
      !["today_arrivals", "date_range_stats", "not_checked_out", "filter_visits", "clarify", "unsupported"].includes(value.intent)) {
    throw new AiProviderError("ai-invalid-response");
  }
  return value;
}

function rowsForDisplay(rows: Array<{
  id: string;
  visitorFullName: string;
  hostNameSnapshot: string;
  purposeNameSnapshot: string;
  checkedInAt: Date;
  checkedOutAt: Date | null;
}>) {
  return rows.map((visit) => ({
    id: visit.id,
    visitorName: visit.visitorFullName,
    host: visit.hostNameSnapshot,
    purpose: visit.purposeNameSnapshot,
    checkedInAt: visit.checkedInAt.toISOString(),
    checkedOutAt: visit.checkedOutAt?.toISOString() ?? null,
  }));
}

function monthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function nextMonthUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function runAiQuery(user: { id: string; role: UserRole }, rawQuestion: string): Promise<AiQueryResult> {
  if (!ALLOWED_ROLES.includes(user.role)) throw new AiQueryError("ai-forbidden", 403);
  const question = rawQuestion.trim();
  if (!question || question.length > MAX_QUERY_LENGTH) throw new AiQueryError("ai-invalid-question", 400);

  const settings = await prisma.companySettings.findFirst({
    select: {
      id: true, timeZone: true, aiProvider: true, aiEndpoint: true, aiModel: true,
      aiApiKeyEncrypted: true, aiEnabled: true, aiPausedUntil: true,
      aiRequestsPerUserPerDay: true, aiMaxTokensPerMonth: true,
    },
  });
  if (!settings?.aiEnabled || !settings.aiProvider || !settings.aiModel || !settings.aiApiKeyEncrypted) {
    throw new AiQueryError("ai-disabled", 503);
  }
  const now = new Date();
  if (settings.aiPausedUntil && settings.aiPausedUntil > now) throw new AiQueryError("ai-usage-paused", 429);

  const recentRequests = await prisma.aiAuditEvent.count({
    where: { userId: user.id, operation: "assistant-query", createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
  });
  if (recentRequests >= settings.aiRequestsPerUserPerDay) throw new AiQueryError("ai-user-limit", 429);

  const month = monthStartUtc(now);
  const usage = await prisma.aiAuditEvent.aggregate({
    where: { createdAt: { gte: month } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  const usedTokens = (usage._sum.inputTokens || 0) + (usage._sum.outputTokens || 0);
  const estimatedTokens = Math.ceil(question.length / 4) + 600;
  if (usedTokens + estimatedTokens > settings.aiMaxTokensPerMonth) {
    await prisma.companySettings.update({ where: { id: settings.id }, data: { aiPausedUntil: nextMonthUtc(now) } });
    throw new AiQueryError("ai-usage-paused", 429);
  }

  const profiles = await prisma.visitorProfile.findMany({ select: { fullName: true } });
  if (queryHasSensitiveIdentifier(question, profiles.map((profile) => profile.fullName))) {
    await prisma.aiAuditEvent.create({
      data: { settingsId: settings.id, userId: user.id, operation: "assistant-query", success: false, errorCode: "visitor-identifier-blocked" },
    });
    throw new AiQueryError("ai-visitor-search-unavailable", 400);
  }

  const timeZone = safeTimeZone(settings.timeZone);
  const localToday = currentLocalDate(timeZone);
  const event = await prisma.aiAuditEvent.create({
    data: { settingsId: settings.id, userId: user.id, operation: "assistant-query", success: false, errorCode: "request-in-progress" },
  });

  let inputTokens = 0;
  let outputTokens = 0;
  let filters: Record<string, string | number> | undefined;
  try {
    const call = await callAi(settings, [
      "You are a query planner for a visitor-management system. Return exactly one JSON object with keys intent, dateFrom, dateTo, host, purpose, question.",
      "Allowed intents: today_arrivals, date_range_stats, not_checked_out, filter_visits, clarify, unsupported.",
      "Never search by visitor name, visitor email, phone, company, vehicle, signature, or photo. Never request or produce visitor personal details. Visitor-name lookup is unsupported and must not be forwarded.",
      "This system supports read-only operational queries only. Do not invent fields or claim that any data has been checked.",
      "Use ISO YYYY-MM-DD dates in the company's timezone. If a date range is needed but missing or unclear, use clarify. Do not exceed 90 days.",
      "For filter_visits, use host for a staff person's name and purpose for a configured visit purpose. If the host or purpose is unclear, use clarify.",
      "For clarify, provide a concise question. For unsupported, provide a concise explanation.",
      `Company timezone: ${timeZone}. Today's local date: ${localToday}.`,
    ].join("\n"), question);
    inputTokens = call.inputTokens;
    outputTokens = call.outputTokens;
    const intent = parseIntent(call.text);

    if (intent.intent === "clarify") {
      await prisma.aiAuditEvent.update({ where: { id: event.id }, data: { success: true, errorCode: null, inputTokens, outputTokens, filters: { intent: "clarify" } } });
      return { kind: "clarify", message: intent.question?.slice(0, 240) || "What date range or filter should I use?", inputTokens, outputTokens };
    }
    if (intent.intent === "unsupported") {
      await prisma.aiAuditEvent.update({ where: { id: event.id }, data: { success: true, errorCode: null, inputTokens, outputTokens, filters: { intent: "unsupported" } } });
      return { kind: "unsupported", message: intent.question?.slice(0, 240) || "I can help with operational visitor counts and records. Use Visitor records for name searches.", inputTokens, outputTokens };
    }

    const commonSelect = {
      id: true, visitorFullName: true, hostNameSnapshot: true, purposeNameSnapshot: true,
      checkedInAt: true, checkedOutAt: true,
    } as const;
    const finish = async (result: AiQueryResult, filterValues: Record<string, string | number>, resultCount: number) => {
      await prisma.aiAuditEvent.update({
        where: { id: event.id },
        data: { success: true, errorCode: null, filters: filterValues, resultCount, inputTokens, outputTokens },
      });
      return result;
    };

    if (intent.intent === "today_arrivals") {
      const range = getLocalDayRange(now, timeZone);
      const where = { checkedInAt: { gte: range.start, lt: range.end } };
      const [rows, total] = await Promise.all([
        prisma.visitRecord.findMany({ where, orderBy: { checkedInAt: "desc" }, take: 50, select: commonSelect }),
        prisma.visitRecord.count({ where }),
      ]);
      filters = { intent: intent.intent, dateFrom: localToday, dateTo: localToday };
      return finish({
        kind: "records", message: `There were ${total} arrivals today. Showing up to 50 records.`,
        count: total, from: localToday, to: localToday, rows: rowsForDisplay(rows), inputTokens, outputTokens,
      }, filters, total);
    }

    if (intent.intent === "not_checked_out") {
      const [rows, total] = await Promise.all([
        prisma.visitRecord.findMany({ where: { checkedOutAt: null }, orderBy: { checkedInAt: "desc" }, take: 50, select: commonSelect }),
        prisma.visitRecord.count({ where: { checkedOutAt: null } }),
      ]);
      filters = { intent: intent.intent };
      return finish({
        kind: "records", message: `${total} visitor records have no checkout time. Showing up to 50 records.`,
        count: total, rows: rowsForDisplay(rows), inputTokens, outputTokens,
      }, filters, total);
    }

    const dates = dateRange(intent.dateFrom, intent.dateTo, timeZone);
    if (!dates) {
      await prisma.aiAuditEvent.update({
        where: { id: event.id },
        data: { success: true, errorCode: null, inputTokens, outputTokens, filters: { intent: intent.intent } },
      });
      return { kind: "clarify", message: "Choose a valid date range of up to 90 days.", inputTokens, outputTokens };
    }

    if (intent.intent === "date_range_stats") {
      const dateLabels: string[] = [];
      for (let date = intent.dateFrom!; date <= intent.dateTo!;) {
        dateLabels.push(date);
        const next = new Date(`${date}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        date = next.toISOString().slice(0, 10);
      }
      const daily = await Promise.all(dateLabels.map(async (label) => {
        const day = getLocalDateRange(label, timeZone)!;
        const where = { checkedInAt: { gte: day.start, lt: day.end } };
        const [arrivals, open] = await Promise.all([
          prisma.visitRecord.count({ where }),
          prisma.visitRecord.count({ where: { ...where, checkedOutAt: null } }),
        ]);
        return { label, arrivals, open };
      }));
      const total = daily.reduce((sum, day) => sum + day.arrivals, 0);
      const openTotal = daily.reduce((sum, day) => sum + day.open, 0);
      const breakdown = daily;
      filters = { intent: intent.intent, dateFrom: intent.dateFrom!, dateTo: intent.dateTo! };
      return finish({
        kind: "stats", message: `${total} arrivals from ${intent.dateFrom} to ${intent.dateTo}; ${openTotal} have no checkout time.`,
        count: total, from: intent.dateFrom, to: intent.dateTo, breakdown, inputTokens, outputTokens,
      }, filters, total);
    }

    if (intent.intent === "filter_visits") {
      let hostId: string | undefined;
      let hostLabel: string | undefined;
      if (intent.host) {
        const hosts = await prisma.user.findMany({
          where: { status: "ACTIVE", role: { in: ["ADMINISTRATOR", "RECEPTIONIST", "EMPLOYEE"] } },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
        const target = intent.host.trim().toLocaleLowerCase();
        const matches = hosts.filter((host) => `${host.firstName || ""} ${host.lastName || ""}`.trim().toLocaleLowerCase() === target || host.email.toLocaleLowerCase() === target);
        if (matches.length !== 1) {
          await prisma.aiAuditEvent.update({ where: { id: event.id }, data: { success: true, errorCode: null, filters: { intent: intent.intent, dateFrom: intent.dateFrom!, dateTo: intent.dateTo! }, inputTokens, outputTokens } });
          return { kind: "clarify", message: matches.length ? "More than one host matches. Please use the Visitor records filters." : "I couldn't match that host. Check the name in Visitor records.", inputTokens, outputTokens };
        }
        hostId = matches[0].id;
        hostLabel = `${matches[0].firstName || ""} ${matches[0].lastName || ""}`.trim();
      }
      let purposeId: string | undefined;
      let purposeLabel: string | undefined;
      if (intent.purpose) {
        const purpose = await prisma.visitPurpose.findFirst({ where: { isActive: true, name: { equals: intent.purpose.trim(), mode: "insensitive" } }, select: { id: true, name: true } });
        if (!purpose) {
          await prisma.aiAuditEvent.update({ where: { id: event.id }, data: { success: true, errorCode: null, filters: { intent: intent.intent, dateFrom: intent.dateFrom!, dateTo: intent.dateTo! }, inputTokens, outputTokens } });
          return { kind: "clarify", message: "I couldn't match that visit purpose. Check the configured purposes or use Visitor records.", inputTokens, outputTokens };
        }
        purposeId = purpose.id;
        purposeLabel = purpose.name;
      }
      if (!hostId && !purposeId) {
        await prisma.aiAuditEvent.update({ where: { id: event.id }, data: { success: true, errorCode: null, filters: { intent: intent.intent, dateFrom: intent.dateFrom!, dateTo: intent.dateTo! }, inputTokens, outputTokens } });
        return { kind: "clarify", message: "Specify a host or visit purpose to filter.", inputTokens, outputTokens };
      }
      const where = { checkedInAt: { gte: dates.start, lt: dates.end }, ...(hostId ? { hostId } : {}), ...(purposeId ? { purposeId } : {}) };
      const [rows, total] = await Promise.all([
        prisma.visitRecord.findMany({ where, orderBy: { checkedInAt: "desc" }, take: 50, select: commonSelect }),
        prisma.visitRecord.count({ where }),
      ]);
      filters = { intent: intent.intent, dateFrom: intent.dateFrom!, dateTo: intent.dateTo!, ...(hostId ? { hostId } : {}), ...(purposeId ? { purposeId } : {}) };
      const labels = [hostLabel, purposeLabel].filter(Boolean).join(" · ");
      return finish({
        kind: "records", message: `${total} matching visits for ${labels} from ${intent.dateFrom} to ${intent.dateTo}. Showing up to 50 records.`,
        count: total, from: intent.dateFrom, to: intent.dateTo, rows: rowsForDisplay(rows), inputTokens, outputTokens,
      }, filters, total);
    }

    throw new AiProviderError("ai-invalid-response");
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : "ai-query-failed";
    await prisma.aiAuditEvent.update({
      where: { id: event.id },
      data: { success: false, errorCode: code, inputTokens, outputTokens, filters },
    });
    if (error instanceof AiProviderError) throw new AiQueryError(error.code, error.code === "ai-not-configured" ? 503 : 502);
    throw new AiQueryError("ai-query-failed", 502);
  }
}
