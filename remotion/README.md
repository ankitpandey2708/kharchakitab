# KharchaKitab Launch Video

A beautiful launch video created with [Remotion](https://www.remotion.dev/) that showcases the key features of KharchaKitab expense tracker.

## Video Details

- **Duration:** 19 seconds (570 frames at 30fps)
- **Resolution:** 1080x1920 (vertical format for mobile)
- **Design:** Matches KharchaKitab's "Ink & Ember" design system
- **Fonts:** DM Sans, Playfair Display, JetBrains Mono

## Scenes

1. **Intro (3s)** - Logo reveal with brand name and tagline
2. **Features (4s)** - Showcase 4 key features with animated cards
3. **Voice Demo (4s)** - Demonstrate voice-powered expense logging
4. **Analytics (4s)** - Show spending insights and category breakdown
5. **Outro (4s)** - Call to action with website URL

## Commands

### Preview the video
```bash
npm run remotion:preview
```

### Render the final video
```bash
npm run remotion:render
```

The rendered video will be saved to `out/launch-video.mp4`.

## Customization

- **Colors:** Edit `remotion/constants.ts`
- **Timing:** Adjust durations in `remotion/Video.tsx`
- **Content:** Modify individual scenes in `remotion/scenes/`
- **Resolution:** Update `VIDEO_WIDTH` and `VIDEO_HEIGHT` in `remotion/constants.ts`

## Project Structure

```
remotion/
├── index.ts              # Entry point
├── Root.tsx              # Remotion root with compositions
├── Video.tsx             # Main video composition
├── constants.ts          # Design tokens and settings
├── load-fonts.ts         # Font loading utility
├── components/           # Reusable components
│   ├── GradientOrb.tsx
│   └── PaperTexture.tsx
└── scenes/               # Individual scenes
    ├── Intro.tsx
    ├── Features.tsx
    ├── VoiceDemo.tsx
    ├── Analytics.tsx
    └── Outro.tsx
```

## Design System

The video uses KharchaKitab's "Ink & Ember" design system:

- **Primary Colors:** Ember Orange (#ff6b35), Saffron (#f7c948)
- **Background:** Paper (#faf8f5), Cream (#f5f2ed)
- **Text:** Ink (#1a1a1a)
- **Accents:** Sage Green, Ocean Blue

All animations use spring physics for smooth, natural motion that matches the app's feel.
