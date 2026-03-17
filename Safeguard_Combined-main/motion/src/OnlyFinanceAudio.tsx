import { Audio, useCurrentFrame, interpolate } from "remotion";

interface OnlyFinanceAudioProps {
  primaryColor: string;
  accentColor: string;
}

export const OnlyFinanceAudio: React.FC<OnlyFinanceAudioProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  // Dynamic volume control based on scene
  const getVolume = () => {
    // Scene 1: Problem (0-240 frames) - Tension building
    if (frame < 240) {
      return interpolate(frame, [0, 60], [0, 0.3], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    
    // Scene 2: Solution (240-480 frames) - Hope rising
    if (frame < 480) {
      return interpolate(frame, [240, 300], [0.3, 0.5], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    
    // Scene 3: Features (480-960 frames) - Energy building
    if (frame < 960) {
      return interpolate(frame, [480, 540], [0.5, 0.7], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    
    // Scene 4-8: Middle scenes (960-1920 frames) - Peak energy
    if (frame < 1920) {
      return 0.7;
    }
    
    // Scene 9: CTA (1920-2400 frames) - Climax
    return interpolate(frame, [1920, 2400], [0.7, 0.8], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };

  // Dynamic playback rate based on scene intensity
  const getPlaybackRate = () => {
    // Scene 1: Slow, tense
    if (frame < 240) return 0.8;
    
    // Scene 2: Building up
    if (frame < 480) return 0.9;
    
    // Scene 3: Getting energetic
    if (frame < 960) return 1.0;
    
    // Scene 4-8: Full energy
    if (frame < 1920) return 1.1;
    
    // Scene 9: Climax
    return 1.2;
  };

  return (
    <>
      {/* Audio temporarily disabled - will add local files later */}
      {/* 
      <Audio
        src="/audio/background.mp3"
        volume={getVolume()}
        playbackRate={getPlaybackRate()}
        loop
      />
      */}
    </>
  );
}; 