import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene7RiskProps {
  primaryColor: string;
  accentColor: string;
}

export const Scene7Risk: React.FC<Scene7RiskProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const shieldAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  const riskAnimation = spring({
    frame: frame - 120,
    fps: 30,
    config: { damping: 100 },
  });

  const warningAnimation = spring({
    frame: frame - 210,
    fps: 30,
    config: { damping: 100 },
  });

  const opacity = interpolate(frame, [550, 600], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ 
      backgroundColor: "#181a20",
      opacity,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif",
      padding: "40px"
    }}>
      {/* Header */}
      <div style={{
        textAlign: "center",
        marginBottom: "40px",
        transform: `translateY(${interpolate(shieldAnimation, [0, 1], [50, 0])}px)`,
        opacity: shieldAnimation
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold"
        }}>
          🛡️ Risk Management
        </h1>
      </div>

      {/* Three-column layout */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        maxWidth: "1400px",
        gap: "40px"
      }}>
        {/* Shield Protection */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${primaryColor}40`,
          transform: `translateY(${interpolate(shieldAnimation, [0, 1], [100, 0])}px)`,
          opacity: shieldAnimation,
          textAlign: "center"
        }}>
          <div style={{
            fontSize: "80px",
            marginBottom: "20px",
            filter: `drop-shadow(0 0 20px ${primaryColor}40)`,
            animation: "pulse 2s infinite"
          }}>
            🛡️
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            color: primaryColor
          }}>
            Investment Protection
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            color: "#cccccc"
          }}>
            Never invest blindly again
          </p>
        </div>

        {/* Risk Assessment */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${accentColor}40`,
          transform: `translateY(${interpolate(riskAnimation, [0, 1], [100, 0])}px)`,
          opacity: riskAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            📊
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: accentColor
          }}>
            Risk Assessment Charts
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Matches your personality to perfect crypto opportunities
          </p>
          
          {/* Animated risk chart */}
          <div style={{
            marginTop: "20px",
            height: "100px",
            background: "rgba(255, 255, 255, 0.1)",
            borderRadius: "10px",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{
              position: "absolute",
              bottom: "20px",
              left: "20px",
              right: "20px",
              height: "3px",
              background: accentColor,
              transform: `scaleX(${interpolate(frame, [0, 600], [0, 1])})`,
              transformOrigin: "left"
            }} />
            <div style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              fontSize: "18px",
              color: accentColor
            }}>
              Risk Level
            </div>
          </div>
        </div>

        {/* Warning Systems */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, #ff6b6b20, #ff6b6b10)`,
          borderRadius: "20px",
          padding: "30px",
          border: "2px solid #ff6b6b40",
          transform: `translateY(${interpolate(warningAnimation, [0, 1], [100, 0])}px)`,
          opacity: warningAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            ⚠️
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: "#ff6b6b"
          }}>
            Warning Systems
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Get warnings before market crashes
          </p>
          
          {/* Animated warning indicator */}
          <div style={{
            marginTop: "20px",
            textAlign: "center"
          }}>
            <div style={{
              fontSize: "32px",
              animation: "blink 1s infinite",
              opacity: interpolate(frame, [300, 400], [0.5, 1])
            }}>
              🚨
            </div>
            <div style={{
              fontSize: "16px",
              color: "#ff6b6b",
              marginTop: "10px"
            }}>
              Market Alert
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div style={{
        marginTop: "60px",
        transform: `translateY(${interpolate(warningAnimation, [0, 1], [100, 0])}px)`,
        opacity: warningAnimation
      }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${primaryColor}40`,
          maxWidth: "1000px",
          textAlign: "center"
        }}>
          <h3 style={{
            fontSize: "36px",
            marginBottom: "20px",
            color: primaryColor
          }}>
            ✅ Smart Risk Management
          </h3>
          <p style={{
            fontSize: "24px",
            color: "#cccccc",
            lineHeight: "1.4"
          }}>
            Our risk assessment matches your personality to the perfect crypto opportunities 📊. Get warnings before market crashes ⚠️ and recommendations for safe growth ✅
          </p>
          
          {/* Success indicators */}
          <div style={{
            display: "flex",
            justifyContent: "space-around",
            marginTop: "30px"
          }}>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [400, 500], [0.3, 1])
            }}>
              ✅ Safe
            </div>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [450, 550], [0.3, 1])
            }}>
              📈 Growth
            </div>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [500, 600], [0.3, 1])
            }}>
              🎯 Targeted
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.3; }
        }
      `}</style>
    </AbsoluteFill>
  );
}; 