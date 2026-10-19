import { useState, useEffect } from "react";

export function useProfileImage(isLoggedIn: boolean | null) {
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setProfileImageUrl(null);
    if (!isLoggedIn) return;
    const controller = new AbortController();

    fetch("https://account.snabbb.com/api/account/profile", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (controller.signal.aborted || !data?.ok) return;
        const imageUrl = data.partner?.has_image && data.partner_id
          ? `https://account.snabbb.com/web/image/res.partner/${data.partner_id}/image_128?unique=${Date.now()}`
          : null;
        setProfileImageUrl(imageUrl);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isLoggedIn]);

  return { profileImageUrl: isLoggedIn ? profileImageUrl : null };
}
