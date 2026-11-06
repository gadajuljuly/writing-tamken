export type TaskItem = {
  id: number; kind: "file" | "image" | "link" | "suggestion"; label: string; url: string; body: string;
  file_id: number | null; file_name: string | null; mime: string | null;
};

export type Task = {
  id: number; competition: string; axis: number; title: string; description: string; assignees: string[];
  status: "not_started" | "in_progress" | "done"; notes: string; proposal_approved: boolean;
  decision_minute_id: number | null; decision_minute_title: string | null;
  source_minute_id: number | null; source_minute_title: string | null;
  created_at: string; completed_at: string | null; items: TaskItem[];
};
