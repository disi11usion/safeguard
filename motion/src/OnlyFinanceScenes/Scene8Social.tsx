import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene8SocialProps {
  primaryColor: string;
  accentColor: string;
}

export const Scene8Social: React.FC<Scene8SocialProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const communityAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  const growthAnimation = spring({
    frame: frame - 120,
    fps: 30,
    config: { damping: 100 },
  });

  const testimonialsAnimation = spring({
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
        transform: `translateY(${interpolate(communityAnimation, [0, 1], [50, 0])}px)`,
        opacity: communityAnimation
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold"
        }}>
          👥 Social Proof
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
        {/* Community */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${primaryColor}40`,
          transform: `translateY(${interpolate(communityAnimation, [0, 1], [100, 0])}px)`,
          opacity: communityAnimation,
          textAlign: "center"
        }}>
          <div style={{
            fontSize: "60px",
            marginBottom: "20px"
          }}>
            👥
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            color: primaryColor
          }}>
            Diverse Community
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            color: "#cccccc"
          }}>
            Join thousands of investors who've transformed their crypto journey
          </p>
          
          {/* Animated community avatars */}
          <div style={{
            display: "flex",
            justifyContent: "space-around",
            marginTop: "20px",
            padding: "0 10px"
          }}>
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  width: "25px",
                  height: "25px",
                  borderRadius: "50%",
                  background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
                  opacity: interpolate(frame, [i * 20, i * 20 + 100], [0, 1]),
                  transform: `scale(${interpolate(frame, [i * 20, i * 20 + 100], [0, 1])})`
                }}
              />
            ))}
          </div>
        </div>

        {/* Portfolio Growth */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${accentColor}40`,
          transform: `translateY(${interpolate(growthAnimation, [0, 1], [100, 0])}px)`,
          opacity: growthAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            📈
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: accentColor
          }}>
            Portfolio Growth Charts
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            From beginners to experts, OnlyFinance levels the playing field
          </p>
          
          {/* Animated growth chart */}
          <div style={{
            marginTop: "20px",
            height: "120px",
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
              height: "4px",
              background: `linear-gradient(90deg, ${accentColor}, ${primaryColor})`,
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
              📈 Growth
            </div>
          </div>
        </div>

        {/* Testimonials */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, #667eea20, #667eea10)`,
          borderRadius: "20px",
          padding: "30px",
          border: "2px solid #667eea40",
          transform: `translateY(${interpolate(testimonialsAnimation, [0, 1], [100, 0])}px)`,
          opacity: testimonialsAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            ⭐
          </div>
          <h3 style={{
            fontSize: "28px",
            marginBottom: "15px",
            textAlign: "center",
            color: "#667eea"
          }}>
            Star Ratings & Testimonials
          </h3>
          <p style={{
            fontSize: "16px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Your success story starts here
          </p>
          
          {/* Animated star ratings */}
          <div style={{
            marginTop: "20px",
            textAlign: "center"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: "5px"
            }}>
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "24px",
                    opacity: interpolate(frame, [i * 30 + 200, i * 30 + 250], [0, 1])
                  }}
                >
                  ⭐
                </div>
              ))}
            </div>
            <div style={{
              fontSize: "16px",
              color: "#667eea",
              marginTop: "10px"
            }}>
              5.0/5.0 Rating
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div style={{
        marginTop: "60px",
        transform: `translateY(${interpolate(testimonialsAnimation, [0, 1], [100, 0])}px)`,
        opacity: testimonialsAnimation
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
            🌟 Join the Crypto Elite
          </h3>
          <p style={{
            fontSize: "24px",
            color: "#cccccc",
            lineHeight: "1.4"
          }}>
            Join thousands of investors who've transformed their crypto journey 👥. From beginners to experts, OnlyFinance levels the playing field 📈. Your success story starts here 🌟
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
              👥 Community
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
              ⭐ Success
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}; 