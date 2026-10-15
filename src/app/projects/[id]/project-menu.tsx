"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions";

export function ProjectMenu({ projectId }: { projectId: number }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-mist">Удалить проект со всеми шагами?</span>
      <button className="btn btn-sm btn-danger" onClick={() => deleteProjectAction(projectId)}>Удалить</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Отмена</button>
    </div>
  ) : (
    <button className="btn btn-ghost btn-sm text-fog" onClick={() => setConfirm(true)}><Trash2 size={14} />Удалить</button>
  );
}
