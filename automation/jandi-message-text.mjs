export function restoreLinkedUrls(bodyText, links = []) {
  const normalize = (value) => String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n');
  const looksLikeDisplayedUrl = (value) => /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i.test(value);

  let text = normalize(bodyText).trim();
  let searchFrom = 0;
  const missingLinks = [];

  for (const link of links) {
    const href = normalize(link?.href).trim();
    const label = normalize(link?.text).trim();
    if (!/^https?:\/\//i.test(href) || text.includes(href)) {
      continue;
    }

    if (label && looksLikeDisplayedUrl(label)) {
      const labelIndex = text.indexOf(label, searchFrom);
      if (labelIndex !== -1) {
        text = `${text.slice(0, labelIndex)}${href}${text.slice(labelIndex + label.length)}`;
        searchFrom = labelIndex + href.length;
        continue;
      }
    }

    if (!missingLinks.includes(href)) {
      missingLinks.push(href);
    }
  }

  return [text, ...missingLinks].filter(Boolean).join('\n');
}
