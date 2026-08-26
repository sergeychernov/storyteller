type ClassName = string | false | null | undefined;

export function classNames(...classNames: readonly ClassName[]): string {
  return classNames.filter(Boolean).join(" ");
}
