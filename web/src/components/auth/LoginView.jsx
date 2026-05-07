import { useEffect, useRef, useState } from "react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const GOOGLE_SCRIPT_ID = "google-identity-services-script";

export default function LoginView({ onLogin }) {
  const [error, setError] = useState("");
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Falta configurar VITE_GOOGLE_CLIENT_ID");
      return;
    }

    loadGoogleScript()
      .then(() => {
        if (!window.google?.accounts?.id) {
          throw new Error("No se pudo cargar Google Login");
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          ux_mode: "popup",
        });

        if (buttonRef.current) {
          buttonRef.current.innerHTML = "";

          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: "outline",
            size: "large",
            width: 320,
            text: "signin_with",
          });
        }

        setIsGoogleReady(true);
      })
      .catch((err) => {
        console.error(err);
        setError("No se pudo cargar Google Login");
      });
  }, []);

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);

      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);
    });
  }

  async function handleGoogleResponse(response) {
    try {
      setError("");

      if (!response?.credential) {
        throw new Error("Google no devolvió credenciales");
      }

      const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credential: response.credential,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo iniciar sesión");
      }

      window.localStorage.setItem("portfolio-auth-token", data.token);
      window.localStorage.setItem(
        "portfolio-auth-user",
        JSON.stringify(data.user)
      );

      onLogin(data.user, data.token);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error iniciando sesión");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/60">
        <div className="text-xs uppercase tracking-[0.28em] text-indigo-300">
          Portfolio Tracker
        </div>

        <h1 className="mt-4 text-3xl font-semibold text-slate-100">
          Iniciar sesión
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          Acceso privado al dashboard de portfolio, trading y movimientos.
        </p>

        <div className="mt-8 flex justify-center">
          <div ref={buttonRef} />

          {!isGoogleReady && !error ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
              Cargando Google Login...
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}