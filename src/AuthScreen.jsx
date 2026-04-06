// src/AuthScreen.jsx
// ─────────────────────────────────────────────
// Login & Register Bildschirm
// ─────────────────────────────────────────────

import { useState } from "react";
import { authAPI } from "./supabaseClient";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [lang, setLang] = useState("de");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const L = {
    welcome: lang === "de" ? "Willkommen!" : "Welcome!",
    subtitle: lang === "de" ? "Dein persönliches Kochbuch" : "Your personal cookbook",
    signin: lang === "de" ? "Anmelden" : "Sign In",
    signup: lang === "de" ? "Registrieren" : "Sign Up",
    email: "Email",
    password: lang === "de" ? "Passwort" : "Password",
    passwordHint: lang === "de" ? "Mindestens 6 Zeichen" : "At least 6 characters",
    noAccount: lang === "de" ? "Noch kein Konto?" : "No account yet?",
    haveAccount: lang === "de" ? "Schon ein Konto?" : "Already have an account?",
    signupNow: lang === "de" ? "Jetzt registrieren" : "Sign up now",
    signinNow: lang === "de" ? "Jetzt anmelden" : "Sign in now",
    submit: loading
      ? (lang === "de" ? "Bitte warten…" : "Please wait…")
      : mode === "signin"
        ? (lang === "de" ? "Anmelden" : "Sign In")
        : (lang === "de" ? "Konto erstellen" : "Create Account"),
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError(lang === "de" ? "Bitte Email und Passwort eingeben" : "Please enter email and password");
      return;
    }

    if (password.length < 6) {
      setError(lang === "de" ? "Passwort muss mindestens 6 Zeichen lang sein" : "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const data = await authAPI.signUp(email, password);
        if (data.session) {
          onAuth(data.user);
        } else {
          setSuccess(lang === "de"
            ? "Konto erstellt! Bitte prüfe deine Emails zur Bestätigung."
            : "Account created! Please check your email to confirm.");
        }
      } else {
        const data = await authAPI.signIn(email, password);
        onAuth(data.user);
      }
    } catch (err) {
      console.error("Auth error:", err);
      let msg = err.message;
      if (msg.includes("Invalid login")) {
        msg = lang === "de" ? "Email oder Passwort falsch" : "Invalid email or password";
      } else if (msg.includes("already registered")) {
        msg = lang === "de" ? "Diese Email ist bereits registriert" : "This email is already registered";
      } else if (msg.includes("Email not confirmed")) {
        msg = lang === "de" ? "Bitte bestätige zuerst deine Email" : "Please confirm your email first";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.wrap}>
      <style>{globalCSS}</style>
      <div style={S.card}>
        <button style={S.langToggle} onClick={() => setLang(lang === "de" ? "en" : "de")}>
          {lang === "de" ? "🇬🇧" : "🇩🇪"}
        </button>

        <div style={S.logo}>📖</div>
        <h1 style={S.title}>{L.welcome}</h1>
        <p style={S.subtitle}>{L.subtitle}</p>

        <form onSubmit={handleSubmit} style={S.form}>
          <div style={S.field}>
            <label style={S.label}>{L.email}</label>
            <input
              type="email"
              style={S.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dein@email.de"
              autoComplete="email"
              required
            />
          </div>

          <div style={S.field}>
            <label style={S.label}>{L.password}</label>
            <input
              type="password"
              style={S.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={L.passwordHint}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
            />
          </div>

          {error && <div style={S.error}>⚠️ {error}</div>}
          {success && <div style={S.success}>✅ {success}</div>}

          <button type="submit" style={{ ...S.submitBtn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {L.submit}
          </button>
        </form>

        <div style={S.divider} />

        <p style={S.switchText}>
          {mode === "signin" ? L.noAccount : L.haveAccount}
          {" "}
          <button
            type="button"
            style={S.switchBtn}
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setSuccess(null); }}
          >
            {mode === "signin" ? L.signupNow : L.signinNow}
          </button>
        </p>
      </div>
    </div>
  );
}

const C = {
  warm: "#4A3228",
  cream: "#FDF6EC",
  parchment: "#F0E0C8",
  accent: "#B8532E",
  soft: "#8B7262",
  card: "#FFFBF5",
  border: "#DFC9AF",
  red: "#D32F2F",
  green: "#2E7D32",
};

const font = "'Playfair Display', 'Palatino', 'Georgia', serif";
const body = "'Crimson Text', 'Palatino', 'Georgia', serif";

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&display=swap');
  @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  input:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px ${C.accent}18 !important; }
  * { box-sizing: border-box; }
  body { margin: 0; }
`;

const S = {
  wrap: {
    fontFamily: body,
    background: `linear-gradient(178deg, ${C.cream} 0%, ${C.parchment} 50%, ${C.cream} 100%)`,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    background: C.card,
    borderRadius: 24,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 420,
    boxShadow: `0 20px 60px ${C.warm}20`,
    border: `1px solid ${C.border}60`,
    position: "relative",
    animation: "fadeIn 0.5s ease",
  },
  langToggle: {
    position: "absolute",
    top: 16,
    right: 16,
    background: `${C.accent}12`,
    border: `1.5px solid ${C.accent}35`,
    borderRadius: 10,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 14,
    color: C.accent,
    fontFamily: body,
  },
  logo: { fontSize: 56, textAlign: "center", marginBottom: 8 },
  title: {
    fontFamily: font,
    fontSize: 30,
    fontWeight: 800,
    color: C.warm,
    textAlign: "center",
    margin: "0 0 6px",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 15,
    color: C.soft,
    textAlign: "center",
    fontStyle: "italic",
    margin: "0 0 28px",
  },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: {},
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: C.soft,
    marginBottom: 6,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: `1.5px solid ${C.border}`,
    fontSize: 15,
    fontFamily: body,
    color: C.warm,
    background: "#fff",
    transition: "all 0.2s",
  },
  error: {
    background: `${C.red}10`,
    border: `1px solid ${C.red}40`,
    borderRadius: 10,
    padding: "10px 14px",
    color: C.red,
    fontSize: 14,
    fontWeight: 600,
  },
  success: {
    background: `${C.green}10`,
    border: `1px solid ${C.green}40`,
    borderRadius: 10,
    padding: "10px 14px",
    color: C.green,
    fontSize: 14,
    fontWeight: 600,
  },
  submitBtn: {
    background: C.accent,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "14px 24px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: body,
    boxShadow: `0 4px 16px ${C.accent}40`,
    transition: "all 0.2s",
    marginTop: 4,
  },
  divider: {
    height: 1,
    background: `${C.border}80`,
    margin: "24px 0 16px",
  },
  switchText: {
    textAlign: "center",
    fontSize: 14,
    color: C.soft,
    margin: 0,
  },
  switchBtn: {
    background: "none",
    border: "none",
    color: C.accent,
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    fontFamily: body,
    padding: 0,
    textDecoration: "underline",
  },
};

