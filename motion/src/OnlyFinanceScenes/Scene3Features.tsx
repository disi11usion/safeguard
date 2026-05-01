import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";

interface Scene3FeaturesProps {
  primaryColor: string;
  accentColor: string;
}

export const Scene3Features: React.FC<Scene3FeaturesProps> = ({
  primaryColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  // Animate each feature section - much faster
  const marketDataAnimation = spring({
    frame: frame - 15,
    fps: 30,
    config: { damping: 80 },
  });

  const sentimentAnimation = spring({
    frame: frame - 60,
    fps: 30,
    config: { damping: 80 },
  });

  const forecastingAnimation = spring({
    frame: frame - 105,
    fps: 30,
    config: { damping: 80 },
  });

  const opacity = interpolate(frame, [420, 480], [1, 0], {
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
        marginBottom: "60px",
        transform: `translateY(${interpolate(marketDataAnimation, [0, 1], [50, 0])}px)`,
        opacity: marketDataAnimation
      }}>
        <h1 style={{
          fontSize: "56px",
          marginBottom: "20px",
          background: `linear-gradient(45deg, ${primaryColor}, ${accentColor})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: "bold"
        }}>
          🚀 Core Features
        </h1>
      </div>

      {/* Three-column layout for features */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        maxWidth: "1600px",
        gap: "40px"
      }}>
        {/* Real-Time Market Data */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${primaryColor}40`,
          transform: `translateY(${interpolate(marketDataAnimation, [0, 1], [100, 0])}px)`,
          opacity: marketDataAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            📊
          </div>
          <h3 style={{
            fontSize: "32px",
            marginBottom: "15px",
            textAlign: "center",
            color: primaryColor
          }}>
            Real-Time Market Data
          </h3>
          <p style={{
            fontSize: "18px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            Live cryptocurrency prices from Binance & CoinGecko APIs
          </p>
          
          {/* Animated price chart */}
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
              height: "2px",
              background: primaryColor,
              transform: `scaleX(${interpolate(frame, [0, 480], [0, 1])})`,
              transformOrigin: "left"
            }} />
            <div style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              fontSize: "24px",
              color: primaryColor
            }}>
              ⚡ 60s updates
            </div>
          </div>
        </div>

        {/* AI Sentiment Analysis */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
          borderRadius: "20px",
          padding: "30px",
          border: `2px solid ${accentColor}40`,
          transform: `translateY(${interpolate(sentimentAnimation, [0, 1], [100, 0])}px)`,
          opacity: sentimentAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            🧠
          </div>
          <h3 style={{
            fontSize: "32px",
            marginBottom: "15px",
            textAlign: "center",
            color: accentColor
          }}>
            AI Sentiment Analysis
          </h3>
          <p style={{
            fontSize: "18px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            FinBERT model analyzing news articles and social posts
          </p>
          
          {/* Animated sentiment indicators */}
          <div style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center"
          }}>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [120, 180], [0.3, 1]),
              transform: `scale(${interpolate(frame, [120, 180], [0.8, 1.1])})`
            }}>
              😊
            </div>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [180, 240], [0.3, 1]),
              transform: `scale(${interpolate(frame, [180, 240], [0.8, 1.1])})`
            }}>
              😐
            </div>
            <div style={{
              fontSize: "32px",
              opacity: interpolate(frame, [240, 300], [0.3, 1]),
              transform: `scale(${interpolate(frame, [240, 300], [0.8, 1.1])})`
            }}>
              😞
            </div>
          </div>
        </div>

        {/* Smart Forecasting */}
        <div style={{
          flex: 1,
          background: `linear-gradient(135deg, #667eea20, #667eea10)`,
          borderRadius: "20px",
          padding: "30px",
          border: "2px solid #667eea40",
          transform: `translateY(${interpolate(forecastingAnimation, [0, 1], [100, 0])}px)`,
          opacity: forecastingAnimation
        }}>
          <div style={{
            fontSize: "48px",
            textAlign: "center",
            marginBottom: "20px"
          }}>
            🔮
          </div>
          <h3 style={{
            fontSize: "32px",
            marginBottom: "15px",
            textAlign: "center",
            color: "#667eea"
          }}>
            Smart Forecasting
          </h3>
          <p style={{
            fontSize: "18px",
            lineHeight: "1.5",
            textAlign: "center",
            color: "#cccccc"
          }}>
            ML-powered price predictions with Prophet & XGBoost
          </p>
          
          {/* Animated forecast chart */}
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
              height: "3px",
              background: "#667eea",
              transform: `scaleX(${interpolate(frame, [0, 480], [0, 1])})`,
              transformOrigin: "left"
            }} />
            <div style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              fontSize: "24px",
              color: "#667eea"
            }}>
              📈 7-30 day forecast
            </div>
          </div>
        </div>
      </div>

      {/* Bottom text */}
      <div style={{
        textAlign: "center",
        marginTop: "60px",
        transform: `translateY(${interpolate(forecastingAnimation, [0, 1], [50, 0])}px)`,
        opacity: forecastingAnimation
      }}>
        <p style={{
          fontSize: "28px",
          color: "#cccccc",
          maxWidth: "800px",
          lineHeight: "1.4"
        }}>
          Real-time market data from the world's top exchanges. AI sentiment analysis reading every news article and social post. Machine learning forecasting that predicts tomorrow's prices today 🔮
        </p>
      </div>
    </AbsoluteFill>
  );
}; 