export function concreteUrl(value: string | null | undefined) {
  return value && !value.startsWith("${") && URL.canParse(value) ? value : null;
}
