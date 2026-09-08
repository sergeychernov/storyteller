import { analytics, type SoundtrackDurationBucket } from "@storyteller/analytics";
import type { SoundtrackMix } from "@storyteller/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocalization } from "@storyteller/web-ui";
import { useCapability } from "../../access-control.js";
import {
  ApiError, getCurrentSoundtrack, listSoundtrackPresets, requestSoundtrack, soundtrackAudioUrl,
  soundtrackProvenanceUrl, type AuthSession, type SoundtrackPresetId, type SoundtrackRender,
  type Story, type StoryTimeline,
} from "../../api.js";
import { rememberRequestedSoundtrack, takeRequestedSoundtrack } from "./soundtrack-analytics.js";
import { createSoundtrackAudioContext, SoundtrackMixer } from "./soundtrack-mixer.js";
import { SoundtrackStylePicker } from "./SoundtrackStylePicker.js";
import type { StoryPreviewSnapshot } from "./use-story-preview-controller.js";
import styles from "./SoundtrackPanel.module.css";

const maximumSoundtrackSeconds = 180;
const siteUrl = (import.meta.env.VITE_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/** Re-aligns the stems after a scrub or a scene stall without restarting them on ordinary clock jitter. */
const syncToleranceSeconds = 0.25;

export interface SoundtrackPanelHandle {
  /** Opens the audio context inside the same gesture that starts the video, as autoplay policies require. */
  readonly prepareFromGesture: () => void;
}

export interface SoundtrackPanelProps {
  readonly story: Story;
  readonly timeline: StoryTimeline;
  readonly session: AuthSession;
  readonly snapshot: StoryPreviewSnapshot;
  readonly mix: SoundtrackMix;
  readonly sourceAudible: boolean;
  readonly onMixChange: (channel: keyof SoundtrackMix, value: number) => void;
}

export const SoundtrackPanel = forwardRef<SoundtrackPanelHandle, SoundtrackPanelProps>(function SoundtrackPanel({
  story, timeline, session, snapshot, mix, sourceAudible, onMixChange,
}, ref) {
  const { locale } = useLocalization();
  const copy = copies[locale];
  const canGenerate = useCapability("story.soundtrack.generate");
  const queryClient = useQueryClient();
  const queryKey = ["story-soundtrack", session.profile.id, story.id] as const;
  const [presetId, setPresetId] = useState<SoundtrackPresetId>("road");
  const presets = useQuery({
    queryKey: ["soundtrack-presets", session.profile.id],
    queryFn: ({ signal }) => listSoundtrackPresets(session.csrfToken, signal), enabled: canGenerate, staleTime: 5 * 60_000,
  });
  const soundtrack = useQuery({
    queryKey, queryFn: ({ signal }) => getCurrentSoundtrack(session.csrfToken, story.id, signal), enabled: canGenerate,
    refetchInterval: (query) => query.state.data && ["queued", "running"].includes(query.state.data.status) ? 1_000 : false,
  });
  const create = useMutation({
    mutationFn: (melodyVariant: number) => requestSoundtrack(session.csrfToken, story.id, story.revision, presetId, melodyVariant),
    onSuccess: (value) => {
      rememberRequestedSoundtrack(value.id);
      queryClient.setQueryData(queryKey, value);
    },
  });
  const value = soundtrack.data;
  const ready = value?.status === "ready" && value.current;
  const playback = useStemPlayback(story.id, ready ? value : undefined, snapshot, mix, sourceAudible);
  useImperativeHandle(ref, () => ({ prepareFromGesture: playback.prepareFromGesture }), [playback.prepareFromGesture]);

  useEffect(() => {
    // Reported once per render the creator asked for, whether or not the tab watched it finish.
    if (value?.status !== "ready" || !takeRequestedSoundtrack(value.id)) return;
    analytics.track("story soundtrack generated", {
      preset: value.preset.id, duration_bucket: durationBucket(value.totalSampleFrames / 48_000),
    });
  }, [value]);
  useEffect(() => {
    if (value?.preset.id) setPresetId(value.preset.id);
  }, [value?.preset.id]);
  useEffect(() => {
    // Another melody makes the story's master stale the moment it is asked for, not when it finishes.
    void queryClient.invalidateQueries({ queryKey: ["story-export", session.profile.id, story.id] });
  }, [queryClient, session.profile.id, story.id, value?.id, value?.status]);

  if (!canGenerate) return null;
  const empty = timeline.totalDurationSeconds <= 0;
  const tooLong = timeline.totalDurationSeconds > maximumSoundtrackSeconds + 1e-9;
  const durationAllowed = !empty && !tooLong;
  const active = value?.status === "queued" || value?.status === "running";
  const error = create.error ?? soundtrack.error;
  const errorText = error instanceof ApiError ? apiErrorText(error.code, copy) : error ? copy.unknownError : undefined;
  const channels = [
    { id: "video", level: mix.video, disabled: false },
    { id: "rhythm", level: mix.rhythm, disabled: !ready },
    { id: "melody", level: mix.melody, disabled: !ready },
    { id: "duckedMelody", level: mix.duckedMelody, disabled: !ready },
  ] as const;

  return <section className={styles.panel} aria-labelledby="soundtrack-title">
    <div className={styles.heading}>
      <div><strong id="soundtrack-title">{copy.title}</strong><small>{copy.subtitle}</small></div>
      {active && <span>{value?.progressPercent}%</span>}
    </div>
    <SoundtrackStylePicker presets={presets.data ?? fallbackPresets} value={presetId} names={copy.presetNames}
      legend={copy.presetLegend} disabled={Boolean(active) || create.isPending || presets.isPending}
      onChange={setPresetId} />
    {active && <progress max={100} value={value?.progressPercent ?? 0} aria-label={copy.progress} />}

    <div className={styles.mixer} role="group" aria-label={copy.mixerLegend}>
      {channels.map(({ id, level, disabled }) => <div key={id} className={styles.channel}>
        <span className={styles.channelValue}>{Math.round(level * 100)}</span>
        <input className={styles.fader} type="range" min={0} max={100} step={1} value={Math.round(level * 100)}
          disabled={disabled} aria-orientation="vertical" aria-label={copy.channelNames[id]}
          onChange={(event) => onMixChange(id, Number(event.target.value) / 100)} />
        <span className={styles.channelName}>{copy.channelNames[id]}</span>
      </div>)}
    </div>

    <p className={styles.status} role={errorText || value?.status === "failed" ? "alert" : "status"} aria-live="polite">
      {errorText ?? playbackText(playback.status, copy) ?? statusText(value, { empty, tooLong }, copy)}
    </p>
    {ready && playback.stems.length === 0 && <audio className={styles.player} controls preload="metadata"
      src={soundtrackAudioUrl(story.id, value.id)} />}

    <div className={styles.actions}>
      <button type="button" disabled={!durationAllowed || Boolean(active) || create.isPending}
        onClick={() => create.mutate(nextMelodyVariant(value, presetId))}>
        {ready ? copy.another : copy.create}
      </button>
      {ready && <>
        <a href={soundtrackAudioUrl(story.id, value.id, { download: true })}>{copy.download}</a>
        <a className={styles.iconAction} title={copy.provenance} href={soundtrackProvenanceUrl(story.id, value.id)}
          target="_blank" rel="noreferrer">
          <span aria-hidden="true">{"{}"}</span>
          <span className={styles.srOnly}>{copy.provenance}</span>
        </a>
      </>}
    </div>
    <small className={styles.license}>{copy.licensePrefix} <a href={`${siteUrl}/music-license`} target="_blank" rel="noreferrer">{copy.licenseLink}</a></small>
  </section>;
});

const stemOrder = ["rhythm", "melody"] as const;

/** Follows the preview transport instead of owning one, so the stems start with the same button as the video. */
function useStemPlayback(
  storyId: string,
  render: SoundtrackRender | undefined,
  snapshot: StoryPreviewSnapshot,
  mix: SoundtrackMix,
  sourceAudible: boolean,
) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const mixer = useRef<SoundtrackMixer | undefined>(undefined);
  const stems = stemOrder.filter((stem) => render?.stems?.includes(stem));
  const identity = render && stems.length ? `${render.id}:${stems.join(",")}` : "";
  const playing = snapshot.status === "playing" || snapshot.status === "buffering";
  const settings = useRef({ mix, sourceAudible, stems, identity, storyId, renderId: render?.id });
  settings.current = { mix, sourceAudible, stems, identity, storyId, renderId: render?.id };

  useEffect(() => () => {
    mixer.current?.dispose();
    mixer.current = undefined;
  }, [identity]);
  useEffect(() => setStatus("idle"), [identity]);

  const prepareFromGesture = useCallback(() => {
    const current = settings.current;
    if (mixer.current || !current.identity || !current.renderId) return;
    const context = createSoundtrackAudioContext();
    if (!context) return setStatus("error");
    const instance = new SoundtrackMixer(context, () => undefined);
    mixer.current = instance;
    for (const stem of current.stems) instance.setLevel(stem, current.mix[stem]);
    instance.setDucking(current.sourceAudible, current.mix.duckedMelody, 0);
    setStatus("loading");
    instance.load(current.stems.map((stem) => ({ id: stem, url: soundtrackAudioUrl(current.storyId, current.renderId!, { stem }) })))
      .then(() => setStatus("ready"))
      .catch(() => {
        instance.dispose();
        mixer.current = undefined;
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    const instance = mixer.current;
    if (!instance || status !== "ready") return;
    if (playing && !instance.playing) void instance.play(snapshot.playheadSeconds);
    else if (!playing && instance.playing) instance.pause();
    else if (Math.abs(instance.position() - snapshot.playheadSeconds) > syncToleranceSeconds) {
      instance.seek(snapshot.playheadSeconds);
    }
  }, [playing, snapshot.playheadSeconds, status]);
  useEffect(() => {
    for (const stem of stemOrder) mixer.current?.setLevel(stem, mix[stem]);
  }, [mix.melody, mix.rhythm, status]);
  useEffect(() => {
    mixer.current?.setDucking(sourceAudible, mix.duckedMelody);
  }, [mix.duckedMelody, sourceAudible, status]);

  return { status, stems, prepareFromGesture };
}

/** One button: the first press creates the soundtrack, later presses replace it with another melody. */
function nextMelodyVariant(render: SoundtrackRender | null | undefined, presetId: SoundtrackPresetId): number {
  if (!render || render.preset.id !== presetId) return 0;
  return (render.melodyVariant + 1) % 100;
}

function playbackText(status: "idle" | "loading" | "ready" | "error", copy: Copy): string | undefined {
  if (status === "loading") return copy.tracksLoading;
  if (status === "error") return copy.tracksError;
  return undefined;
}

function statusText(
  value: SoundtrackRender | null | undefined,
  duration: { readonly empty: boolean; readonly tooLong: boolean },
  copy: Copy,
): string {
  // Which reason blocked generation is a property of the timeline, not of whether the render query has answered.
  if (duration.empty) return copy.empty;
  if (duration.tooLong) return copy.durationLimit;
  if (!value) return copy.readyToCreate;
  if (!value.current) return copy.stale;
  if (value.status === "failed") return copy.failed;
  if (value.status === "ready") return copy.ready;
  return copy.processing[value.progressPhase] ?? copy.processing.queued;
}

function apiErrorText(code: string | undefined, copy: Copy): string {
  if (code === "soundtrack_duration_limit_exceeded") return copy.durationLimit;
  if (code === "soundtrack_empty_story") return copy.empty;
  if (code === "story_revision_conflict") return copy.stale;
  return copy.unknownError;
}

function durationBucket(seconds: number): SoundtrackDurationBucket {
  return seconds < 60 ? "under_1_minute" : seconds < 120 ? "one_to_two_minutes" : "two_to_three_minutes";
}

const fallbackPresets = [
  { id: "road", version: 1, bpm: 96, default: true },
  { id: "lounge", version: 1, bpm: 84, default: false },
  { id: "dnb", version: 1, bpm: 174, default: false },
] as const;

type Copy = (typeof copies)[keyof typeof copies];

const copies = {
  en: soundtrackCopy("Music", "Royalty-free · no third-party samples · plays with the video", "Style",
    { road: "Road", lounge: "Lounge", dnb: "Drum & bass" }, "Create music", "Another melody", "Download M4A", "Provenance",
    "Storyteller-generated music.", "License", "Music generation progress", "Levels",
    { video: "Video", rhythm: "Rhythm", melody: "Melody", duckedMelody: "Ducked" },
    "Pick a style or keep Road, then create the whole soundtrack in one step.", "Creating the musical structure…",
    "Encoding the audio…", "Checking the result…", "Saving the soundtrack…", "Ready. Press play to hear it with the video.",
    "The story changed or its duration changed. Create current music.", "Music could not be created. Try again.",
    "Add playable material before creating music.", "Built-in music is available for stories up to 3 minutes.",
    "Could not create music.",
    "Loading the tracks…", "The tracks could not be played in this browser."),
  ru: soundtrackCopy("Музыка", "Royalty-free · без сторонних семплов · играет вместе с видео", "Стиль",
    { road: "Дорога", lounge: "Лаундж", dnb: "Драм-н-бэйс" }, "Создать музыку", "Другая мелодия", "Скачать M4A", "Provenance",
    "Музыка создана Storyteller.", "Лицензия", "Прогресс создания музыки", "Уровни",
    { video: "Видео", rhythm: "Ритм", melody: "Мелодия", duckedMelody: "Приглушённая" },
    "Можно оставить «Дорогу» и создать весь саундтрек одним нажатием.", "Создаём музыкальную структуру…",
    "Кодируем аудио…", "Проверяем результат…", "Сохраняем саундтрек…", "Готово. Нажмите воспроизведение, чтобы услышать вместе с видео.",
    "История или её длительность изменилась. Создайте актуальную музыку.", "Не удалось создать музыку. Попробуйте ещё раз.",
    "Сначала добавьте материалы в историю.", "Встроенная музыка доступна для историй до 3 минут.",
    "Не удалось создать музыку.",
    "Загружаем дорожки…", "Дорожки не удалось воспроизвести в этом браузере."),
  "sr-Latn": soundtrackCopy("Muzika", "Royalty-free · bez tuđih semplova · svira uz video", "Stil",
    { road: "Put", lounge: "Lounge", dnb: "Drum & bass" }, "Napravi muziku", "Druga melodija", "Preuzmi M4A", "Poreklo",
    "Muziku je napravio Storyteller.", "Licenca", "Napredak izrade muzike", "Nivoi",
    { video: "Video", rhythm: "Ritam", melody: "Melodija", duckedMelody: "Prigušena" },
    "Zadržite Put ili izaberite stil, pa napravite ceo soundtrack jednim korakom.", "Pravimo muzičku strukturu…",
    "Kodiramo zvuk…", "Proveravamo rezultat…", "Čuvamo soundtrack…", "Spremno. Pustite video da čujete zajedno.",
    "Priča ili trajanje su promenjeni. Napravite aktuelnu muziku.", "Muzika nije napravljena. Pokušajte ponovo.",
    "Prvo dodajte sadržaj priče.", "Ugrađena muzika je dostupna za priče do 3 minuta.",
    "Muzika nije mogla da se napravi.",
    "Učitavamo trake…", "Trake nije moguće pustiti u ovom pregledaču."),
  es: soundtrackCopy("Música", "Royalty-free · sin muestras de terceros · suena con el vídeo", "Estilo",
    { road: "Camino", lounge: "Lounge", dnb: "Drum & bass" }, "Crear música", "Otra melodía", "Descargar M4A", "Procedencia",
    "Música creada por Storyteller.", "Licencia", "Progreso de creación musical", "Niveles",
    { video: "Vídeo", rhythm: "Ritmo", melody: "Melodía", duckedMelody: "Atenuada" },
    "Mantén Camino o elige un estilo y crea toda la banda sonora en un paso.", "Creando la estructura musical…",
    "Codificando el audio…", "Comprobando el resultado…", "Guardando la banda sonora…", "Lista. Pulsa reproducir para oírla con el vídeo.",
    "La historia o su duración cambiaron. Crea música actualizada.", "No se pudo crear la música. Inténtalo de nuevo.",
    "Añade contenido reproducible antes de crear música.", "La música integrada está disponible para historias de hasta 3 minutos.",
    "No se pudo crear la música.",
    "Cargando las pistas…", "Las pistas no se pudieron reproducir en este navegador."),
} as const;

function soundtrackCopy(
  title: string, subtitle: string, presetLegend: string, presetNames: Record<SoundtrackPresetId, string>, create: string,
  another: string, download: string, provenance: string, licensePrefix: string, licenseLink: string, progress: string,
  mixerLegend: string, channelNames: Record<keyof SoundtrackMix, string>, readyToCreate: string, synthesizing: string,
  encoding: string, verifying: string, uploading: string, ready: string, stale: string, failed: string, empty: string,
  durationLimit: string, unknownError: string, tracksLoading: string, tracksError: string,
) {
  return { title, subtitle, presetLegend, presetNames, create, another, download, provenance, licensePrefix, licenseLink, progress,
    mixerLegend, channelNames, readyToCreate,
    processing: { queued: synthesizing, synthesizing, encoding, verifying, uploading, ready }, ready, stale, failed, empty,
    durationLimit, unknownError, tracksLoading, tracksError };
}
