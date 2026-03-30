import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene6AIProps {
  primaryColor: string;
  accentColor: string;
}

export const Scene6AI: React.FC<Scene6AIProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const aiAnimation = spring({
    frame: frame - 30,
    fps: 30,
    config: { damping: 100 },
  });

  const neuralAnimation = spring({
    frame: frame - 120,
    fps: 30,
    config: { damping: 100 },
  });

  const dataAnimation = spring({
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
        transform: `translateY(${interpolate(aiAnimation, [0, 1], [50, 0])}px)`,
        opacity: aiAnimation
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold"
        }}>
          🤖 AI Intelligence
        </h1>
      </div>

      {/* AI Robot with Neural Network */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        maxWidth: "1400px",
        gap: "60px",
        alignItems: "center"
      }}>
        {/* Left - AI Robot */}
        <div style={{
          flex: 1,
          transform: `translateX(${interpolate(aiAnimation, [0, 1], [-100, 0])}px)`,
          opacity: aiAnimation,
          textAlign: "center"
        }}>
          <div style={{
            fontSize: "120px",
            marginBottom: "20px",
            filter: `drop-shadow(0 0 30px ${primaryColor}40)`,
            animation: "float 3s ease-in-out infinite"
          }}>
            🤖
          </div>
          <h3 style={{
            fontSize: "32px",
            marginBottom: "15px",
            color: primaryColor
          }}>
            Advanced AI Processing
          </h3>
          <p style={{
            fontSize: "18px",
            lineHeight: "1.5",
            color: "#cccccc"
          }}>
            Our AI doesn't just analyze data—it understands the crypto market's psychology
          </p>
        </div>

        {/* Right - Neural Network Visualization */}
        <div style={{
          flex: 1,
          transform: `translateX(${interpolate(neuralAnimation, [0, 1], [100, 0])}px)`,
          opacity: neuralAnimation
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
            borderRadius: "20px",
            padding: "30px",
            border: `2px solid ${accentColor}40`
          }}>
            <h3 style={{
              fontSize: "28px",
              marginBottom: "20px",
              textAlign: "center",
              color: accentColor
            }}>
              🧠 Neural Network Processing
            </h3>
            
            {/* Animated neural network */}
            <div style={{
              height: "200px",
              position: "relative",
              marginBottom: "20px"
            }}>
              {/* Input layer */}
              <div style={{
                position: "absolute",
                left: "20px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: accentColor,
                      opacity: interpolate(frame, [i * 20, i * 20 + 50], [0, 1])
                    }}
                  />
                ))}
              </div>

              {/* Hidden layers */}
              <div style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                gap: "15px"
              }}>
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: primaryColor,
                      opacity: interpolate(frame, [i * 30 + 100, i * 30 + 150], [0, 1])
                    }}
                  />
                ))}
              </div>

              {/* Output layer */}
              <div style={{
                position: "absolute",
                right: "20px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: "#667eea",
                      opacity: interpolate(frame, [i * 20 + 200, i * 20 + 250], [0, 1])
                    }}
                  />
                ))}
              </div>

              {/* Connection lines */}
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: -1
                }}
              >
                {[...Array(15)].map((_, i) => (
                  <line
                    key={i}
                    x1="60"
                    y1={`${50 + i * 10}%`}
                    x2="50%"
                    y2={`${40 + i * 15}%`}
                    stroke={accentColor}
                    strokeWidth="1"
                    opacity={interpolate(frame, [i * 10, i * 10 + 100], [0, 0.3])}
                  />
                ))}
                {[...Array(9)].map((_, i) => (
                  <line
                    key={i}
                    x1="50%"
                    y1={`${40 + i * 15}%`}
                    x2="calc(100% - 60)"
                    y2={`${50 + i * 10}%`}
                    stroke={primaryColor}
                    strokeWidth="1"
                    opacity={interpolate(frame, [i * 15 + 150, i * 15 + 200], [0, 0.3])}
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Data Processing Flow */}
      <div style={{
        marginTop: "60px",
        transform: `translateY(${interpolate(dataAnimation, [0, 1], [100, 0])}px)`,
        opacity: dataAnimation
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
            📊 Multiple Data Streams Converging
          </h3>
          <p style={{
            fontSize: "24px",
            color: "#cccccc",
            lineHeight: "1.4"
          }}>
            FinBERT reads financial news like a Wall Street expert 📰. Our ensemble models predict price movements with surgical precision 📈
          </p>
          
          {/* Animated data flow indicators */}
          <div style={{
            display: "flex",
            justifyContent: "space-around",
            marginTop: "30px"
          }}>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [300, 400], [0.3, 1])
            }}>
              📰 News
            </div>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [400, 500], [0.3, 1])
            }}>
              📊 Prices
            </div>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [500, 600], [0.3, 1])
            }}>
              📱 Social
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </AbsoluteFill>
  );
}; 