/**
 * How a title that outgrows its row ends. Ribbon faded long titles and panned
 * them to their end while their row was hovered; bb cuts them with an
 * ellipsis. The plugin setting names the three in the words bb shows.
 */
export const LONG_TITLE_OPTIONS = [
  "Ellipsis",
  "Fade",
  "Fade and pan on hover",
] as const;

export type LongTitles = (typeof LONG_TITLE_OPTIONS)[number];

export const DEFAULT_LONG_TITLES: LongTitles = "Fade and pan on hover";

/** The setting's stored value, or the default for anything it is not. */
export function longTitlesSetting(value: unknown): LongTitles {
  return (LONG_TITLE_OPTIONS as readonly unknown[]).includes(value)
    ? (value as LongTitles)
    : DEFAULT_LONG_TITLES;
}
