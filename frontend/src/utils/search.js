export const normalizeValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

export const fuzzyMatch = (query, ...fields) => {
  const q = normalizeValue(query);
  if (!q) return true;
  return fields.some((field) => normalizeValue(field).includes(q));
};
