import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

export const Scene1Problem: React.FC = () => {
  const frame = useCurrentFrame();

  // Animate elements with spring animations
  const chartAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  const textAnimation = spring({
    frame: frame - 60,
    fps: 30,
    config: { damping: 100 },
  });

  const opacity = interpolate(frame, [400, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ 
      backgroundColor: "#1a1a1a",
      opacity,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif"
    }}>
      {/* Background with gradient elements */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden"
      }}>
        {/* Subtle gradient background elements */}
        <div style={{
          position: "absolute",
          top: "10%",
          left: "5%",
          width: "300px",
          height: "200px",
          background: "linear-gradient(135deg, rgba(255, 68, 68, 0.1), rgba(204, 0, 0, 0.05))",
          borderRadius: "20px",
          opacity: 0.3
        }} />
        
        <div style={{
          position: "absolute",
          top: "60%",
          right: "10%",
          width: "250px",
          height: "150px",
          background: "linear-gradient(135deg, rgba(68, 255, 68, 0.1), rgba(0, 204, 0, 0.05))",
          borderRadius: "20px",
          opacity: 0.3
        }} />

        {/* Stressed faces emojis - reduced and positioned better */}
        {[...Array(4)].map((_, i) => (
          <div
            key={`face-${i}`}
            style={{
              position: "absolute",
              left: `${15 + i * 20}%`,
              top: `${30 + i * 15}%`,
              fontSize: "40px",
              transform: `scale(${interpolate(frame, [0, 450], [0, 1])})`,
              opacity: 0.6
            }}
          >
            😰
          </div>
        ))}

        {/* Conflicting news headlines */}
        <div style={{
          position: "absolute",
          top: "20%",
          left: "10%",
          right: "10%",
          fontSize: "24px",
          fontWeight: "bold",
          textAlign: "center",
          opacity: interpolate(frame, [100, 200], [0, 1])
        }}>
          {/* Background rectangle with curved radius and gradient */}
          <div style={{
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))",
            borderRadius: "15px",
            padding: "25px",
            backdropFilter: "blur(15px)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            marginBottom: "20px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
          }}>
            <div style={{ 
              color: "#ff4444", 
              marginBottom: "10px",
              textShadow: "0 2px 4px rgba(0, 0, 0, 0.5)"
            }}>
              📰 "Bitcoin CRASHES 40% in 2 weeks!"
            </div>
            <div style={{ 
              color: "#44ff44", 
              marginBottom: "10px",
              textShadow: "0 2px 4px rgba(0, 0, 0, 0.5)"
            }}>
              📰 "Bitcoin SURGES to new highs!"
            </div>
            <div style={{ 
              color: "#ffaa44",
              textShadow: "0 2px 4px rgba(0, 0, 0, 0.5)"
            }}>
              📰 "Experts disagree on crypto future"
            </div>
          </div>
        </div>
      </div>

      {/* Main problem statement */}
      <div style={{
        textAlign: "center",
        transform: `translateY(${interpolate(textAnimation, [0, 1], [100, 0])}px)`,
        opacity: textAnimation,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%"
      }}>
        <h1 style={{
          fontSize: "64px",
          marginBottom: "20px",
          marginTop: "100px",
          background: "linear-gradient(45deg, #ff4444, #ff6666)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold",
          textAlign: "center"
        }}>
          The Crypto Chaos Problem
        </h1>
        <p style={{
          fontSize: "32px",
          color: "#cccccc",
          maxWidth: "800px",
          lineHeight: "1.4",
          textAlign: "center"
        }}>
          📊 Conflicting news, volatile markets, and endless data streams leave investors paralyzed with uncertainty
        </p>
        <div style={{
          fontSize: "48px",
          marginTop: "40px",
          opacity: interpolate(frame, [200, 300], [0, 1]),
          textAlign: "center"
        }}>
          🎯 "How do I know what to invest in?"
        </div>
      </div>
    </AbsoluteFill>
  );
}; 