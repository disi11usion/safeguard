import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene4PersonalizationProps {
  primaryColor: string;
  accentColor: string;
}

export const Scene4Personalization: React.FC<Scene4PersonalizationProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  // Animate questionnaire
  const questionnaireAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  // Animate risk profiles
  const riskProfilesAnimation = spring({
    frame: frame - 120,
    fps: 30,
    config: { damping: 100 },
  });

  // Animate dashboard
  const dashboardAnimation = spring({
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
        transform: `translateY(${interpolate(questionnaireAnimation, [0, 1], [50, 0])}px)`,
        opacity: questionnaireAnimation
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold"
        }}>
          👤 Personalization
        </h1>
      </div>

      {/* Two-column layout */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        maxWidth: "1400px",
        gap: "60px",
        alignItems: "center"
      }}>
        {/* Left side - Questionnaire */}
        <div style={{
          flex: 1,
          transform: `translateX(${interpolate(questionnaireAnimation, [0, 1], [-100, 0])}px)`,
          opacity: questionnaireAnimation
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}10)`,
            borderRadius: "20px",
            padding: "30px",
            border: `2px solid ${primaryColor}40`
          }}>
            <h3 style={{
              fontSize: "32px",
              marginBottom: "20px",
              textAlign: "center",
              color: primaryColor
            }}>
              📝 Investment Profile Assessment
            </h3>
            
            {/* Animated questionnaire items */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{
                fontSize: "18px",
                marginBottom: "10px",
                opacity: interpolate(frame, [0, 100], [0, 1])
              }}>
                ✅ How would you describe your knowledge of investing?
              </div>
              <div style={{
                fontSize: "18px",
                marginBottom: "10px",
                opacity: interpolate(frame, [50, 150], [0, 1])
              }}>
                ✅ What are your reasons for investing?
              </div>
              <div style={{
                fontSize: "18px",
                marginBottom: "10px",
                opacity: interpolate(frame, [100, 200], [0, 1])
              }}>
                ✅ What portion of your income is available for investment?
              </div>
              <div style={{
                fontSize: "18px",
                marginBottom: "10px",
                opacity: interpolate(frame, [150, 250], [0, 1])
              }}>
                ✅ How long can you leave your money invested?
              </div>
              <div style={{
                fontSize: "18px",
                opacity: interpolate(frame, [200, 300], [0, 1])
              }}>
                ✅ Which cryptocurrencies interest you most?
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Risk Profiles */}
        <div style={{
          flex: 1,
          transform: `translateX(${interpolate(riskProfilesAnimation, [0, 1], [100, 0])}px)`,
          opacity: riskProfilesAnimation
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
            borderRadius: "20px",
            padding: "30px",
            border: `2px solid ${accentColor}40`
          }}>
            <h3 style={{
              fontSize: "32px",
              marginBottom: "20px",
              textAlign: "center",
              color: accentColor
            }}>
              🎯 Risk Profiles
            </h3>
            
            {/* Risk profile options */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{
                fontSize: "16px",
                padding: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                opacity: interpolate(frame, [150, 250], [0, 1])
              }}>
                🛡️ Defensive: "I care most about protecting what I have"
              </div>
              <div style={{
                fontSize: "16px",
                padding: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                opacity: interpolate(frame, [200, 300], [0, 1])
              }}>
                🐌 Conservative: "Slow and steady wins the race"
              </div>
              <div style={{
                fontSize: "16px",
                padding: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                opacity: interpolate(frame, [250, 350], [0, 1])
              }}>
                ⚖️ Moderate: "Growth is important, but I want a safety net"
              </div>
              <div style={{
                fontSize: "16px",
                padding: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                opacity: interpolate(frame, [300, 400], [0, 1])
              }}>
                📈 Balanced: "I expect ups and downs - as long as it grows overall"
              </div>
              <div style={{
                fontSize: "16px",
                padding: "8px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                opacity: interpolate(frame, [350, 450], [0, 1])
              }}>
                🚀 Growth: "I'm in this for strong long-term growth"
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom - Personalized Dashboard Preview */}
      <div style={{
        marginTop: "60px",
        transform: `translateY(${interpolate(dashboardAnimation, [0, 1], [100, 0])}px)`,
        opacity: dashboardAnimation
      }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${primaryColor}40`,
          maxWidth: "800px",
          textAlign: "center"
        }}>
          <h3 style={{
            fontSize: "36px",
            marginBottom: "20px",
            color: primaryColor
          }}>
            💎 Your Personalized Crypto Dashboard
          </h3>
          <p style={{
            fontSize: "24px",
            color: "#cccccc",
            lineHeight: "1.4"
          }}>
            Tell us about your investment style, and we'll create your perfect crypto portfolio. From defensive to growth-focused, your dashboard adapts to your risk tolerance 
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
}; 