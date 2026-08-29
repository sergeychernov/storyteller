import { useMutation } from "@tanstack/react-query";
import { ApiError, type AuthSession } from "@storyteller/auth-client";
import { type FormEvent, useState } from "react";
import { authClient } from "../auth.js";
import { useLocalization } from "../localization.js";
import feedbackStyles from "../styles/feedback.module.css";
import typographyStyles from "../styles/typography.module.css";
import styles from "./SignIn.module.css";

interface SignInProps { readonly onAuthenticated: (session: AuthSession, accountCreated: boolean) => Promise<void> }

export function SignIn({ onAuthenticated }: SignInProps) {
  const { locale, t } = useLocalization();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requiresName, setRequiresName] = useState(false);
  const mutation = useMutation({
    mutationFn: () => authClient.signIn(email, password, requiresName ? name : undefined, locale),
    onSuccess: async ({ session, accountCreated }) => { await onAuthenticated(session, accountCreated); },
    onError: (error) => { if (isNameRequired(error)) setRequiresName(true); },
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    if ((!requiresName || name.trim()) && email.trim() && password.length >= 10) mutation.mutate();
  }

  function changeEmail(nextEmail: string): void {
    setEmail(nextEmail);
    setRequiresName(false);
    setName("");
    mutation.reset();
  }

  return (
    <section className={styles.welcome}>
      <p className={typographyStyles.eyebrow}>{t("web.welcome.eyebrow")}</p>
      <h1>{t("web.welcome.title.first")}<br /><em>{t("web.welcome.title.second")}</em></h1>
      <p className={styles.copy}>{t("web.welcome.copy")}</p>
      <form className={styles.form} onSubmit={submit}>
        <input aria-label={t("web.welcome.email.label")} type="email" value={email} onChange={(event) => changeEmail(event.target.value)} placeholder={t("web.welcome.email.placeholder")} />
        <input aria-label={t("web.welcome.password.label")} type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("web.welcome.password.placeholder")} />
        {requiresName && <input autoFocus aria-label={t("web.welcome.name.label")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("web.welcome.name.placeholder")} />}
        <button disabled={mutation.isPending}>{mutation.isPending ? t("web.welcome.signingIn") : t("web.welcome.login")}</button>
      </form>
      {requiresName && <p className={styles.hint}>{t("web.welcome.nameNeeded")}</p>}
      {mutation.error && !isNameRequired(mutation.error) && <p className={feedbackStyles.error}>{t("common.error")}</p>}
    </section>
  );
}

function isNameRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === "profile_name_required";
}
