export const WS_COOKIE = "nw_ws";
export const WS_MAX_AGE = 60 * 60 * 24 * 30;

export const isWorkspaceId = (id: string | undefined): id is string => !!id && /^[a-z0-9]{16,40}$/.test(id);
