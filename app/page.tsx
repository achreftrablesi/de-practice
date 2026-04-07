"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WordData, Article, Level } from "@/lib/gemini";

const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

const ARTICLE_COLORS: Record<Article, string> = {
  die: "#e879f9",
  der: "#60a5fa",
  das: "#34d399",
};

const LOADING_MESSAGES = [
  "Wörter suchen…",
  "Einen Moment…",
  "Fast fertig…",
  "Gleich geht's los…",
];

const STORAGE_KEYS = {
  streak: "ddd_streak",
  bestStreak: "ddd_best_streak",
  seenWords: "ddd_seen_words",
  level: "ddd_level",
};

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

type Phase = "playing" | "correct" | "wrong" | "loading" | "error";

interface SessionStats {
  correct: number;
  wrong: number;
  bestStreak: number;
}

function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex flex-col items-center">
        {/* Bunny */}
        <div className="bunny-hop text-6xl select-none">🐰</div>
        {/* Shadow */}
        <div
          className="bunny-shadow mt-1 w-10 h-2 rounded-full"
          style={{ background: "rgba(255,255,255,0.1)" }}
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-zinc-400 text-sm">{message}</p>
        <div className="flex gap-1.5">
          <div className="dot1 w-2 h-2 rounded-full bg-zinc-500" />
          <div className="dot2 w-2 h-2 rounded-full bg-zinc-500" />
          <div className="dot3 w-2 h-2 rounded-full bg-zinc-500" />
        </div>
      </div>
    </div>
  );
}

