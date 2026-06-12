import { apiFetch } from "./fetch-wrapper";
import { type ApiResponse } from "./types";

/**
 * Reports API Client
 * Replaces legacy Server Actions in @/actions/daily-report
 */
export const reportsClient = {
  /**
   * Get paginated reports with filters
   */
  getReports: async (params: {
    workspaceId: string;
    date?: string;
    userId?: string;
    skip?: number;
    take?: number;
  }): Promise<ApiResponse> => {
    const query = new URLSearchParams();
    if (params.date) query.append("date", params.date);
    if (params.userId) query.append("userId", params.userId);
    if (params.skip) query.append("skip", params.skip.toString());
    if (params.take) query.append("take", params.take.toString());

    const response = await apiFetch<{ success: boolean; data: unknown }>(
      `/reports/${params.workspaceId}?${query.toString()}`
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Reports fetched successfully" : "Failed to fetch reports",
      data: response.data,
    };
  },

  /**
   * Get detailed entries for a specific report
   */
  getReportEntries: async (workspaceId: string, reportId: string): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; data: unknown }>(
      `/reports/${workspaceId}/entries/${reportId}`
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Entries fetched successfully" : "Failed to fetch entries",
      data: response.data,
    };
  },

  /**
   * Get today's report status for the current user
   */
  getStatus: async (workspaceId: string): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; data: unknown }>(
      `/reports/${workspaceId}/status`
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Status fetched" : "Failed to fetch status",
      data: response.data,
    };
  },

  /**
   * Get data for report form
   */
  getFormData: async (workspaceId: string): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; data: unknown }>(
      `/reports/${workspaceId}/form-data`
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Form data fetched" : "Failed to fetch form data",
      data: response.data,
    };
  },

  /**
   * Submit a daily report
   */
  submitReport: async (values: { workspaceId: string } & Record<string, unknown>): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; data: unknown }>(
      `/reports/${values.workspaceId}`,
      {
        method: "POST",
        body: JSON.stringify(values),
      }
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Report submitted successfully" : "Failed to submit report",
      data: response.data,
    };
  },
};
