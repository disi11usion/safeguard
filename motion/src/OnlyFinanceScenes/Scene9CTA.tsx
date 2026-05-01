import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene9CTAProps {
  titleText: string;
  primaryColor: string;
  accentColor: string;
}

export const Scene9CTA: React.FC<Scene9CTAProps> = ({
  titleText,
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const rocketAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  const logoAnimation = spring({
    frame: frame - 120,
    fps: 30,
    config: { damping: 100 },
  });

  const ctaAnimation = spring({
    frame: frame - 210,
    fps: 30,
    config: { damping: 100 },
  });

  return (
    <AbsoluteFill style={{ 
      background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif",
      padding: "40px"
    }}>
      {/* Background with subtle patterns */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: `radial-gradient(circle at 20% 20%, ${primaryColor}15 0%, transparent 50%),
                    radial-gradient(circle at 80% 80%, ${accentColor}15 0%, transparent 50%)`,
      }} />

      {/* Rocket Animation */}
      <div style={{
        position: "absolute",
        top: "20%",
        left: "10%",
        transform: `translateY(${interpolate(rocketAnimation, [0, 1], [100, -50])}px)`,
        opacity: rocketAnimation
      }}>
        <div style={{
          fontSize: "80px",
          animation: "rocket 3s ease-in-out infinite"
        }}>
          🚀
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        textAlign: "center",
        transform: `translateY(${interpolate(logoAnimation, [0, 1], [50, 0])}px)`,
        opacity: logoAnimation,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%"
      }}>
        {/* OnlyFinance Logo with Sparkles */}
        <div style={{
          marginBottom: "40px"
        }}>
          <div style={{
            fontSize: "120px",
            fontWeight: "bold",
            background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textAlign: "center",
            marginBottom: "20px",
            filter: `drop-shadow(0 0 30px ${primaryColor}40)`
          }}>
            🚀 OnlyFinance
          </div>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            animation: "sparkle 2s ease-in-out infinite"
          }}>
            ✨
          </div>
        </div>

        {/* Main Title */}
        <h1 style={{
          fontSize: "64px",
          marginBottom: "30px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold",
          textAlign: "center"
        }}>
          {titleText}
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: "32px",
          color: "#cccccc",
          maxWidth: "800px",
          lineHeight: "1.4",
          marginBottom: "50px",
          textAlign: "center"
        }}>
          The future of crypto intelligence is here 🚀. Stop guessing, start knowing. OnlyFinance—where AI meets opportunity
        </p>
      </div>

      {/* Call to Action Buttons */}
      <div style={{
        transform: `translateY(${interpolate(ctaAnimation, [0, 1], [100, 0])}px)`,
        opacity: ctaAnimation,
        display: "flex",
        gap: "30px",
        marginTop: "40px"
      }}>
        {/* Visit Website Button */}
        <div style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
          borderRadius: "15px",
          padding: "20px 40px",
          cursor: "pointer",
          boxShadow: `0 8px 32px ${primaryColor}40`,
          transition: "all 0.3s ease",
          animation: "pulse 2s infinite"
        }}>
          <div style={{
            fontSize: "24px",
            fontWeight: "bold",
            textAlign: "center"
          }}>
            🌐 Visit OnlyFinance.com
          </div>
        </div>

        {/* Download App Button */}
        <div style={{
          background: `linear-gradient(135deg, ${accentColor}, ${primaryColor})`,
          borderRadius: "15px",
          padding: "20px 40px",
          cursor: "pointer",
          boxShadow: `0 8px 32px ${accentColor}40`,
          transition: "all 0.3s ease",
          animation: "pulse 2s infinite 1s"
        }}>
          <div style={{
            fontSize: "24px",
            fontWeight: "bold",
            textAlign: "center"
          }}>
            📱 Download Now
          </div>
        </div>
      </div>

      {/* Final Tagline */}
      <div style={{
        marginTop: "60px",
        textAlign: "center",
        transform: `translateY(${interpolate(ctaAnimation, [0, 1], [50, 0])}px)`,
        opacity: ctaAnimation
      }}>
        <div style={{
          fontSize: "36px",
          fontWeight: "bold",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent"
        }}>
          🎯 Start your journey to crypto mastery today!
        </div>
      </div>

      {/* App Download Preview */}
      <div style={{
        position: "absolute",
        bottom: "10%",
        right: "10%",
        transform: `scale(${interpolate(ctaAnimation, [0, 1], [0.5, 1])})`,
        opacity: ctaAnimation
      }}>
        <div style={{
          width: "120px",
          height: "180px",
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          border: `2px solid ${primaryColor}40`,
          backdropFilter: "blur(10px)",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            right: "20px",
            height: "2px",
            background: primaryColor,
            borderRadius: "1px"
          }} />
          <div style={{
            position: "absolute",
            top: "40px",
            left: "20px",
            right: "20px",
            height: "2px",
            background: primaryColor,
            borderRadius: "1px"
          }} />
          <div style={{
            position: "absolute",
            top: "60px",
            left: "20px",
            right: "20px",
            height: "2px",
            background: primaryColor,
            borderRadius: "1px"
          }} />
          <div style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "24px"
          }}>
            📱
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rocket {
          0%, 100% { transform: translateY(0px) rotate(-5deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes sparkle {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.2) rotate(180deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </AbsoluteFill>
  );
}; 