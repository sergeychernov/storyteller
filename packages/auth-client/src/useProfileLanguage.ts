import type { ProfileLanguage, ProfileUpdate } from "@storyteller/domain";
import { useCallback, useEffect } from "react";

interface UseProfileLanguageOptions {
  readonly language: ProfileLanguage;
  readonly onChanged: (language: ProfileLanguage) => void;
  readonly profileLanguage?: ProfileLanguage | undefined;
  readonly setLanguage: (language: ProfileLanguage) => void;
  readonly synchronize?: boolean | undefined;
  readonly updateProfile: (input: ProfileUpdate) => Promise<unknown>;
}

export function useProfileLanguage({
  language, onChanged, profileLanguage, setLanguage, synchronize = true, updateProfile,
}: UseProfileLanguageOptions): (language: ProfileLanguage) => Promise<void> {
  useEffect(() => {
    if (!synchronize || profileLanguage === undefined || profileLanguage === language) return;
    setLanguage(profileLanguage);
  }, [language, profileLanguage, setLanguage, synchronize]);

  return useCallback(async (nextLanguage: ProfileLanguage): Promise<void> => {
    await updateProfile({ language: nextLanguage });
    onChanged(nextLanguage);
  }, [onChanged, updateProfile]);
}
