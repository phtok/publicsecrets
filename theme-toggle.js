(() => {
  const STORAGE_KEY = "ps_theme_preference_v2";
  const LEGACY_STORAGE_KEY = "ps_theme_invert_v1";
  const ACTIVE_CLASS = "theme-invert";
  const BUTTON_ID = "themeToggle";
  const FADE_DELAY_MS = 1400;
  const FADE_DURATION_MS = 1400;

  const root = document.documentElement;
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let fadeDelayTimer = null;
  let fadeDoneTimer = null;

  function readPreference() {
    try {
      const pref = localStorage.getItem(STORAGE_KEY);
      if (pref === "light" || pref === "dark" || pref === "auto") return pref;
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy === "1") return "dark";
      if (legacy === "0") return "light";
      return "auto";
    } catch {
      return "auto";
    }
  }

  function writePreference(pref) {
    try {
      localStorage.setItem(STORAGE_KEY, pref);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
  }

  function isSystemDark() {
    return Boolean(media && media.matches);
  }

  function toDark(pref) {
    if (pref === "dark") return true;
    if (pref === "light") return false;
    return isSystemDark();
  }

  function apply(pref) {
    const dark = toDark(pref);
    root.classList.toggle(ACTIVE_CLASS, dark);
    const btn = document.getElementById(BUTTON_ID);
    if (btn) {
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      const modeText = pref === "auto" ? "System" : (dark ? "Manuell: Nacht" : "Manuell: Tag");
      btn.setAttribute("title", `${modeText} (Rechtsklick: System)`); // keep manual toggle simple
    }
  }

  function ensureButton() {
    if (!document.body || document.getElementById(BUTTON_ID)) return;
    const isQuestionLanding = document.body.classList.contains("site-questions");
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.textContent = "☾";
    btn.setAttribute("aria-label", "Nachtversion umschalten");

    function clearFadeTimers() {
      if (fadeDelayTimer) clearTimeout(fadeDelayTimer);
      if (fadeDoneTimer) clearTimeout(fadeDoneTimer);
      fadeDelayTimer = null;
      fadeDoneTimer = null;
    }

    function setHidden(hidden) {
      btn.classList.toggle("is-hidden", Boolean(hidden));
      if (!hidden) btn.classList.remove("is-fading");
    }

    function fadeOutSlowly() {
      if (!isQuestionLanding) return;
      clearFadeTimers();
      fadeDelayTimer = setTimeout(() => {
        btn.classList.add("is-fading");
        fadeDoneTimer = setTimeout(() => {
          setHidden(true);
        }, FADE_DURATION_MS);
      }, FADE_DELAY_MS);
    }

    btn.addEventListener("click", () => {
      const current = readPreference();
      const next = toDark(current) ? "light" : "dark";
      writePreference(next);
      apply(next);
      fadeOutSlowly();
    });
    btn.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      writePreference("auto");
      apply("auto");
      fadeOutSlowly();
    });
    document.body.appendChild(btn);
    apply(readPreference());

    if (isQuestionLanding) {
      const initialView = readCurrentView();
      setHidden(initialView === "question");
      window.addEventListener("ps:view-changed", (event) => {
        const detail = event && event.detail ? event.detail : {};
        const view = String(detail.view || "question");
        if (view !== "question") {
          clearFadeTimers();
          setHidden(false);
          return;
        }
        setHidden(true);
      });
      window.addEventListener("ps:question-opened", () => {
        const view = readCurrentView();
        if (view !== "question") return;
        clearFadeTimers();
        setHidden(false);
      });
    }
  }

  function readCurrentView() {
    try {
      const params = new URLSearchParams(window.location.search);
      const view = String(params.get("view") || "").trim();
      if (!view) return "question";
      return view;
    } catch {
      return "question";
    }
  }

  function bindSystemChanges() {
    if (!media) return;
    const onChange = () => {
      if (readPreference() === "auto") apply("auto");
    };
    if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
    else if (typeof media.addListener === "function") media.addListener(onChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton, { once: true });
  } else {
    ensureButton();
  }
  bindSystemChanges();
})();
