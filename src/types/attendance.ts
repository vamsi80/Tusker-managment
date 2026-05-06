import { AttendanceStatus } from "@/generated/prisma/client";

export interface CheckInParams {
    workspaceId: string;
    userId: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    networkLocation?: string;
}

export interface CheckOutParams {
    workspaceId: string;
    userId: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    networkLocation?: string;
}

export interface AttendanceFilters {
    memberId?: string;
    status?: AttendanceStatus;
}

export interface UpdateSettingsParams {
    lateThreshold: string;
    overtimeThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
    sickLeaveLimit?: number;
    casualLeaveAccrualDays?: number;
    publicHolidays?: { name: string; date: string }[];
    attendanceLocations?: {
        id?: string;
        name: string;
        address?: string;
        latitude: number;
        longitude: number;
        radius: number;
    }[];
}
