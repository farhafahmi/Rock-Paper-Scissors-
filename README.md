# Vision RPS

A polished, camera-powered Rock Paper Scissors game built with Next.js, React, TypeScript, Tailwind CSS, Motion, and MediaPipe Tasks Vision.

## Features

- ✊ Rock, ✋ Paper, ✌️ Scissors gesture recognition in the browser
- ~500ms steady-gesture requirement before a camera gesture counts
- 3-2-1 round countdown and animated reveal
- Player vs computer score tracking
- Camera fallback buttons
- Clear camera/model error states
- Keyboard-friendly controls and visible focus states
- `prefers-reduced-motion` support
- Responsive desktop/mobile layout
- Camera frames never leave the browser and are not stored by the game
- MediaPipe WASM is copied into `public/wasm` during asset preparation
- MediaPipe gesture model is placed into `public/models`

## Requirements

- Node.js 20.9+ is required by this Next.js 15 project.
- Node 22 LTS is recommended for the smoothest local setup. Node 25 may work, but if you encounter dependency/runtime issues, switch to Node 22 LTS.
- Camera access requires HTTPS in production. Vercel provides HTTPS automatically. `localhost` is also allowed by browsers.

## Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The `npm run build` command automatically runs `npm run prepare:assets` before building. That copies the installed MediaPipe WASM files into `public/wasm` and downloads the official gesture model into `public/models` if it is not already present.

## Production build

```bash
npm install
npm run build
npm start
```

Do not run `npm audit fix --force` on this project. Use deliberate dependency upgrades instead.

## Deploy to Vercel

1. Push the project to GitHub/GitLab/Bitbucket.
2. Import the repository into Vercel.
3. Keep the framework preset as Next.js.
4. Use `npm install` for installation and `npm run build` for the build command.
5. Deploy.
6. Open the HTTPS deployment and allow camera access when prompted.

The build script prepares the MediaPipe assets before `next build`, so the browser runtime uses local `/public` files rather than a runtime CDN dependency.

## Privacy

Camera video is processed locally in the browser. This game does not upload or store the camera video.

MediaPipe's package documentation notes that its Tasks APIs process input on-device; its own product metrics may still be sent by the MediaPipe library. See Google's current MediaPipe privacy documentation if you need a formal privacy review.

## Controls

- Camera: show ✊, ✋ or ✌️ and hold it steady for about half a second.
- Fallback: click/tap Rock, Paper, or Scissors.
- Keyboard: Tab to controls, then Enter or Space to activate them.
