export type MinuteContent = {
  title: string;
  date: string;
  participants: string[];
  topics: string[];
  discussions: string[];
  decisions: string[];
  tasks: { task: string; owners: string[] }[];
  notes: string[];
};

export const emptyMinute = (title = "", date = ""): MinuteContent => ({
  title, date, participants: [], topics: [], discussions: [], decisions: [], tasks: [], notes: [],
});

export function normalizeMinute(x: any): MinuteContent {
  const arr = (v: any) => (Array.isArray(v) ? v.map((s) => String(s ?? "").trim()).filter(Boolean) : []);
  return {
    title: String(x?.title ?? ""),
    date: String(x?.date ?? ""),
    participants: arr(x?.participants),
    topics: arr(x?.topics),
    discussions: arr(x?.discussions),
    decisions: arr(x?.decisions),
    tasks: Array.isArray(x?.tasks)
      ? x.tasks.map((t: any) => ({ task: String(t?.task ?? "").trim(), owners: arr(t?.owners) })).filter((t: any) => t.task)
      : [],
    notes: arr(x?.notes),
  };
}
