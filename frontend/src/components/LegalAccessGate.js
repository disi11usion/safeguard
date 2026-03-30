import React, { useEffect, useMemo, useState } from "react";
import { apiService } from "../services/api";

const DISCLAIMER_VERSION = "v1.0";

// IMPORTANT: EXACT TEXT — DO NOT MODIFY
const DISCLAIMER_TEXT = `LEGAL DISCLAIMER & USER ACKNOWLEDGEMENT
IMPORTANT LEGAL NOTICE

Safeguard is an information and risk-awareness platform.
It does not provide investment, financial, legal, or tax advice.

Safeguard does not perform psychological, clinical, medical, or mental health assessments.
Any references to behavioral or psychological risk relate solely to information exposure and decision-making environments, not individual mental states.

All content, data, scores, indicators, and explanations provided by Safeguard are for informational and educational purposes only.

Safeguard does not:
\t•\trecommend buying, selling, or holding any asset
\t•\tprovide personalized investment advice
\t•\tact as a financial advisor, broker, or portfolio manager

Safeguard does not act in a fiduciary capacity and does not assume any duty to act in the best interests of users.

Any decisions you make based on information obtained from Safeguard are made entirely at your own risk.

Markets involve significant risk, including the potential loss of all invested capital.

Safeguard does not optimize, promote, or disadvantage any specific asset, market outcome, institution, or policy.
All analytical processes are designed solely to assess risk conditions and information exposure.

During periods of market stress, economic crises, elections, or extraordinary events, Safeguard continues to operate in a passive, informational manner and does not issue special messages, alerts, or directives.

By clicking “I Agree”, you acknowledge and agree that:
\t•\tYou understand Safeguard does not provide investment advice
\t•\tYou are solely responsible for your financial decisions
\t•\tTo the maximum extent permitted by law, Safeguard shall not be liable for any loss or damages

If you do not agree, you must exit this application.

⸻

Additional Jurisdiction Notice
(Automatically selected based on location and applicable regulatory framework)

(Automatically selected based on location)

GLOBAL (ALL USERS)
Safeguard does not provide investment advice. All content is informational only.

UNITED STATES
Safeguard is not a registered investment advisor under U.S. law.

EUROPEAN UNION
Safeguard provides general information only and does not consider individual circumstances.

AUSTRALIA
Safeguard does not provide financial product advice under the Corporations Act 2001.

TURKEY
Safeguard does not conduct investment advisory activities under Capital Markets Board regulations.
`;

function getSessionId() {
  const existing = localStorage.getItem("session_id");
  if (existing) return existing;
  const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random()}`;
  localStorage.setItem("session_id", id);
  return id;
}

export default function LegalAccessGate() {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [country, setCountry] = useState("GLOBAL");
  const [loadingGeo, setLoadingGeo] = useState(true);

  const acceptedKey = useMemo(() => {
    // accepted must be version + country dependent
    return `disclaimerAccepted:${DISCLAIMER_VERSION}:${country}`;
  }, [country]);

  useEffect(() => {
    let cancelled = false;

    // show modal after "just within seconds"
    const showTimer = setTimeout(() => {
      if (!cancelled) setVisible(true);
    }, 600);

    // Geo-IP detection (client-side)
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const c = (data && data.country) ? data.country : "GLOBAL";
        setCountry(c);
      })
      .catch(() => {
        if (!cancelled) setCountry("GLOBAL");
      })
      .finally(() => {
        if (!cancelled) setLoadingGeo(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(showTimer);
    };
  }, []);

  useEffect(() => {
    // once we know country, decide if we need to show
    if (loadingGeo) return;

    const accepted = localStorage.getItem(acceptedKey) === "true";
    if (accepted) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [acceptedKey, loadingGeo]);

  const onAgree = async () => {
    const sessionId = getSessionId();

    // Save acceptance locally first (so UX is instant)
    localStorage.setItem(acceptedKey, "true");
    localStorage.setItem("disclaimerVersion", DISCLAIMER_VERSION);
    localStorage.setItem("disclaimerCountry", country);

    // Log to backend (append-only)
    try {
      await apiService.makeRequest("/disclaimer/accept", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          disclaimer_version: DISCLAIMER_VERSION,
          country: country || "GLOBAL",
          disclaimer_text: DISCLAIMER_TEXT, // backend will hash this
        }),
      });
    } catch (e) {
      // If logging fails, still block? Your spec says logging is critical.
      // Best UX compromise: keep the gate closed if logging fails.
      localStorage.removeItem(acceptedKey);
      alert("Unable to verify acceptance. Please try again.");
      return;
    }

    setVisible(false);
  };

  const onExit = () => {
    // Browsers usually won't allow window.close unless script-opened.
    // Best available behavior: block access by sending to blank.
    localStorage.setItem("disclaimerDenied", "true");
    window.location.href = "about:blank";
  };

  // If user hit Exit, keep them blocked if they come back
  useEffect(() => {
    if (localStorage.getItem("disclaimerDenied") === "true") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md px-[15%]">
      <div className="w-full max-w-none max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-10 shadow-2xl">
        <h2 className="text-2xl font-bold text-foreground mb-2">LEGAL DISCLAIMER & USER ACKNOWLEDGEMENT</h2>
        <p className="text-sm text-muted-foreground mb-4">IMPORTANT LEGAL NOTICE</p>

        <div className="text-sm whitespace-pre-line leading-relaxed text-muted-foreground">
          {DISCLAIMER_TEXT.split("By clicking").map((part, index) => {
            if (index === 0) return part;
            return (
              <span key={index}>
                <span className="font-semibold text-foreground">
                  {"By clicking" + part.split("Additional Jurisdiction Notice")[0]}
                </span>
                {part.includes("Additional Jurisdiction Notice") &&
                  "Additional Jurisdiction Notice" +
                    part.split("Additional Jurisdiction Notice")[1]}
              </span>
            );
          })}
        </div>

        <div className="mt-6 flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={() => setChecked((v) => !v)}
          />
          <span className="text-sm text-foreground">
            I understand that Safeguard does not provide investment advice
          </span>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onExit}
            className="px-5 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Exit
          </button>

          <button
            onClick={onAgree}
            disabled={!checked}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
}
