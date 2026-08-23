export function readTitleProperty(page, propertyName) {
  const property = page?.properties?.[propertyName];
  if (!property) {
    return '';
  }

  if (property.type === 'title') {
    return plainTextFromRichText(property.title);
  }

  if (Array.isArray(property.title)) {
    return plainTextFromRichText(property.title);
  }

  return '';
}

export function readRelationPageIds(page, propertyName) {
  const property = page?.properties?.[propertyName];
  const relation = property?.relation;

  if (!Array.isArray(relation)) {
    return [];
  }

  return relation.map((item) => item.id).filter(Boolean);
}

export function readSelectName(page, propertyName) {
  const property = page?.properties?.[propertyName];
  return property?.select?.name ?? '';
}

export function readNumberProperty(page, propertyName) {
  const property = page?.properties?.[propertyName];
  return property?.type === 'number' && typeof property.number === 'number'
    ? property.number
    : null;
}

export function readRollupText(page, propertyName) {
  const property = page?.properties?.[propertyName];
  const rollup = property?.rollup;

  if (!rollup) {
    return '';
  }

  if (rollup.type === 'array') {
    return rollup.array.map(readPropertyText).filter(Boolean).join(', ');
  }

  return readPropertyText(rollup);
}

export function readPageUrl(page) {
  return page?.url ?? null;
}

function readPropertyText(property) {
  if (!property) {
    return '';
  }

  if (property.type === 'title') {
    return plainTextFromRichText(property.title);
  }

  if (property.type === 'rich_text') {
    return plainTextFromRichText(property.rich_text);
  }

  if (property.type === 'select') {
    return property.select?.name ?? '';
  }

  if (property.type === 'people') {
    return (property.people ?? []).map((person) => person.name).filter(Boolean).join(', ');
  }

  if (property.type === 'number') {
    return property.number == null ? '' : String(property.number);
  }

  if (property.type === 'date') {
    return property.date?.start ?? '';
  }

  if (typeof property.plain_text === 'string') {
    return property.plain_text;
  }

  return '';
}

function plainTextFromRichText(values = []) {
  return values.map((value) => value.plain_text ?? value.text?.content ?? '').join('');
}
