import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { Intro } from "./scenes/Intro";
import { Features } from "./scenes/Features";
import { VoiceDemo } from "./scenes/VoiceDemo";
import { Analytics } from "./scenes/Analytics";
import { Outro } from "./scenes/Outro";


// Crossfade wrapper — fades out in the last `overlap` frames
const CrossfadeScene: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
  overlap?: number;
}> = ({ children, durationInFrames, overlap = 10 }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(
    frame,
    [durationInFrames - overlap, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return <AbsoluteFill style={{ opacity: fadeOut }}>{children}</AbsoluteFill>;
};

export const LaunchVideo: React.FC = () => {
  const OVERLAP = 20; // crossfade frames (~0.67s at 30fps)

  // Scene durations (including overlap for the crossfade)
  const INTRO = 180; // ~6s (let brand breathe)
  const FEATURES = 180; // ~6s
  const VOICE = 180; // ~6s
  const ANALYTICS = 180; // ~6s
  const OUTRO = 200; // ~6.7s (linger on CTA)

  const s1 = 0;
  const s2 = s1 + INTRO - OVERLAP;
  const s3 = s2 + FEATURES - OVERLAP;
  const s4 = s3 + VOICE - OVERLAP;
  const s5 = s4 + ANALYTICS - OVERLAP;

  return (
    <AbsoluteFill>
      <Sequence from={s1} durationInFrames={INTRO}>
        <CrossfadeScene durationInFrames={INTRO} overlap={OVERLAP}>
          <Intro />
        </CrossfadeScene>
      </Sequence>

      <Sequence from={s2} durationInFrames={FEATURES}>
        <CrossfadeScene durationInFrames={FEATURES} overlap={OVERLAP}>
          <Features />
        </CrossfadeScene>
      </Sequence>

      <Sequence from={s3} durationInFrames={VOICE}>
        <CrossfadeScene durationInFrames={VOICE} overlap={OVERLAP}>
          <VoiceDemo />
        </CrossfadeScene>
      </Sequence>

      <Sequence from={s4} durationInFrames={ANALYTICS}>
        <CrossfadeScene durationInFrames={ANALYTICS} overlap={OVERLAP}>
          <Analytics />
        </CrossfadeScene>
      </Sequence>

      <Sequence from={s5} durationInFrames={OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
