/**
 * auth/models/history.model.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resilient Data Access Layer for user scan history.
 * Stores scan reports tied to user_id in Supabase DB with in-memory fallback.
 */

import { db } from "../config/supabase.js";

export interface ScanReportRecord {
  id: string;
  user_id: string;
  report: any;
  created_at: string;
}

// In-Memory Fallback Store (per user)
const memoryUserHistory = new Map<string, any[]>();

function isTableMissingError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    error.code === "PGRST202" ||
    error.code === "42P01"
  );
}

export const HistoryModel = {
  /**
   * Save a scan report for a specific user.
   */
  async saveUserReport(userId: string, report: any): Promise<void> {
    if (!userId) return;

    try {
      const { error } = await db()
        .from("user_history")
        .insert({
          id: report.id || `report-${Date.now()}`,
          user_id: userId,
          report,
          created_at: report.timestamp || new Date().toISOString(),
        });

      if (error) {
        if (isTableMissingError(error)) {
          console.warn("[HistoryModel] Table 'user_history' missing in Supabase, using in-memory store.");
        } else {
          console.warn("[HistoryModel] Supabase insert error:", error.message);
        }
        // Save to in-memory store
        const userReports = memoryUserHistory.get(userId) || [];
        memoryUserHistory.set(userId, [report, ...userReports.filter((r) => r.id !== report.id)]);
      } else {
        // Also sync in-memory for instant fast lookups
        const userReports = memoryUserHistory.get(userId) || [];
        memoryUserHistory.set(userId, [report, ...userReports.filter((r) => r.id !== report.id)]);
      }
    } catch (e: any) {
      console.warn("[HistoryModel] Exception saving report, fallback to memory:", e?.message || e);
      const userReports = memoryUserHistory.get(userId) || [];
      memoryUserHistory.set(userId, [report, ...userReports.filter((r) => r.id !== report.id)]);
    }
  },

  /**
   * Fetch scan history ONLY for a specific user (enforcing user isolation).
   */
  async getUserReports(userId: string): Promise<any[]> {
    if (!userId) return [];

    try {
      const { data, error } = await db()
        .from("user_history")
        .select("report")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        if (!isTableMissingError(error)) {
          console.warn("[HistoryModel] Supabase select error:", error.message);
        }
        return memoryUserHistory.get(userId) || [];
      }

      if (data && data.length > 0) {
        const dbReports = data.map((d: any) => d.report).filter(Boolean);
        // Combine with any memory-only reports
        const memReports = memoryUserHistory.get(userId) || [];
        const combinedMap = new Map<string, any>();
        dbReports.forEach((r: any) => combinedMap.set(r.id, r));
        memReports.forEach((r: any) => { if (!combinedMap.has(r.id)) combinedMap.set(r.id, r); });
        return Array.from(combinedMap.values());
      }

      return memoryUserHistory.get(userId) || [];
    } catch (e: any) {
      console.warn("[HistoryModel] Exception fetching reports, fallback to memory:", e?.message || e);
      return memoryUserHistory.get(userId) || [];
    }
  },

  /**
   * Delete a scan report owned by a specific user.
   */
  async deleteUserReport(userId: string, reportId: string): Promise<boolean> {
    if (!userId || !reportId) return false;

    // Delete from memory store
    const userReports = memoryUserHistory.get(userId) || [];
    memoryUserHistory.set(
      userId,
      userReports.filter((r) => r.id !== reportId),
    );

    try {
      const { error } = await db()
        .from("user_history")
        .delete()
        .eq("id", reportId)
        .eq("user_id", userId);

      if (error && !isTableMissingError(error)) {
        console.warn("[HistoryModel] Supabase delete error:", error.message);
      }
      return true;
    } catch (e: any) {
      console.warn("[HistoryModel] Exception deleting report:", e?.message || e);
      return true;
    }
  },
};
