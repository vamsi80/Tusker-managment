import { AttendanceStatus } from "@tusker/db";

export interface CheckInParams {
    workspaceId: string;
    userId: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    address?: string;
    city?: string;
    networkLocation?: string;
    notes?: string;
}

export interface CheckOutParams {
    workspaceId: string;
    userId: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    address?: string;
    city?: string;
    networkLocation?: string;
    notes?: string;
}

export interface AttendanceFilters {
    memberId?: string;
    status?: AttendanceStatus;
    search?: string;
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
