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
  if (side === "BUY") playAlertTone(880, 1174.66, 0.3);
  else playAlertTone(440, 349.23, 0.3);
}

export function playReminderAlert(): void {
  playAlertTone(660, 660, 0.5);
}

function playAlertTone(firstPitch: number, secondPitch: number, duration: number): void {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;

  try {
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(firstPitch, now);
    oscillator.frequency.setValueAtTime(secondPitch, now + 0.13);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.02);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => { void context.close(); };
    void context.resume().catch(() => undefined);
  } catch {
    // O replay e os sinais continuam funcionando mesmo se o áudio não estiver disponível.
  }
}

export function speakWarning(message: string): void {
  try {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    const speech = new SpeechSynthesisUtterance(message);
    speech.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  } catch {
    // A mensagem textual continua disponível se o dispositivo de voz falhar.
  }
}