function SessionSummary({
  stats,
  streak,
  allTimeBest,
  level,
  onClose,
}: {
  stats: SessionStats;
  streak: number;
  allTimeBest: number;
  level: Level;
  onClose: () => void;
}) {
  const total = stats.correct + stats.wrong;
  const pct = total === 0 ? 0 : Math.round((stats.correct / total) * 100);

  const emoji =
    pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📚";
  const message =
    pct >= 90
      ? "Ausgezeichnet! Du bist ein Profi!"
      : pct >= 70
      ? "Sehr gut! Weiter so!"
      : pct >= 50
      ? "Guter Anfang! Übe weiter!"
      : "Nicht aufgeben – Übung macht den Meister!";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-3xl p-8 flex flex-col items-center gap-6">
        <div className="text-5xl">{emoji}</div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white mb-1">
            Sitzungsergebnis
          </p>
          <p className="text-sm text-zinc-500">Level {level}</p>
        </div>

        {/* Big accuracy */}
        <div className="w-full bg-zinc-800 rounded-2xl p-5 text-center">
          <div
            className="text-6xl font-bold mb-1"
            style={{
              color: pct >= 70 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#f87171",
            }}
          >
            {pct}%
          </div>
          <p className="text-zinc-400 text-sm">Genauigkeit</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 w-full">
          <div className="bg-zinc-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-400">
              {stats.correct}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Richtig</div>
          </div>
          <div className="bg-zinc-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.wrong}</div>
            <div className="text-xs text-zinc-500 mt-1">Falsch</div>
          </div>
          <div className="bg-zinc-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-white">{total}</div>
            <div className="text-xs text-zinc-500 mt-1">Gesamt</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          <div className="bg-zinc-800 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-orange-400">
              🔥 {stats.bestStreak}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Beste Serie</div>
          </div>
          <div className="bg-zinc-800 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-yellow-400">
              🏆 {allTimeBest}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Rekord</div>
          </div>
        </div>

        <p className="text-zinc-400 text-sm text-center italic">{message}</p>

        <button
          onClick={onClose}
          className="w-full py-4 rounded-2xl font-semibold text-lg bg-white text-black hover:bg-zinc-200 active:scale-95 transition-all"
        >
          Neue Runde →
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [level, setLevel] = useState<Level>("A1");
  const [queue, setQueue] = useState<WordData[]>([]);
  const [current, setCurrent] = useState<WordData | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [chosen, setChosen] = useState<Article | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [seenWords, setSeenWords] = useState<string[]>([]);
  const [cardKey, setCardKey] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [showDefinition, setShowDefinition] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ correct: 0, wrong: 0, bestStreak: 0 });
  const [showSummary, setShowSummary] = useState(false);
  const fetchedForLevel = useRef<Level | null>(null);
  const msgInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Streak resets every session — only best streak persists
    setStreak(0);
    saveStorage(STORAGE_KEYS.streak, 0);
    setBestStreak(loadStorage(STORAGE_KEYS.bestStreak, 0));
    setSeenWords(loadStorage(STORAGE_KEYS.seenWords, []));
    setLevel(loadStorage(STORAGE_KEYS.level, "A1") as Level);
  }, []);

  // Cycle loading messages
  useEffect(() => {
    if (phase === "loading") {
      let i = 0;
      msgInterval.current = setInterval(() => {
        i = (i + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[i]);
      }, 1800);
    }
    return () => {
      if (msgInterval.current) clearInterval(msgInterval.current);
    };
  }, [phase]);

  const fetchBatch = useCallback(
    async (lvl: Level, seen: string[], size = 10) => {
      if (isFetching) return;
      setIsFetching(true);
      try {
        const res = await fetch("/api/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: lvl, seenWords: seen, batchSize: size }),
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        return data.words as WordData[];
      } finally {
        setIsFetching(false);
      }
    },
    [isFetching]
  );

  useEffect(() => {
    if (fetchedForLevel.current === level) return;
    fetchedForLevel.current = level;

    setPhase("loading");
    setQueue([]);
    setCurrent(null);

    const load = (attempt: number) => {
      fetchBatch(level, seenWords, 5).then((words) => {
        if (!words || words.length === 0) {
          if (attempt < 2) {
            setTimeout(() => load(attempt + 1), 1000);
          } else {
            setPhase("error");
          }
          return;
        }
        const [first, ...rest] = words;
        setCurrent(first);
        setQueue(rest);
        setPhase("playing");
        setCardKey((k) => k + 1);
      });
    };
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const advance = useCallback(() => {
    setChosen(null);
    setShowDefinition(false);

    if (queue.length === 0) {
      setPhase("loading");
      fetchBatch(level, seenWords).then((words) => {
        if (!words || words.length === 0) {
          setPhase("error");
          return;
        }
        const [first, ...rest] = words;
        setCurrent(first);
        setQueue(rest);
        setPhase("playing");
        setCardKey((k) => k + 1);
      });
      return;
    }

    // Pre-fetch when 3 words remain
    if (queue.length <= 3 && !isFetching) {
      fetchBatch(level, seenWords).then((words) => {
        if (words) setQueue((q) => [...q, ...words]);
      });
    }

    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
    setPhase("playing");
    setCardKey((k) => k + 1);
  }, [queue, level, seenWords, fetchBatch, isFetching]);

  const handleAnswer = useCallback(
    (picked: Article) => {
      if (!current || phase !== "playing") return;
      setChosen(picked);

      const newSeen = [...seenWords, current.word];
      setSeenWords(newSeen);
      saveStorage(STORAGE_KEYS.seenWords, newSeen);

      if (picked === current.article) {
        const newStreak = streak + 1;
        const newBest = Math.max(newStreak, bestStreak);
        setStreak(newStreak);
        setBestStreak(newBest);
        saveStorage(STORAGE_KEYS.streak, newStreak);
        saveStorage(STORAGE_KEYS.bestStreak, newBest);
        setSessionStats((s) => ({
          ...s,
          correct: s.correct + 1,
          bestStreak: Math.max(s.bestStreak, newStreak),
        }));
        setPhase("correct");
      } else {
        setStreak(0);
        saveStorage(STORAGE_KEYS.streak, 0);
        setSessionStats((s) => ({ ...s, wrong: s.wrong + 1 }));
        setPhase("wrong");
      }
    },
    [current, phase, streak, bestStreak, seenWords]
  );

  const handleLevelChange = (newLevel: Level) => {
    if (newLevel === level) return;
    fetchedForLevel.current = null;
    saveStorage(STORAGE_KEYS.level, newLevel);
    setLevel(newLevel);
  };

  const handleEnd = () => setShowSummary(true);

  const handleNewRound = () => {
    setShowSummary(false);
    setSessionStats({ correct: 0, wrong: 0, bestStreak: 0 });
    fetchedForLevel.current = null;
    handleLevelChange(level);
    // trigger re-fetch even if same level
    setPhase("loading");
    setQueue([]);
    setCurrent(null);
    fetchBatch(level, seenWords, 5).then((words) => {
      if (!words || words.length === 0) { setPhase("error"); return; }
      const [first, ...rest] = words;
      setCurrent(first);
      setQueue(rest);
      setPhase("playing");
      setCardKey((k) => k + 1);
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase === "playing") {
        if (e.key === "1") handleAnswer("die");
        if (e.key === "2") handleAnswer("der");
        if (e.key === "3") handleAnswer("das");
      } else if (phase === "correct" || phase === "wrong") {
        if (e.key === "Enter" || e.key === " ") advance();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, handleAnswer, advance]);

  const total = sessionStats.correct + sessionStats.wrong;
  const pct = total === 0 ? null : Math.round((sessionStats.correct / total) * 100);

  const articleStyle = (art: Article) => ({
    borderColor:
      phase !== "playing" && chosen === art
        ? phase === "correct" ? "#22c55e" : "#ef4444"
        : phase !== "playing" && current?.article === art
        ? "#22c55e"
        : "#2d2d2d",
    backgroundColor:
      phase !== "playing" && chosen === art
        ? phase === "correct" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"
        : phase !== "playing" && current?.article === art
        ? "rgba(34,197,94,0.08)"
        : "transparent",
    color:
      phase !== "playing" && chosen === art
        ? phase === "correct" ? "#22c55e" : "#ef4444"
        : phase !== "playing" && current?.article === art
        ? "#22c55e"
        : ARTICLE_COLORS[art],
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-4 max-w-md mx-auto">
      {showSummary && (
        <SessionSummary
          stats={sessionStats}
          streak={streak}
          allTimeBest={bestStreak}
          level={level}
          onClose={handleNewRound}
        />
      )}

      {/* Header */}
      <div className="w-full flex items-center justify-between pt-2 pb-4">
        <div className="flex items-center gap-3">
          {/* Streak */}
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {streak > 0 ? "🔥" : "💤"} {streak}
            </div>
            <div className="text-xs text-zinc-500">Serie</div>
          </div>
          {/* Session accuracy */}
          {pct !== null && (
            <div className="text-center">
              <div
                className="text-lg font-semibold"
                style={{
                  color: pct >= 70 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#f87171",
                }}
              >
                {pct}%
              </div>
              <div className="text-xs text-zinc-600">{total} Wörter</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Level selector */}
          <div className="flex gap-1">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => handleLevelChange(l)}
                className="px-2 py-1 rounded text-xs font-semibold transition-all"
                style={{
                  background: l === level ? "#3f3f3f" : "transparent",
                  color: l === level ? "#fff" : "#666",
                  border: l === level ? "1px solid #555" : "1px solid transparent",
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {/* End button */}
          {total > 0 && (
            <button
              onClick={handleEnd}
              className="px-3 py-1 rounded text-xs font-semibold border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
            >
              Ende
            </button>
          )}
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 w-full flex flex-col items-center justify-center gap-6">
        {phase === "loading" && <LoadingSpinner message={loadingMsg} />}

        {phase === "error" && (
          <div className="text-center text-red-400">
            <p className="text-xl mb-2">Fehler beim Laden</p>
            <p className="text-sm text-zinc-500 mb-4">
              Prüfe deinen API-Key in .env.local
            </p>
            <button
              onClick={() => {
                fetchedForLevel.current = null;
                handleLevelChange(level);
              }}
              className="px-4 py-2 bg-zinc-800 rounded-lg text-white text-sm"
            >
              Nochmal versuchen
            </button>
          </div>
        )}

        {current && phase !== "loading" && phase !== "error" && (
          <div key={cardKey} className="w-full flex flex-col items-center gap-6">
            <div
              className={`w-full rounded-2xl p-8 text-center border transition-all duration-300 ${
                phase === "correct"
                  ? "border-green-500/40 bg-green-500/5"
                  : phase === "wrong"
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div
                className={`text-4xl font-bold tracking-wide mb-2 ${
                  phase === "correct"
                    ? "text-green-400"
                    : phase === "wrong"
                    ? "text-red-400"
                    : "text-white"
                }`}
              >
                {phase !== "playing" && (
                  <span
                    className="mr-2 text-3xl"
                    style={{ color: ARTICLE_COLORS[current.article] }}
                  >
                    {current.article}
                  </span>
                )}
                {current.word}
              </div>

              {phase !== "playing" && (
                <div className="mt-4 space-y-3">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                      phase === "correct"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {phase === "correct"
                      ? "✓ Richtig!"
                      : `✗ ${chosen} → ${current.article}`}
                  </div>

                  <div className="text-sm text-zinc-400 italic px-2">
                    {current.rule}
                  </div>

                  <button
                    onClick={() => setShowDefinition((s) => !s)}
                    className="text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-400 transition-colors"
                  >
                    {showDefinition ? "Definition verbergen" : "Definition anzeigen"}
                  </button>

                  {showDefinition && (
                    <div className="mt-2 p-3 bg-zinc-800/60 rounded-xl text-left space-y-1">
                      <p className="text-sm text-zinc-200">
                        🇩🇪 {current.definition_de}
                      </p>
                      <p className="text-sm text-zinc-400">
                        🇬🇧 {current.definition_en}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {phase === "playing" && (
              <p className="text-xs text-zinc-600">
                Tippe 1 / 2 / 3 für die · der · das
              </p>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="w-full pb-8 pt-4">
        {(phase === "playing" || phase === "correct" || phase === "wrong") && (
          <>
            {phase === "playing" ? (
              <div className="grid grid-cols-3 gap-3">
                {(["die", "der", "das"] as Article[]).map((art) => (
                  <button
                    key={art}
                    onClick={() => handleAnswer(art)}
                    className="py-5 rounded-2xl text-xl font-bold border-2 transition-all active:scale-95"
                    style={{
                      borderColor: ARTICLE_COLORS[art] + "55",
                      color: ARTICLE_COLORS[art],
                      background: ARTICLE_COLORS[art] + "11",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        ARTICLE_COLORS[art] + "22";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        ARTICLE_COLORS[art] + "11";
                    }}
                  >
                    {art}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {(["die", "der", "das"] as Article[]).map((art) => (
                    <button
                      key={art}
                      disabled
                      className="py-5 rounded-2xl text-xl font-bold border-2 transition-all"
                      style={articleStyle(art)}
                    >
                      {art}
                    </button>
                  ))}
                </div>
                <button
                  onClick={advance}
                  className="w-full py-4 rounded-2xl font-semibold text-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all text-white border border-zinc-700"
                >
                  Weiter →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
