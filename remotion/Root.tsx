import React, { useEffect } from "react";
import { Composition } from "remotion";
import { LaunchVideo } from "./Video";
import { FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./constants";
import { loadFonts } from "./load-fonts";

export const RemotionRoot: React.FC = () => {
  // s1=0, s2=160, s3=320, s4=480, s5=640, end=840
  const TOTAL_DURATION = 840; // ~28 seconds at 30fps

  useEffect(() => {
    loadFonts();
  }, []);

  return (
    <>
      <Composition
        id="LaunchVideo"
        component={LaunchVideo}
        durationInFrames={TOTAL_DURATION}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{}}
      />
    </>
  );
};
