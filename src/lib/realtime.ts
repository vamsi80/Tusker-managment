import { EventEmitter } from "events";

export const teamEvents = new EventEmitter();

export const TEAM_UPDATE = "team_update";

export type TeamEventData = {
    workspaceId: string;
    type: "INVITE" | "DELETE" | "UPDATE";
    payload: any;
};

export const broadcastTeamUpdate = (data: TeamEventData) => {
    teamEvents.emit(TEAM_UPDATE, data);
};
