export type TaskStatus = "todo" | "in_progress" | "complete";

export type RelayResource = {
  id: string;
  title: string;
  url: string;
  type: "link" | "doc" | "slides" | "video";
};

export type RelayTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDateText: string;
  source: string;
};

export type RelayDraft = {
  id: string;
  title: string;
  date: string;
  context: string;
  minutes: string;
  recap: string;
  resources: RelayResource[];
  questions: string[];
  tasks: RelayTask[];
  createdAt: string;
  updatedAt: string;
};

export type RelayDraftInput = {
  title: string;
  date: string;
  context: string;
  resources: string;
  questions: string;
  dueDates: string;
  minutes: string;
};
