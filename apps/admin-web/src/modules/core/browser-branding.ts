interface BrowserBrandingOptions {
  title: string;
  iconUrl?: string | null;
}

export function applyBrowserBranding({ title, iconUrl }: BrowserBrandingOptions) {
  document.title = title;

  if (!iconUrl) {
    return;
  }

  const iconLink = getOrCreateIconLink();
  iconLink.href = iconUrl;
}

function getOrCreateIconLink() {
  const existingIcon = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]',
  );

  if (existingIcon) {
    existingIcon.rel = "icon";
    return existingIcon;
  }

  const iconLink = document.createElement("link");
  iconLink.rel = "icon";
  document.head.appendChild(iconLink);
  return iconLink;
}
