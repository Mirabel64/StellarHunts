"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePuzzleContract } from "@/hooks/usePuzzleContract";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  getPuzzleAnswerOptions,
  getPuzzleAnswerType,
  validatePuzzleAnswer,
} from "@/lib/puzzle-answer";
import { ChainErrorBoundary } from "@/components/ChainErrorBoundary";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Lightbulb,
  ChevronRight,
  Trophy,
  AlertTriangle,
  Wallet,
  SendHorizonal,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// ───────────────────────────────────────────────────────────────
// Default puzzle data (used as a fallback / demo)
// ───────────────────────────────────────────────────────────────
const DEFAULT_PUZZLE = {
  id: 0,
  title: "Simple Math",
  puzzleNumber: 1,
  level: "Easy",
  levelReward: "StellarHunts Beginner NFT",
  question:
    "How many confirmations are typically recommended for Stellar / Soroban transactions before considering them final?",
  hint: "Soroban closes finalize within a few seconds on the Stellar network",
};

// ───────────────────────────────────────────────────────────────
// Level display config
// ───────────────────────────────────────────────────────────────
const LEVEL_CONFIG = {
  Easy: { color: "from-emerald-400 to-teal-500", badge: "success" },
  Medium: { color: "from-amber-400 to-orange-500", badge: "warning" },
  Difficult: { color: "from-rose-400 to-red-500", badge: "destructive" },
  Advanced: { color: "from-purple-400 to-violet-500", badge: "default" },
};

// ───────────────────────────────────────────────────────────────
// Feedback toast component
// ───────────────────────────────────────────────────────────────
const FeedbackToast = ({ feedback, onClose, prefersReducedMotion }) => {
  if (!feedback) return null;

  const isCorrect = feedback.correct;
  const Icon = isCorrect ? CheckCircle2 : XCircle;
  const borderColor = isCorrect
    ? "border-emerald-500/50"
    : "border-red-500/50";
  const bgGradient = isCorrect
    ? "from-emerald-500/10 to-emerald-500/5"
    : "from-red-500/10 to-red-500/5";
  const textColor = isCorrect ? "text-emerald-300" : "text-red-300";
  const glowColor = isCorrect
    ? "shadow-emerald-500/20"
    : "shadow-red-500/20";
  const animationClass = prefersReducedMotion
    ? ""
    : "animate-in slide-in-from-bottom-2 fade-in duration-300";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${borderColor} bg-gradient-to-br ${bgGradient} p-4 shadow-lg ${glowColor} ${animationClass}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 mt-0.5 rounded-full p-1.5 ${
            isCorrect ? "bg-emerald-500/20" : "bg-red-500/20"
          }`}
        >
          <Icon className={`h-5 w-5 ${textColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${textColor}`}>
            {isCorrect ? "Correct!" : "Incorrect"}
          </p>
          <p className="mt-0.5 text-sm text-gray-400">{feedback.message}</p>
        </div>
        {isCorrect && (
          <Sparkles className={`h-5 w-5 text-emerald-400/60 flex-shrink-0 ${prefersReducedMotion ? "" : "animate-pulse"}`} />
        )}
      </div>

      {/* Progress bar-like decorative line */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-0.5 ${
          isCorrect ? "bg-emerald-500/30" : "bg-red-500/30"
        }`}
      />
    </div>
  );
};

