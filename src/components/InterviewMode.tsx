"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModeSelector } from "./ModeSelector";
import type { ChatMode } from "@/lib/chatModes";
import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_QUESTION_COUNTS,
  type InterviewDifficulty,
  type InterviewFeedback,
  type InterviewSummary,
  type InterviewTurn,
} from "@/lib/interview";

/** Distinct UI states of the interview flow. */
type Phase = "setup" | "asking" | "reviewing" | "done";

interface InterviewModeProps {
  /** Active chat mode (always "interview" here) — needed by the embedded selector. */
  mode: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
}

/** Thin fetch wrapper around POST /api/interview. */
async function postInterview<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Interview request failed (${res.status}).`;
    throw new Error(message);
  }
  return data as T;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/* ----------------------------- feedback styles ----------------------------- */

type ScoreTier = "high" | "mid" | "low";

const SCORE_STYLES: Record<ScoreTier, { text: string; wrap: string; bar: string }> = {
  high: {
    text: "text-emerald-600 dark:text-emerald-400",
    wrap: "border-emerald-400/40 bg-emerald-500/10",
    bar: "bg-emerald-500",
  },
  mid: {
    text: "text-amber-600 dark:text-amber-400",
    wrap: "border-amber-400/40 bg-amber-500/10",
    bar: "bg-amber-500",
  },
  low: {
    text: "text-red-600 dark:text-red-400",
    wrap: "border-red-400/40 bg-red-500/10",
    bar: "bg-red-500",
  },
};

function scoreTier(score: number): ScoreTier {
  if (score >= 8) return "high";
  if (score >= 5) return "mid";
  return "low";
}

/** One "what you got right / what was missing" bullet list. */
function FeedbackList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber";
}) {
  const dot = tone === "emerald" ? "✓" : "›";
  const dotClass =
    tone === "emerald" ? "text-emerald-500" : "text-amber-500";

  return (
    <div className="rounded-2xl border border-cream-300 dark:border-charcoal-750 bg-white dark:bg-charcoal-850 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-stone-700 dark:text-stone-200">
            <span className={`${dotClass} shrink-0 font-semibold`} aria-hidden>
              {dot}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Structured feedback card shown after each answer is graded. */
function FeedbackCard({ feedback }: { feedback: InterviewFeedback }) {
  const styles = SCORE_STYLES[scoreTier(feedback.score)];

  return (
    <div className="mt-5 space-y-3 animate-pop-in">
      <div className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${styles.wrap}`}>
        <div className={`text-2xl font-bold ${styles.text}`}>
          {feedback.score}
          <span className="text-sm font-medium opacity-70">/10</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            AI evaluation
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-cream-200 dark:bg-charcoal-800 overflow-hidden">
            <div
              className={`h-full ${styles.bar} transition-all duration-500`}
              style={{ width: `${feedback.score * 10}%` }}
            />
          </div>
        </div>
      </div>

      <FeedbackList title="What you got right" items={feedback.correct} tone="emerald" />
      <FeedbackList title="What was missing" items={feedback.missing} tone="amber" />

      <div className="rounded-2xl border border-warmorange-400/40 bg-warmorange-500/5 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-warmorange-600 dark:text-warmorange-400">
          💡 Improvement tip
        </p>
        <p className="mt-1 text-sm text-stone-700 dark:text-stone-200">{feedback.improvement}</p>
      </div>
    </div>
  );
}

/**
 * Interview Mode — a distinct UI state rendered inside the chat view.
 *
 * Flow: setup → one question at a time ("Question X / N") → structured
 * feedback after each answer → closing summary with an option to restart.
 * Owns its own answer composer (with the mode selector beside it).
 */
