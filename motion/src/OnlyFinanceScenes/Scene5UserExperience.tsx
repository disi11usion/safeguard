import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene5UserExperienceProps {
  primaryColor: string;
  accentColor: string;
}

export const Scene5UserExperience: React.FC<Scene5UserExperienceProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const navigationAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  const updatesAnimation = spring({
    frame: frame - 120,
    fps: 30,
    config: { damping: 100 },
  });

  const mobileAnimation = spring({
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
        transform: `translateY(${interpolate(navigationAnimation, [0, 1], [50, 0])}px)`,
        opacity: navigationAnimation
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold"
        }}>
          🎨 User Experience
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
        {/* Dashboard Navigation */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${primaryColor}40`,
          transform: `translateY(${interpolate(navigationAnimation, [0, 1], [100, 0])}px)`,
          opacity: navigationAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            🏠
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: primaryColor
          }}>
            Clean Dashboard Navigation
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Navigate your personalized dashboard with ease
          </p>
          
          {/* Animated navigation elements */}
          <div style={{
            marginTop: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            <div style={{
              padding: "10px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              opacity: interpolate(frame, [0, 100], [0, 1])
            }}>
              📊 Market Overview
            </div>
            <div style={{
              padding: "10px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              opacity: interpolate(frame, [50, 150], [0, 1])
            }}>
              📰 News & Sentiment
            </div>
            <div style={{
              padding: "10px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              opacity: interpolate(frame, [100, 200], [0, 1])
            }}>
              🔮 Forecasting
            </div>
          </div>
        </div>

        {/* Real-Time Updates */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${accentColor}40`,
          transform: `translateY(${interpolate(updatesAnimation, [0, 1], [100, 0])}px)`,
          opacity: updatesAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            ⚡
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: accentColor
          }}>
            Real-Time Updates
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Everything updates every 60 seconds
          </p>
          
          {/* Animated update indicator */}
          <div style={{
            marginTop: "20px",
            textAlign: "center"
          }}>
            <div style={{
              fontSize: "32px",
              animation: "pulse 1s infinite",
              opacity: interpolate(frame, [200, 300], [0.5, 1])
            }}>
              🔄
            </div>
            <div style={{
              fontSize: "18px",
              color: accentColor,
              marginTop: "10px"
            }}>
              Live Data
            </div>
          </div>
        </div>

        {/* Mobile Responsive */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, #667eea20, #667eea10)`,
          borderRadius: "20px",
          padding: "30px",
          border: "2px solid #667eea40",
          transform: `translateY(${interpolate(mobileAnimation, [0, 1], [100, 0])}px)`,
          opacity: mobileAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            📱
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: "#667eea"
          }}>
            Mobile Responsive Design
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Seamless experience on all devices
          </p>
          
          {/* Animated mobile preview */}
          <div style={{
            marginTop: "20px",
            textAlign: "center"
          }}>
            <div style={{
              width: "80px",
              height: "120px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "15px",
              margin: "0 auto",
              position: "relative",
              transform: `scale(${interpolate(frame, [250, 350], [0.8, 1])})`
            }}>
              <div style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                right: "10px",
                height: "2px",
                background: "#667eea",
                borderRadius: "1px"
              }} />
              <div style={{
                position: "absolute",
                top: "20px",
                left: "10px",
                right: "10px",
                height: "2px",
                background: "#667eea",
                borderRadius: "1px"
              }} />
              <div style={{
                position: "absolute",
                top: "30px",
                left: "10px",
                right: "10px",
                height: "2px",
                background: "#667eea",
                borderRadius: "1px"
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom text */}
      <div style={{
        textAlign: "center",
        marginTop: "60px",
        transform: `translateY(${interpolate(mobileAnimation, [0, 1], [50, 0])}px)`,
        opacity: mobileAnimation
      }}>
        <p style={{
          fontSize: "28px",
          color: "#cccccc",
          maxWidth: "800px",
          lineHeight: "1.4"
        }}>
          Navigate your personalized dashboard with ease 🏠. Watch your preferred cryptocurrencies in real-time 📊. Read the latest news and social sentiment 📰. Everything updates every 60 seconds ⚡
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