// ───────────────────────────────────────────────────────────────
// Progress bar for level completion
// ───────────────────────────────────────────────────────────────
const LevelProgressBar = ({ current, total }) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          Level Progress
        </span>
        <span>
          {current} / {total} puzzles
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
        {/* Animated gradient bar */}
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        >
          <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent ${prefersReducedMotion ? "" : "animate-shimmer"}`} />
        </div>
      </div>
      <p className="text-right text-[10px] text-gray-500">{percentage}% complete</p>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────
// Main PuzzleComponent
// ───────────────────────────────────────────────────────────────
const PuzzleComponent = ({
  puzzleData: externalPuzzle,
  questionId,
  onCorrectAnswer,
  levelProgress = { current: 0, total: 5 },
  contractOpts = {},
}) => {
  // Merge external data with fallback defaults
  const puzzle = externalPuzzle || DEFAULT_PUZZLE;
  const qId = questionId ?? puzzle.id ?? 0;
  const answerType = getPuzzleAnswerType(puzzle);
  const answerOptions = getPuzzleAnswerOptions(puzzle);
  const prefersReducedMotion = useReducedMotion();

  // ── Local state ───────────────────────────────────────────
  const [answer, setAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [tempHint, setTempHint] = useState(null); // shown while contract hint loads
  const [submitted, setSubmitted] = useState(false);
  const [answerError, setAnswerError] = useState("");
  const [attemptHistory, setAttemptHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const submitLock = useRef(false);

  // ── Contract hook ─────────────────────────────────────────
  const {
    submitting,
    hintLoading,
    error: contractError,
    feedback,
    lastHint,
    walletConnected,
    walletAddress,
    isExtensionInstalled,
    unsupportedNetwork,
    walletError,
    connectWallet,
    disconnectWallet,
    submitAnswer,
    requestHint,
    clearFeedback,
    checkWallet,
  } = usePuzzleContract(contractOpts);

  // Check wallet on mount
  useEffect(() => {
    checkWallet();
  }, [checkWallet]);

  useEffect(() => {
    setAnswer("");
    setSubmitted(false);
    setAnswerError("");
    clearFeedback();

    try {
      const stored = window.localStorage.getItem(
        `stellar-hunts:puzzle-attempts:${encodeURIComponent(String(qId))}`,
      );
      const parsedHistory = stored ? JSON.parse(stored) : [];
      if (
        !Array.isArray(parsedHistory) ||
        parsedHistory.some(
          (attempt) =>
            !attempt ||
            typeof attempt.answer !== "string" ||
            typeof attempt.correct !== "boolean" ||
            !Number.isFinite(Date.parse(attempt.submittedAt)),
        )
      ) {
        throw new Error("Stored attempt history is not a list.");
      }
      setAttemptHistory(parsedHistory);
      setHistoryError("");
    } catch {
      setAttemptHistory([]);
      setHistoryError("Attempt history could not be loaded from this browser.");
    }
  }, [qId, clearFeedback]);

  // ── Handlers ──────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault();
      if (submitLock.current || submitting) return;

      const validationError = validatePuzzleAnswer(answer, puzzle);
      if (validationError) {
        setAnswerError(validationError);
        return;
      }

      submitLock.current = true;
      setAnswerError("");
      setSubmitted(true);
      try {
        const normalizedAnswer = answer.trim();
        const result = await submitAnswer(qId, normalizedAnswer);

        if (result?.submitted) {
          const attempt = {
            answer: normalizedAnswer,
            correct: result.correct,
            submittedAt: new Date().toISOString(),
          };
          const nextHistory = [attempt, ...attemptHistory].slice(0, 20);
          setAttemptHistory(nextHistory);

          try {
            window.localStorage.setItem(
              `stellar-hunts:puzzle-attempts:${encodeURIComponent(String(qId))}`,
              JSON.stringify(nextHistory),
            );
            setHistoryError("");
          } catch {
            setHistoryError("Attempt history could not be saved in this browser.");
          }
        }

        if (result?.correct && onCorrectAnswer) {
          onCorrectAnswer(qId);
        }
      } finally {
        submitLock.current = false;
      }
    },
    [answer, attemptHistory, onCorrectAnswer, puzzle, qId, submitAnswer, submitting]
  );

  const handleHintToggle = useCallback(async () => {
    if (showHint) {
      setShowHint(false);
      return;
    }

    // If we already fetched the hint, just show it
    if (lastHint) {
      setShowHint(true);
      return;
    }

    // Try fetching from the contract; fall back to the puzzle's local hint
    try {
      const hint = await requestHint(qId);
      if (hint) {
        setTempHint(hint);
      }
    } catch {
      // Contract call failed — use local hint as fallback
      setTempHint(puzzle.hint);
    }
    setShowHint(true);
  }, [showHint, lastHint, requestHint, qId, puzzle.hint]);

  const handleAnswerChange = useCallback(
    (e) => {
      setAnswer(e.target.value);
      setAnswerError("");
      if (submitted) {
        setSubmitted(false);
        clearFeedback();
      }
    },
    [submitted, clearFeedback]
  );

  // The hint text to display (contract > local fallback)
  const displayHint = lastHint || tempHint || puzzle.hint;

  // ── Visual config ─────────────────────────────────────────
  const levelKey = puzzle.level || "Easy";
  const levelStyle = LEVEL_CONFIG[levelKey] || LEVEL_CONFIG.Easy;
  const isCorrect = feedback?.correct;

  return (
    <Card className="relative overflow-hidden backdrop-blur-xl bg-white/[0.07] border-white/10 text-white shadow-2xl transition-all duration-300 hover:shadow-purple-500/5">
      {/* Animated gradient orb decoration */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-gradient-to-tr from-blue-500/20 to-purple-500/10 blur-3xl" />

      {/* ── Header ─────────────────────────────────────────── */}
      <CardHeader className="relative z-10 space-y-3 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant={levelStyle.badge}
              className="px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            >
              {puzzle.level}
            </Badge>
            <span className="text-sm text-gray-400">
              Puzzle {puzzle.puzzleNumber}
            </span>
          </div>

          {/* Wallet indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${
                walletConnected ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-500"
              } transition-colors duration-300`}
            />
            <span className="text-[10px] mt-0.5 text-gray-400">
              {walletConnected
                ? `${walletAddress?.slice(0, 4)}…${walletAddress?.slice(-4)}`
                : "Wallet disconnected"}
            </span>
          </div>
        </div>

        <CardTitle className="text-lg font-bold text-white">
          {puzzle.title}
        </CardTitle>

        {puzzle.levelReward && (
          <CardDescription className="flex items-center gap-1.5 text-sm text-gray-400">
            <Trophy className="h-4 w-4 text-amber-400" />
            Level Reward:{" "}
            <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text font-medium text-transparent">
              {puzzle.levelReward}
            </span>
          </CardDescription>
        )}

        {/* Progress bar */}
        <LevelProgressBar
          current={levelProgress.current}
          total={levelProgress.total}
        />
      </CardHeader>

      {/* ── Content ────────────────────────────────────────── */}
      <CardContent className="relative z-10 space-y-5">
        {/* Question */}
        <div className="rounded-xl bg-white/[0.04] p-4 backdrop-blur-sm">
          <label
            htmlFor="puzzle-question"
            className="mb-2 block text-sm font-medium text-gray-300"
          >
            <span className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-purple-400" />
              Question
            </span>
          </label>
          <p
            id="puzzle-question"
            className="leading-relaxed text-gray-100"
          >
            {puzzle.question}
          </p>
        </div>

        {/* ── Input & Submit ───────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <label htmlFor="puzzle-answer" className="sr-only">
              Your answer
            </label>
            {answerType === "multiple_choice" ? (
              <select
                id="puzzle-answer"
                value={answer}
                onChange={handleAnswerChange}
                disabled={submitting || isCorrect}
                aria-invalid={Boolean(answerError)}
                aria-describedby={answerError ? "puzzle-answer-error" : undefined}
                className="h-12 w-full rounded-md border border-white/10 bg-[#201d42] px-3 text-white focus:border-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-400/30 disabled:opacity-50"
              >
                <option value="">Choose an answer…</option>
                {answerOptions.map((option, index) => (
                  <option key={`${index}-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : answerType === "code" ? (
              <Textarea
                id="puzzle-answer"
                placeholder="Enter your code answer…"
                value={answer}
                onChange={handleAnswerChange}
                disabled={submitting || isCorrect}
                maxLength={4096}
                aria-invalid={Boolean(answerError)}
                aria-describedby={answerError ? "puzzle-answer-error" : undefined}
                className="min-h-24 border-white/10 bg-white/[0.04] text-white placeholder:text-gray-400 focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/30"
              />
            ) : (
              <Input
                id="puzzle-answer"
                type="text"
                inputMode={answerType === "number" || answerType === "math" ? "decimal" : undefined}
                placeholder="Enter your answer…"
                value={answer}
                onChange={handleAnswerChange}
                disabled={submitting || isCorrect}
                maxLength={4096}
                aria-invalid={Boolean(answerError)}
                aria-describedby={answerError ? "puzzle-answer-error" : undefined}
                className="h-12 border-white/10 bg-white/[0.04] pr-12 text-white placeholder:text-gray-400 focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/30"
              />
            )}
            {answerType !== "multiple_choice" && answerType !== "code" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                {answer.length}
              </span>
            )}
            {answerError && (
              <p
                id="puzzle-answer-error"
                role="alert"
                className="mt-2 text-sm text-red-300"
              >
                {answerError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              disabled={submitting || isCorrect}
              className="group relative flex-1 overflow-hidden bg-gradient-to-r from-purple-500 to-pink-500 py-6 text-base font-semibold shadow-lg shadow-purple-500/25 transition-all duration-300 hover:from-purple-600 hover:to-pink-600 hover:shadow-purple-500/40 disabled:opacity-40"
            >
              <span className="flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <Loader2 className={`h-5 w-5 ${prefersReducedMotion ? "" : "animate-spin"}`} />
                    Verifying on-chain…
                  </>
                ) : isCorrect ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Solved!
                  </>
                ) : (
                  <>
                    <SendHorizonal className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    Submit Answer
                  </>
                )}
              </span>

              {/* Shine effect */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
            </Button>
          </div>
        </form>

        {/* ── Feedback ─────────────────────────────────────── */}
        <div className="min-h-[4rem]">
          {feedback && (
            <FeedbackToast feedback={feedback} prefersReducedMotion={prefersReducedMotion} />
          )}
          {contractError && !feedback && (
            <Alert
              variant="destructive"
              className="border-red-500/30 bg-red-500/10"
            >
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertDescription className="text-red-300">
                {contractError}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <section aria-labelledby="attempt-history-title" className="space-y-2">
          <h3 id="attempt-history-title" className="text-sm font-semibold text-gray-200">
            Attempt history
          </h3>
          {historyError && (
            <p role="alert" className="text-sm text-amber-200">
              {historyError}
            </p>
          )}
          {attemptHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No submitted attempts yet.</p>
          ) : (
            <ol className="space-y-2">
              {attemptHistory.map((attempt, index) => (
                <li
                  key={`${attempt.submittedAt}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 break-words text-gray-200">
                    {attempt.answer}
                  </span>
                  <span
                    className={attempt.correct ? "shrink-0 text-emerald-300" : "shrink-0 text-red-300"}
                  >
                    {attempt.correct ? "Correct" : "Incorrect"}
                  </span>
                  <time
                    className="shrink-0 text-xs text-gray-400"
                    dateTime={attempt.submittedAt}
                  >
                    {new Date(attempt.submittedAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── Footer actions ───────────────────────────────── */}
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Hint button */}
          <Button
            type="button"
            variant="outline"
            disabled={hintLoading || showHint}
            onClick={handleHintToggle}
            className="group border-white/10 bg-transparent text-gray-200 transition-all duration-300 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-300"
          >
            <span className="flex items-center gap-2">
              {hintLoading ? (
                <Loader2 className={`h-4 w-4 ${prefersReducedMotion ? "" : "animate-spin"}`} />
              ) : (
                <Lightbulb className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              )}
              {showHint ? "Hide Hint" : "Need a Hint?"}
            </span>
          </Button>

          {/* Show hint text */}
          {showHint && (
            <div className={`${prefersReducedMotion ? "" : "animate-in slide-in-from-top-2 fade-in duration-300"}`}>
              <div className="rounded-xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-orange-500/5 p-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                  <p className="text-sm leading-relaxed text-amber-200">
                    {hintLoading ? "Loading hint…" : displayHint}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Connect wallet CTA ───────────────────────────── */}
        {!walletConnected && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-center">
            <Wallet className="mx-auto mb-2 h-6 w-6 text-gray-500" />
            {isExtensionInstalled === false ? (
              <p className="text-sm text-gray-400">
                Freighter extension not detected. Install{" "}
                <a
                  className="text-amber-300 underline"
                  href="https://freighter.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Freighter
                </a>{" "}
                to connect your wallet and earn on-chain rewards.
              </p>
            ) : (
              <p className="text-sm text-gray-400">
                Connect your Freighter wallet to submit answers and earn on-chain rewards.
              </p>
            )}
            <button
              type="button"
              onClick={() => connectWallet()}
              disabled={isExtensionInstalled === false}
              className="mt-3 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {walletConnected && unsupportedNetwork && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200"
          >
            Unsupported network detected. Switch your Freighter network to match
            the app, then disconnect and reconnect below.
            <button
              type="button"
              onClick={() => disconnectWallet()}
              className="mt-2 block text-left text-xs underline"
            >
              Disconnect
            </button>
          </div>
        )}

        {walletError && !unsupportedNetwork && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-500/10 p-2 text-center text-sm text-red-300"
          >
            {walletError}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const PuzzleComponentWithBoundary = (props) => (
  <ChainErrorBoundary name="PuzzleComponent">
    <PuzzleComponent {...props} />
  </ChainErrorBoundary>
);

export { PuzzleComponent as PurePuzzleComponent };
export default PuzzleComponentWithBoundary;
