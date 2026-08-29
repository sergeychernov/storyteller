import { useEffect } from "react";

export function ExternalRedirect({ to }: { readonly to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return null;
}
