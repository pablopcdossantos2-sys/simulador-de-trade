export interface SignalAlertSettings {
  buyEnabled: boolean;
  sellEnabled: boolean;
}

const STORAGE_KEY = "simulador-de-trade:signal-alerts";

export const DEFAULT_SIGNAL_ALERT_SETTINGS: SignalAlertSettings = {
  buyEnabled: true,
  sellEnabled: true,
};

export function loadSignalAlertSettings(): SignalAlertSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SIGNAL_ALERT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SignalAlertSettings>;
    return {
      buyEnabled: parsed.buyEnabled !== false,
      sellEnabled: parsed.sellEnabled !== false,
    };
  } catch {
    return DEFAULT_SIGNAL_ALERT_SETTINGS;
  }
}

export function saveSignalAlertSettings(settings: SignalAlertSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // O restante do simulador não depende da persistência desta preferência.
  }
}

export function playSignalAlert(side: "BUY" | "SELL"): void {
  const settings = loadSignalAlertSettings();
  if (side === "BUY" ? !settings.buyEnabled : !settings.sellEnabled) return;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;

  try {
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(side === "BUY" ? 880 : 440, now);
    oscillator.frequency.setValueAtTime(side === "BUY" ? 1174.66 : 349.23, now + 0.13);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    oscillator.onended = () => { void context.close(); };
    void context.resume().catch(() => undefined);
  } catch {
    // O replay e os sinais continuam funcionando mesmo se o áudio não estiver disponível.
  }
}
