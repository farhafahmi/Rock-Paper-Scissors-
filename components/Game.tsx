'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GestureRecognizer, FilesetResolver, type GestureRecognizerResult } from '@mediapipe/tasks-vision';
import { getResult, MOVES, randomMove, resultLabel, type Move, type Result } from '@/lib/game';
import { mapGesture, type DetectedGesture } from '@/lib/gesture';

type CameraStatus = 'idle' | 'loading' | 'ready' | 'permission' | 'missing' | 'busy' | 'error';
type Phase = 'ready' | 'countdown' | 'reveal';

const ERROR_COPY: Record<Exclude<CameraStatus, 'idle' | 'loading' | 'ready'>, string> = {
  permission: 'Camera permission was denied. You can still play with the buttons below.',
  missing: 'No camera was found. Connect a camera or use the buttons below.',
  busy: 'Your camera is already being used by another app. Close it there or use the buttons below.',
  error: 'The camera could not be started. Check browser permissions and try again.',
};

export default function Game() {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const stableGestureRef = useRef<DetectedGesture>(null);
  const stableSinceRef = useRef(0);
  const roundLockedRef = useRef(false);
  const phaseRef = useRef<Phase>('ready');
  const finishRoundRef = useRef<(move: Move) => void>(() => undefined);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [detected, setDetected] = useState<DetectedGesture>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playerMove, setPlayerMove] = useState<Move | null>(null);
  const [computerMove, setComputerMove] = useState<Move | null>(null);
  const [roundResult, setRoundResult] = useState<Result | null>(null);
  const [score, setScore] = useState({ player: 0, computer: 0 });
  const [rounds, setRounds] = useState(0);
  const [message, setMessage] = useState('Show ✊, ✋ or ✌️ to the camera');
  phaseRef.current = phase;

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus('idle');
    setDetected(null);
  }, []);

  const finishRound = useCallback((move: Move) => {
    if (roundLockedRef.current) return;
    roundLockedRef.current = true;
    setPlayerMove(move);
    setMessage(`${MOVES[move].label} locked in`);
    setCountdown(3);
    setPhase('countdown');
    let value = 3;
    const timer = window.setInterval(() => {
      value -= 1;
      setCountdown(value);
      if (value === 0) {
        window.clearInterval(timer);
        const computer = randomMove();
        const result = getResult(move, computer);
        setComputerMove(computer);
        setRoundResult(result);
        setRounds(r => r + 1);
        setScore(s => ({
          player: s.player + (result === 'win' ? 1 : 0),
          computer: s.computer + (result === 'lose' ? 1 : 0),
        }));
        setPhase('reveal');
        setMessage(resultLabel(result));
      }
    }, reducedMotion ? 250 : 700);
  }, [reducedMotion]);

  const analyze = useCallback((result: GestureRecognizerResult, now: number) => {
    const top = result.gestures?.[0]?.[0];
    const candidate = top && top.score >= 0.62 ? mapGesture(top.categoryName) : null;
    setDetected(candidate);
    if (!candidate || roundLockedRef.current || phaseRef.current !== 'ready') {
      stableGestureRef.current = null;
      stableSinceRef.current = 0;
      return;
    }
    if (stableGestureRef.current !== candidate) {
      stableGestureRef.current = candidate;
      stableSinceRef.current = now;
      setMessage(`Hold ${MOVES[candidate].emoji} ${MOVES[candidate].label} steady…`);
      return;
    }
    if (now - stableSinceRef.current >= 500) finishRoundRef.current(candidate);
  }, []);

  finishRoundRef.current = finishRound;

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      return;
    }
    setCameraStatus('loading');
    setMessage('Starting camera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraStatus('ready');
      setMessage('Show your hand to begin');
      if (!recognizerRef.current) {
        setModelStatus('loading');
        try {
          const vision = await FilesetResolver.forVisionTasks('/wasm');
          recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: '/models/gesture_recognizer.task', delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
          });
          setModelStatus('ready');
        } catch (error) {
          console.error('MediaPipe vision initialization failed:', error);
          setModelStatus('error');
          setMessage('Vision model failed to load — check /wasm and /models assets');
          return;
        }
      }
      const loop = () => {
        if (!videoRef.current || !recognizerRef.current || videoRef.current.readyState < 2) {
          frameRef.current = requestAnimationFrame(loop);
          return;
        }
        try {
          const now = performance.now();
          const result = recognizerRef.current.recognizeForVideo(videoRef.current, now);
          analyze(result, now);
        } catch {
          // Keep the camera alive if a frame is skipped by the vision runtime.
        }
        frameRef.current = requestAnimationFrame(loop);
      };
      frameRef.current = requestAnimationFrame(loop);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setCameraStatus('permission');
      else if (name === 'NotFoundError') setCameraStatus('missing');
      else if (name === 'NotReadableError' || name === 'AbortError') setCameraStatus('busy');
      else setCameraStatus('error');
      setMessage('Camera unavailable — button controls are ready');
    }
  }, []);

  const playMove = (move: Move) => {
    if (phase !== 'ready' || roundLockedRef.current) return;
    finishRound(move);
  };

  const nextRound = () => {
    roundLockedRef.current = false;
    stableGestureRef.current = null;
    stableSinceRef.current = 0;
    setPhase('ready');
    setCountdown(null);
    setPlayerMove(null);
    setComputerMove(null);
    setRoundResult(null);
    setDetected(null);
    setMessage(cameraStatus === 'ready' ? 'Show your hand to begin' : 'Choose a move below');
  };

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      recognizerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    void startCamera();
  }, []);

  const currentPlayer = playerMove ? MOVES[playerMove] : null;
  const currentComputer = computerMove ? MOVES[computerMove] : null;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[.22em] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /> Browser Vision Game
            </div>
            <h1 className="text-3xl font-black tracking-[-.05em] sm:text-5xl">ROCK <span className="text-white/35">/</span> PAPER <span className="text-white/35">/</span> SCISSORS</h1>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-white/35">Round</div>
            <div className="text-2xl font-black tabular-nums">{String(rounds).padStart(2, '0')}</div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1fr_310px]">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(13,17,28,.78)] shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="relative aspect-[4/3] min-h-[390px] overflow-hidden bg-[#080b13] sm:min-h-0">
              <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover scale-x-[-1]" aria-label="Live camera preview for hand gesture detection" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(5,7,13,.48))]" />
              <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                <StatusPill label={modelStatus === 'loading' ? 'Loading vision' : modelStatus === 'ready' ? 'Vision ready' : 'Vision idle'} active={modelStatus === 'ready'} />
                <StatusPill label={cameraStatus === 'ready' ? 'Camera live' : cameraStatus === 'loading' ? 'Starting camera' : 'Camera offline'} active={cameraStatus === 'ready'} />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-white/40">Detection</div>
                      <div aria-live="polite" className="text-lg font-bold sm:text-xl">{message}</div>
                    </div>
                    <AnimatePresence mode="wait">
                      {detected && phase === 'ready' && (
                        <motion.div key={detected} initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-5xl" aria-label={`Detected ${MOVES[detected].label}`}>
                          {MOVES[detected].emoji}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
              {cameraStatus !== 'ready' && (
                <div className="absolute inset-0 grid place-items-center bg-[#080b13]/80 p-6 text-center backdrop-blur-sm">
                  <div className="max-w-sm">
                    <div className="mb-3 text-5xl">📷</div>
                    <h2 className="text-xl font-black">Camera unavailable</h2>
                    <p className="mt-2 text-sm leading-6 text-white/55">{cameraStatus === 'loading' ? 'Requesting camera access…' : ERROR_COPY[cameraStatus as Exclude<CameraStatus, 'idle' | 'loading' | 'ready'>] ?? 'Start the camera to play with gestures.'}</p>
                    <button onClick={startCamera} className="mt-5 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-300">Try camera again</button>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {phase === 'countdown' && countdown !== null && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
                    <motion.div key={countdown} initial={{ scale: .65, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[clamp(7rem,22vw,13rem)] font-black leading-none tracking-[-.08em] text-white drop-shadow-[0_0_40px_rgba(124,92,255,.8)]">{countdown}</motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-white/10 p-4 sm:p-5">
              <div className="mb-3 text-center text-[10px] font-bold uppercase tracking-[.2em] text-white/35">Camera is optional — choose your move</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(MOVES) as Move[]).map(move => (
                  <button key={move} onClick={() => playMove(move)} disabled={phase !== 'ready'} className="group rounded-2xl border border-white/10 bg-white/[.035] px-2 py-4 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[.07] focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-45">
                    <div className="text-3xl transition-transform group-hover:scale-110">{MOVES[move].emoji}</div>
                    <div className="mt-2 text-xs font-black uppercase tracking-widest text-white/60">{MOVES[move].label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-white/10 bg-[rgba(13,17,28,.78)] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[.2em] text-white/35">Scoreboard</span>
                <span className="rounded-full bg-white/[.05] px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/35">Best of you</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-center">
                <Score name="YOU" value={score.player} />
                <div className="pb-2 text-xs font-black text-white/20">VS</div>
                <Score name="CPU" value={score.computer} />
              </div>
            </div>

            <div className="min-h-[245px] rounded-[28px] border border-white/10 bg-[rgba(13,17,28,.78)] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="text-[10px] font-bold uppercase tracking-[.2em] text-white/35">Round result</div>
              <AnimatePresence mode="wait">
                {phase === 'reveal' && currentPlayer && currentComputer && roundResult ? (
                  <motion.div key={`${rounds}-${roundResult}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                    <div className="grid grid-cols-2 gap-3">
                      <Choice label="You" move={currentPlayer} />
                      <Choice label="Computer" move={currentComputer} />
                    </div>
                    <div className={`mt-5 rounded-2xl border p-4 text-center ${roundResult === 'win' ? 'border-cyan-300/20 bg-cyan-300/5' : roundResult === 'lose' ? 'border-fuchsia-300/20 bg-fuchsia-300/5' : 'border-white/10 bg-white/[.03]'}`}>
                      <div className="text-2xl font-black tracking-tight">{resultLabel(roundResult)}</div>
                      <div className="mt-1 text-xs text-white/40">Round {rounds} complete</div>
                    </div>
                    <button onClick={nextRound} autoFocus className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-cyan-300">PLAY AGAIN</button>
                  </motion.div>
                ) : (
                  <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-10 text-center">
                    <div className="text-5xl">{phase === 'countdown' ? '⚡' : '✊'}</div>
                    <p className="mt-4 text-sm leading-6 text-white/45">Hold your gesture steady for half a second, or use the buttons.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="rounded-[24px] border border-cyan-300/10 bg-cyan-300/[.035] p-4 text-xs leading-5 text-white/45">
              <div className="mb-1 font-bold text-white/75">🔒 Privacy first</div>
              Your camera video is processed entirely in your browser. It is never uploaded or stored by this game.
            </div>
          </aside>
        </section>

        <footer className="mt-5 flex flex-col gap-2 text-center text-[10px] font-medium uppercase tracking-[.15em] text-white/25 sm:flex-row sm:justify-between sm:text-left">
          <span>Camera requires HTTPS or localhost</span>
          <span>Keyboard: Tab + Enter / Space • Reduced motion supported</span>
        </footer>
      </div>
    </main>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/60 backdrop-blur"><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-300 shadow-[0_0_10px_#6ee7b7]' : 'bg-white/25'}`} />{label}</div>;
}

function Score({ name, value }: { name: string; value: number }) {
  return <div><div className="text-[10px] font-black tracking-[.2em] text-white/35">{name}</div><div className="mt-1 text-5xl font-black tabular-nums tracking-[-.06em]">{value}</div></div>;
}

function Choice({ label, move }: { label: string; move: { label: string; emoji: string } }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-center"><div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{label}</div><div className="mt-2 text-4xl">{move.emoji}</div><div className="mt-2 text-xs font-black uppercase tracking-widest text-white/60">{move.label}</div></div>;
}
