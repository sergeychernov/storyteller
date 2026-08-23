import type { StorySummary } from "../api.js";
import { useLocalization } from "../localization.js";

export function EditorShell({ story }: { readonly story: StorySummary | null }) {
  const { t } = useLocalization();
  return (
    <section className={story ? "editor" : "editor muted"}>
      <div className="editor-head"><div><p className="eyebrow">{t("web.editor.eyebrow")}</p><h2>{story?.title ?? t("web.editor.select")}</h2></div><button disabled={!story}>{t("web.editor.previewStory")}</button></div>
      <div className="editor-body">
        <div className="scene-list"><span>{t("web.editor.scenes")}</span><div className="scene-placeholder">01<br /><small>{t("web.editor.firstScene")}</small></div><button disabled={!story}>{t("web.editor.addScene")}</button></div>
        <div className="canvas"><div className="phone-frame"><span>{story ? t("web.editor.scenePreview") : t("web.editor.preview")}</span></div></div>
        <div className="inspector"><span>{t("web.editor.settings")}</span><label>{t("web.editor.title")}<input disabled placeholder={t("web.editor.addTitle")} /></label><label>{t("web.editor.renderer")}<select disabled><option>{t("web.editor.chooseRenderer")}</option></select></label></div>
      </div>
      <div className="timeline"><span>{t("web.editor.timeline")}</span><div className="track"><i /></div><small>00:00</small></div>
    </section>
  );
}
