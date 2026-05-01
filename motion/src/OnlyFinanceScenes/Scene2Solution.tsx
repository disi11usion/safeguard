import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene2SolutionProps {
  titleText: string;
  primaryColor: string;
  accentColor: string;
}

export const Scene2Solution: React.FC<Scene2SolutionProps> = ({
  titleText,
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  // Animate logo appearance
  const logoAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  // Animate AI brain
  const brainAnimation = spring({
    frame: frame - 60,
    fps: 30,
    config: { damping: 100 },
  });

  // Animate text
  const textAnimation = spring({
    frame: frame - 90,
    fps: 30,
    config: { damping: 100 },
  });

  const opacity = interpolate(frame, [400, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ 
      background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
      opacity,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif"
    }}>
      {/* Clean background with subtle patterns */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: `radial-gradient(circle at 30% 30%, ${primaryColor}10 0%, transparent 50%),
                    radial-gradient(circle at 70% 70%, ${accentColor}10 0%, transparent 50%)`,
      }} />

      {/* OnlyFinance Logo */}
      <div style={{
        transform: `scale(${interpolate(logoAnimation, [0, 1], [0.5, 1])})`,
        opacity: logoAnimation,
        marginBottom: "40px"
      }}>
        <div style={{
          fontSize: "120px",
          fontWeight: "bold",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textAlign: "center",
          marginBottom: "20px"
        }}>
          🚀 OnlyFinance
        </div>
      </div>

      {/* AI Brain Icon */}
      <div style={{
        transform: `scale(${interpolate(brainAnimation, [0, 1], [0.3, 1])})`,
        opacity: brainAnimation,
        marginBottom: "40px",
        animation: "pulse 2s infinite"
      }}>
        <div style={{
          fontSize: "100px",
          filter: `drop-shadow(0 0 20px ${primaryColor}40)`
        }}>
          🧠
        </div>
      </div>

      {/* Clean Dashboard Interface Preview */}
      <div style={{
        transform: `translateY(${interpolate(textAnimation, [0, 1], [50, 0])}px)`,
        opacity: textAnimation,
        background: "rgba(255, 255, 255, 0.1)",
        borderRadius: "20px",
        padding: "30px",
        backdropFilter: "blur(10px)",
        border: `2px solid ${primaryColor}40`,
        maxWidth: "600px",
        textAlign: "center"
      }}>
        <div style={{
          fontSize: "36px",
          marginBottom: "20px",
          fontWeight: "bold"
        }}>
          📊 Clean Dashboard Interface
        </div>
        <div style={{
          fontSize: "24px",
          color: "#cccccc",
          lineHeight: "1.4"
        }}>
          AI-Powered Crypto Intelligence
        </div>
      </div>

      {/* Main title */}
      <div style={{
        textAlign: "center",
        transform: `translateY(${interpolate(textAnimation, [0, 1], [100, 0])}px)`,
        opacity: textAnimation,
        marginTop: "40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%"
      }}>
        <h1 style={{
          fontSize: "48px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold",
          textAlign: "center"
        }}>
          {titleText}
        </h1>
        <p style={{
          fontSize: "28px",
          color: "#cccccc",
          maxWidth: "700px",
          lineHeight: "1.4",
          textAlign: "center"
        }}>
          What if AI could read the market's mind? OnlyFinance transforms crypto chaos into crystal-clear intelligence.
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </AbsoluteFill>
  );
}; 