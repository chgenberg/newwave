export const WS_COOKIE = "nw_ws";
export const WS_MAX_AGE = 60 * 60 * 24 * 30;
/** Parametern i delade länkar som tar med sig avsändarens demomiljö. */
export const DEMO_PARAM = "demo";

export const isWorkspaceId = (id: string | undefined): id is string => !!id && /^[a-z0-9]{16,40}$/.test(id);

export const withDemo = (path: string, ws: string | null | undefined) => (ws ? `${path}${path.includes("?") ? "&" : "?"}${DEMO_PARAM}=${ws}` : path);