export function InterviewMode({ mode, onModeChange }: InterviewModeProps) {
  const [phase, setPhase] = useState<Phase>("setup");

  // Session configuration
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>("Intermediate");
  const [count, setCount] = useState<number>(5);

  // Live session state
  const [questionNumber, setQuestionNumber] = useState(1);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [summary, setSummary] = useState<InterviewSummary | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const topicRef = useRef<HTMLInputElement | null>(null);

  // Auto-grow the answer box (mirrors the chat composer)
  useEffect(() => {
    const el = answerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [answer, phase]);

  // Focus the right input as the flow advances
  useEffect(() => {
    if (phase === "asking") answerRef.current?.focus();
    if (phase === "setup") topicRef.current?.focus();
  }, [phase, questionNumber]);

  const startInterview = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const { question: firstQuestion } = await postInterview<{ question: string }>({
        action: "start",
        topic: trimmed,
        difficulty,
        count,
        questionNumber: 1,
        previousQuestions: [],
      });
      setQuestion(firstQuestion);
      setQuestionNumber(1);
      setAnswer("");
      setFeedback(null);
      setTurns([]);
      setSummary(null);
      setPhase("asking");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [topic, difficulty, count, isLoading]);

  const submitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed || isLoading || !question) return;

    setIsLoading(true);
    setError(null);
    try {
      const { feedback: result } = await postInterview<{ feedback: InterviewFeedback }>({
        action: "evaluate",
        topic: topic.trim(),
        difficulty,
        count,
        question,
        answer: trimmed,
      });
      setFeedback(result);
      setPhase("reviewing");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [answer, isLoading, question, topic, difficulty, count]);

  const goToNext = useCallback(async () => {
    if (isLoading || !feedback) return;

    const completedTurn: InterviewTurn = { question, answer: answer.trim(), feedback };
    const updatedTurns = [...turns, completedTurn];
    const isLastQuestion = questionNumber >= count;

    setIsLoading(true);
    setError(null);
    try {
      if (isLastQuestion) {
        const { summary: result } = await postInterview<{ summary: InterviewSummary }>({
          action: "summary",
          topic: topic.trim(),
          difficulty,
          count,
          turns: updatedTurns,
        });
        setTurns(updatedTurns);
        setSummary(result);
        setPhase("done");
      } else {
        const { question: nextQuestion } = await postInterview<{ question: string }>({
          action: "next",
          topic: topic.trim(),
          difficulty,
          count,
          questionNumber: questionNumber + 1,
          previousQuestions: updatedTurns.map((t) => t.question),
        });
        setTurns(updatedTurns);
        setQuestion(nextQuestion);
        setQuestionNumber(questionNumber + 1);
        setAnswer("");
        setFeedback(null);
        setPhase("asking");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, feedback, question, answer, turns, questionNumber, count, topic, difficulty]);

  const restart = useCallback(() => {
    setPhase("setup");
    setQuestion("");
    setQuestionNumber(1);
    setAnswer("");
    setFeedback(null);
    setTurns([]);
    setSummary(null);
    setError(null);
  }, []);

  const handleAnswerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitAnswer();
    }
  };

  const progressPercent = Math.round((questionNumber / Math.max(1, count)) * 100);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-cream-100 dark:bg-charcoal-900 transition-colors duration-300">
      {/* Scrollable interview body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-8">
        {/* ------------------------------- Setup ------------------------------- */}
        {phase === "setup" && (
          <div className="max-w-xl mx-auto w-full animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>🎤</span>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                Interview Mode
              </h2>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 mb-6 leading-relaxed">
              Pick a subject, difficulty and length. Aide asks one question at a time,
              scores each answer out of 10, and finishes with a summary of your strengths.
            </p>

            <label
              htmlFor="aide-interview-topic"
              className="block text-xs font-medium text-stone-600 dark:text-stone-300"
            >
              Subject / topic
            </label>
            <input
              id="aide-interview-topic"
              ref={topicRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  startInterview();
                }
              }}
              placeholder="e.g. JavaScript, System Design, …"
              className="mt-1.5 w-full bg-white dark:bg-charcoal-800 border border-cream-300 dark:border-charcoal-750 rounded-xl px-3.5 py-2.5 text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none focus:border-warmorange-400 focus:ring-2 focus:ring-warmorange-400/20 transition"
            />

            <p className="mt-5 text-xs font-medium text-stone-600 dark:text-stone-300">Difficulty</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {INTERVIEW_DIFFICULTIES.map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`px-3.5 py-2 text-xs rounded-full border transition ${
                    difficulty === level
                      ? "border-warmorange-400 bg-warmorange-500/10 text-warmorange-600 dark:text-warmorange-400 font-medium"
                      : "border-cream-300 dark:border-charcoal-750 text-stone-600 dark:text-stone-300 hover:border-warmorange-400"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <p className="mt-5 text-xs font-medium text-stone-600 dark:text-stone-300">
              Number of questions
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {INTERVIEW_QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`px-3.5 py-2 text-xs rounded-full border transition ${
                    count === n
                      ? "border-warmorange-400 bg-warmorange-500/10 text-warmorange-600 dark:text-warmorange-400 font-medium"
                      : "border-cream-300 dark:border-charcoal-750 text-stone-600 dark:text-stone-300 hover:border-warmorange-400"
                  }`}
                >
                  {n} questions
                </button>
              ))}
            </div>

            {error && (
              <div className="mt-5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-300 text-xs">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={startInterview}
              disabled={!topic.trim() || isLoading}
              className="mt-6 w-full py-2.5 rounded-xl bg-warmorange-500 hover:bg-warmorange-600 disabled:opacity-40 disabled:hover:bg-warmorange-500 text-white text-sm font-medium transition shadow-sm"
            >
              {isLoading ? "Generating first question…" : "Start Interview"}
            </button>
          </div>
        )}

        {/* --------------------------- Question / review --------------------------- */}
        {(phase === "asking" || phase === "reviewing") && (
          <div className="max-w-2xl mx-auto w-full">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-warmorange-600 dark:text-warmorange-400">
                Question {questionNumber} / {count}
              </span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500 truncate max-w-[55%]">
                {topic} · {difficulty}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 rounded-full bg-cream-200 dark:bg-charcoal-800 overflow-hidden mb-5">
              <div
                className="h-full bg-warmorange-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="rounded-2xl border border-cream-300 dark:border-charcoal-750 bg-white dark:bg-charcoal-850 px-5 py-4 shadow-sm">
              <p className="text-sm leading-relaxed text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
                {question}
              </p>
            </div>

            {phase === "reviewing" && feedback && (
              <>
                <FeedbackCard feedback={feedback} />
                <div className="mt-4 rounded-2xl border border-cream-300 dark:border-charcoal-750 bg-cream-50 dark:bg-charcoal-850 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    Your answer
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300 whitespace-pre-wrap">
                    {answer}
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-300 text-xs">
                ⚠️ {error}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------- Summary ------------------------------- */}
        {phase === "done" && summary && (
          <div className="max-w-2xl mx-auto w-full animate-fade-in">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border-4 border-warmorange-400/40 bg-warmorange-500/10">
                <div className="text-center leading-none">
                  <div className="text-2xl font-bold text-warmorange-600 dark:text-warmorange-400">
                    {summary.overallScore}
                  </div>
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">/ 10</div>
                </div>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-stone-900 dark:text-stone-100">
                Interview complete
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                {count} questions · {topic} · {difficulty}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Strongest area
                </p>
                <p className="mt-1 text-sm text-stone-700 dark:text-stone-200">
                  {summary.strongestArea}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Area to improve
                </p>
                <p className="mt-1 text-sm text-stone-700 dark:text-stone-200">
                  {summary.areaToImprove}
                </p>
              </div>
            </div>

            {summary.note && (
              <p className="mt-3 text-xs italic text-stone-500 dark:text-stone-400 text-center">
                {summary.note}
              </p>
            )}

            {turns.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  Question recap
                </p>
                {turns.map((turn, i) => (
                  <details
                    key={i}
                    className="rounded-xl border border-cream-300 dark:border-charcoal-750 bg-white dark:bg-charcoal-850 px-3.5 py-2.5"
                  >
                    <summary className="flex items-center justify-between gap-3 cursor-pointer text-xs text-stone-700 dark:text-stone-200">
                      <span className="truncate">
                        Q{i + 1}. {turn.question}
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${
                          SCORE_STYLES[scoreTier(turn.feedback.score)].text
                        }`}
                      >
                        {turn.feedback.score}/10
                      </span>
                    </summary>
                    <p className="mt-2 text-xs text-stone-600 dark:text-stone-300 whitespace-pre-wrap">
                      {turn.answer}
                    </p>
                  </details>
                ))}
              </div>
            )}

            <button
              onClick={restart}
              className="mt-6 w-full py-2.5 rounded-xl bg-warmorange-500 hover:bg-warmorange-600 text-white text-sm font-medium transition shadow-sm"
            >
              Start new interview
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar: mode selector + answer composer / next button */}
      <div className="shrink-0 border-t border-cream-300 dark:border-charcoal-800 bg-cream-50/90 dark:bg-charcoal-900/90 backdrop-blur-sm px-3 sm:px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="mb-1.5">
            <ModeSelector mode={mode} onModeChange={onModeChange} />
          </div>

          {phase === "asking" ? (
            <div className="flex items-end gap-2 bg-white dark:bg-charcoal-800 border border-cream-300 dark:border-charcoal-750 focus-within:border-warmorange-400 focus-within:ring-2 focus-within:ring-warmorange-400/20 rounded-3xl shadow-sm px-3.5 sm:px-4 py-2 transition">
              <textarea
                id="aide-interview-answer"
                ref={answerRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleAnswerKeyDown}
                placeholder="Type your answer… (Enter to submit, Shift+Enter for a new line)"
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs sm:text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 outline-none resize-none overflow-y-auto max-h-[160px] py-1.5 leading-relaxed"
              />
              <button
                onClick={submitAnswer}
                disabled={!answer.trim() || isLoading}
                className="shrink-0 px-3.5 py-2 rounded-full bg-warmorange-500 hover:bg-warmorange-600 disabled:opacity-40 disabled:hover:bg-warmorange-500 text-white text-xs font-medium transition"
              >
                {isLoading ? "Evaluating…" : "Submit Answer"}
              </button>
            </div>
          ) : phase === "reviewing" ? (
            <button
              onClick={goToNext}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-warmorange-500 hover:bg-warmorange-600 disabled:opacity-40 disabled:hover:bg-warmorange-500 text-white text-sm font-medium transition shadow-sm"
            >
              {isLoading
                ? "Preparing…"
                : questionNumber >= count
                ? "See Summary →"
                : "Next Question →"}
            </button>
          ) : (
            <p className="text-[10px] text-stone-400 dark:text-stone-500 text-center select-none py-1.5">
              {phase === "setup"
                ? "Choose a topic above, then start the interview."
                : "Session complete — start a new interview to keep practising."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}