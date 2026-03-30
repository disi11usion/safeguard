import "./index.css";
import { Composition } from "remotion";
import { HelloWorld, myCompSchema } from "./HelloWorld";
import { Logo, myCompSchema2 } from "./HelloWorld/Logo";
import { OnlyFinanceVideo, onlyFinanceSchema } from "./OnlyFinanceVideo";

// Each <Composition> is an entry in the sidebar!

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        // You can take the "id" to render a video:
        // npx remotion render HelloWorld
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        // You can override these props for each render:
        // https://www.remotion.dev/docs/parametrized-rendering
        schema={myCompSchema}
        defaultProps={{
          titleText: "Welcome to Remotion",
          titleColor: "#000000",
          logoColor1: "#91EAE4",
          logoColor2: "#86A8E7",
        }}
      />

      {/* Mount any React component to make it show up in the sidebar and work on it individually! */}
      <Composition
        id="OnlyLogo"
        component={Logo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={myCompSchema2}
        defaultProps={{
          logoColor1: "#91dAE2" as const,
          logoColor2: "#86A8E7" as const,
        }}
      />

      {/* OnlyFinance Promotional Video */}
      <Composition
        id="OnlyFinance"
        component={OnlyFinanceVideo}
        durationInFrames={2640} // 2.2 minutes at 30fps (longer final scene)
        fps={30}
        width={1920}
        height={1080}
        schema={onlyFinanceSchema}
        defaultProps={{
          titleText: "OnlyFinance - Where AI Meets Crypto Intelligence",
          primaryColor: "#4fd1c5",
          secondaryColor: "#181a20",
          accentColor: "#667eea",
        }}
      />
    </>
  );
};
