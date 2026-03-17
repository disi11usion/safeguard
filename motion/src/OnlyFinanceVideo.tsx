import { spring, useVideoConfig, useCurrentFrame, interpolate, Sequence, AbsoluteFill } from "remotion";
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import { Scene1Problem } from "./OnlyFinanceScenes/Scene1Problem";
import { Scene2Solution } from "./OnlyFinanceScenes/Scene2Solution";
import { Scene3Features } from "./OnlyFinanceScenes/Scene3Features";
import { Scene4Personalization } from "./OnlyFinanceScenes/Scene4Personalization";
import { Scene5UserExperience } from "./OnlyFinanceScenes/Scene5UserExperience";
import { Scene6AI } from "./OnlyFinanceScenes/Scene6AI";
import { Scene7Risk } from "./OnlyFinanceScenes/Scene7Risk";
import { Scene8Social } from "./OnlyFinanceScenes/Scene8Social";
import { Scene9CTA } from "./OnlyFinanceScenes/Scene9CTA";
import { OnlyFinanceAudio } from "./OnlyFinanceAudio";

export const onlyFinanceSchema = z.object({
  titleText: z.string(),
  primaryColor: zColor(),
  secondaryColor: zColor(),
  accentColor: zColor(),
});

export const OnlyFinanceVideo: React.FC<z.infer<typeof onlyFinanceSchema>> = ({
  titleText,
  primaryColor,
  secondaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: secondaryColor }}>
      {/* Audio Track */}
      <OnlyFinanceAudio 
        primaryColor={primaryColor}
        accentColor={accentColor}
      />
      
      {/* Scene 1: The Problem (0:00-0:08) - 240 frames */}
      <Sequence from={0} durationInFrames={240}>
        <Scene1Problem />
      </Sequence>

      {/* Scene 2: Solution Intro (0:08-0:16) - 240 frames */}
      <Sequence from={240} durationInFrames={240}>
        <Scene2Solution 
          titleText={titleText}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 3: Core Features (0:16-0:32) - 480 frames */}
      <Sequence from={480} durationInFrames={480}>
        <Scene3Features 
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 4: Personalization (0:32-0:40) - 240 frames */}
      <Sequence from={960} durationInFrames={240}>
        <Scene4Personalization 
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 5: User Experience (0:40-0:48) - 240 frames */}
      <Sequence from={1200} durationInFrames={240}>
        <Scene5UserExperience 
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 6: AI Intelligence (0:48-0:56) - 240 frames */}
      <Sequence from={1440} durationInFrames={240}>
        <Scene6AI 
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 7: Risk Management (0:56-1:04) - 240 frames */}
      <Sequence from={1680} durationInFrames={240}>
        <Scene7Risk 
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 8: Social Proof (1:04-1:12) - 240 frames */}
      <Sequence from={1920} durationInFrames={240}>
        <Scene8Social 
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>

      {/* Scene 9: Call to Action (1:12-1:28) - 480 frames */}
      <Sequence from={2160} durationInFrames={480}>
        <Scene9CTA 
          titleText={titleText}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Sequence>
    </AbsoluteFill>
  );
}; 