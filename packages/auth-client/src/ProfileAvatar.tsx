import type { Profile } from "@storyteller/domain";
import { useEffect, useState } from "react";

interface ProfileAvatarProps {
  readonly className?: string | undefined;
  readonly profile: Pick<Profile, "email" | "name">;
  readonly size?: number;
}

export function ProfileAvatar({ className, profile, size = 96 }: ProfileAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageUnavailable, setImageUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setImageUrl(undefined);
    setImageUnavailable(false);
    void createGravatarUrl(profile.email, size).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => { active = false; };
  }, [profile.email, size]);

  if (imageUrl && !imageUnavailable) {
    return <img alt="" className={className} referrerPolicy="no-referrer" src={imageUrl} onError={() => setImageUnavailable(true)} />;
  }
  return <span aria-hidden="true" className={className}>{profileInitials(profile.name)}</span>;
}

export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return "?";
  const selected = words.length > 1 ? [words[0]!, words.at(-1)!] : [words[0]!];
  return selected.map((word) => [...word][0]?.toLocaleUpperCase() ?? "").join("");
}

export async function createGravatarUrl(email: string, size = 96): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedEmail));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const url = new URL(`https://gravatar.com/avatar/${hash}`);
  url.searchParams.set("d", "404");
  url.searchParams.set("s", String(Math.min(2048, Math.max(1, Math.round(size)))));
  return url.toString();
}
