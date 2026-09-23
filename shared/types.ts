export type Role = "admin" | "judge";
export type ContestStatus = "draft" | "open" | "closed";
export interface User {
  id: string;
  username: string;
  name: string;
  title?: string;
  roles: Role[];
  active: boolean;
}
export interface Team {
  id: string;
  order: number;
  name: string;
  photo: string;
  members: { name: string; department: string }[];
}
export interface Contest {
  id: string;
  title: string;
  status: ContestStatus;
  roster: string[];
  revision: number;
}
export interface Score {
  teamId: string;
  score: number;
  comment: string;
  version: number;
  updatedAt: string;
}
export interface Criterion {
  name: string;
  weight: number;
  question: string;
  bands: { range: string; text: string }[];
  guidance: string[];
}
export interface SessionInfo {
  user: User;
  csrfToken: string;
}
export interface Workspace {
  contest: Contest;
  teams: Team[];
  scores: Score[];
  criteria: Criterion[];
  eligible: boolean;
}
export interface SubmitScore {
  score: number;
  comment: string;
  expectedVersion: number;
  requestId: string;
}
export interface ResultRow {
  team: Team;
  scores: Record<string, Score | null>;
  count: number;
  sumUnits: number;
  average: number | null;
  rank: number | null;
  missing: string[];
}
export interface Results {
  contest: Contest;
  judges: { id: string; name: string; active: boolean }[];
  rows: ResultRow[];
  total: number;
  expected: number;
  updatedAt: string;
}
export interface AuditEvent {
  id: number;
  actorId: string;
  actorName: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}
