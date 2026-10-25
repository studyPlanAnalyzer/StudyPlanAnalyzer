"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, ApiError } from "@/lib/api-client";
import { parseCsv } from "@/lib/utils/csv-parse";
import { CATEGORY_LABELS, Question, QuestionCategory, QuestionStatus } from "@/lib/types/daily-challenge";
import { GRADE_GROUP_LABELS, GradeGroup } from "@/lib/utils/grade-group";

const STATUS_TONE: Record<QuestionStatus, "weak" | "medium" | "strong" | "neutral"> = {
  PENDING: "medium",
  APPROVED: "strong",
  REJECTED: "weak",
  ARCHIVED: "neutral",
};

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gradeGroup, setGradeGroup] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | null>(null);
  const [showImport, setShowImport] = useState(false);

  const loadQuestions = useCallback(async () => {
    const params = new URLSearchParams();
    if (gradeGroup) params.set("gradeGroup", gradeGroup);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    try {
      const data = await api.get<{ questions: Question[] }>(`/api/admin/questions?${params.toString()}`);
      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load questions.");
    }
  }, [gradeGroup, category, status, search]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setSingleStatus(id: string, newStatus: QuestionStatus) {
    try {
      await api.put(`/api/admin/questions/${id}`, { status: newStatus });
      await loadQuestions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that question.");
    }
  }

  async function bulkSetStatus(newStatus: QuestionStatus) {
    if (selected.size === 0) return;
    try {
      await api.post("/api/admin/questions/bulk", { ids: Array.from(selected), status: newStatus });
      setSelected(new Set());
      await loadQuestions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk update failed.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Question bank</h1>
        <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
          {showImport ? "Hide import" : "Import questions"}
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {showImport && <ImportPanel onImported={loadQuestions} />}

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={gradeGroup}
            onChange={(e) => setGradeGroup(e.target.value)}
          >
            <option value="">All grade groups</option>
            <option value="GROUP_4_7">{GRADE_GROUP_LABELS.GROUP_4_7}</option>
            <option value="GROUP_8_10">{GRADE_GROUP_LABELS.GROUP_8_10}</option>
          </select>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <Input placeholder="Search question text" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2">
          <span className="text-sm text-indigo-800">{selected.size} selected</span>
          <Button size="sm" onClick={() => bulkSetStatus("APPROVED")}>
            Approve all
          </Button>
          <Button size="sm" variant="danger" onClick={() => bulkSetStatus("REJECTED")}>
            Reject all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => bulkSetStatus("ARCHIVED")}>
            Archive all
          </Button>
        </div>
      )}

      {questions === null && <p className="text-sm text-slate-400">Loading…</p>}

      {questions !== null && questions.length === 0 && (
        <EmptyState title="No questions match these filters" description="Try clearing a filter, or import a new batch." />
      )}

      {questions !== null && questions.length > 0 && (
        <div className="flex flex-col gap-3">
          {questions.map((q) => (
            <Card key={q.id} className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggleSelected(q.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                    <Badge tone="brand">{CATEGORY_LABELS[q.category]}</Badge>
                    <Badge tone="neutral">{GRADE_GROUP_LABELS[q.gradeGroup]}</Badge>
                    <span className="text-xs text-slate-400">{q.difficulty}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{q.questionText}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Options: {q.options.join(" · ")} — <span className="font-medium text-green-700">Correct: {q.correctAnswer}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Used {q.timesUsed}x{q.lastUsedAt ? ` · last used ${q.lastUsedAt}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-7">
                {q.status !== "APPROVED" && (
                  <Button size="sm" onClick={() => setSingleStatus(q.id, "APPROVED")}>
                    Approve
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setEditing(q)}>
                  Edit
                </Button>
                {q.status !== "REJECTED" && (
                  <Button size="sm" variant="danger" onClick={() => setSingleStatus(q.id, "REJECTED")}>
                    Reject
                  </Button>
                )}
                {q.status !== "ARCHIVED" && (
                  <Button size="sm" variant="ghost" onClick={() => setSingleStatus(q.id, "ARCHIVED")}>
                    Archive
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditQuestionModal
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadQuestions();
          }}
        />
      )}
    </main>
  );
}

function EditQuestionModal({
  question,
  onClose,
  onSaved,
}: {
  question: Question;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [questionText, setQuestionText] = useState(question.questionText);
  const [options, setOptions] = useState<string[]>([...question.options]);
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [category, setCategory] = useState<QuestionCategory>(question.category);
  const [gradeGroup, setGradeGroup] = useState<GradeGroup>(question.gradeGroup);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  async function handleSave() {
    if (!options.includes(correctAnswer)) {
      setError("Correct answer must exactly match one of the 4 options.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await api.put(`/api/admin/questions/${question.id}`, {
        questionText,
        options,
        correctAnswer,
        explanation: explanation || null,
        category,
        gradeGroup,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Edit question</h2>
        <div className="flex flex-col gap-3">
          <Input label="Question text" value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
          {options.map((opt, i) => (
            <Input key={i} label={`Option ${i + 1}`} value={opt} onChange={(e) => updateOption(i, e.target.value)} />
          ))}
          <Input label="Correct answer (must match an option exactly)" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
          <Input label="Explanation (optional)" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Category</label>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as QuestionCategory)}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Grade group</label>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={gradeGroup}
                onChange={(e) => setGradeGroup(e.target.value as GradeGroup)}
              >
                <option value="GROUP_4_7">{GRADE_GROUP_LABELS.GROUP_4_7}</option>
                <option value="GROUP_8_10">{GRADE_GROUP_LABELS.GROUP_8_10}</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              Save changes
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function importRows(rows: unknown[]) {
    setError(null);
    setMessage(null);
    setIsImporting(true);
    try {
      const data = await api.post<{ importedCount: number }>("/api/admin/questions/import", rows);
      setMessage(`Imported ${data.importedCount} question(s) as PENDING. Review and approve them below.`);
      setJsonText("");
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  function handleImportJson() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of question rows.");
      importRows(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON.");
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result));
        importRows(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't parse that CSV file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of question rows.");
        importRows(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't parse that JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-2 text-base font-semibold text-slate-900">Import questions</h2>
      <p className="mb-3 text-xs text-slate-500">
        Paste a JSON array (from an offline AI-generation pass) or upload a CSV. Expected columns/fields:{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">
          category, gradeGroup, difficulty, questionText, option1, option2, option3, option4, correctAnswer,
          explanation
        </code>
        . Everything imports as <strong>PENDING</strong> — nothing is visible to students until you approve it below.
      </p>

      <textarea
        className="mb-3 h-32 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
        placeholder='[{"category":"SCIENCE","gradeGroup":"GROUP_4_7","questionText":"...","option1":"...","option2":"...","option3":"...","option4":"...","correctAnswer":"..."}]'
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleImportJson} isLoading={isImporting} disabled={!jsonText.trim()}>
          Import pasted JSON
        </Button>
        <label className={clsx("cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50")}>
          Upload JSON file
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleJsonFile} />
        </label>
        <label className={clsx("cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50")}>
          Upload CSV file
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
    </Card>
  );
}
