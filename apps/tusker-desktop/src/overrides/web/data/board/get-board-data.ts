/** Desktop stand-in for apps/web/src/data/board/get-board-data.ts: BoardService.getBoardData on the API, same shape. */
import { api } from "../../lib/desktop-api";

export const getBoardData = (workspaceId: string) => api<any>("/board", { query: { workspaceId } });
