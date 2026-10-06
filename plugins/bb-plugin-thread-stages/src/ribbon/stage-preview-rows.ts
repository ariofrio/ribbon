export const STAGE_PREVIEW_ROW_OPTIONS = ["1", "2", "3", "4", "5"] as const;
export const DEFAULT_STAGE_PREVIEW_ROWS = 2;

export function stagePreviewRowsSetting(value: unknown): number {
  return (STAGE_PREVIEW_ROW_OPTIONS as readonly unknown[]).includes(value)
    ? Number(value)
    : DEFAULT_STAGE_PREVIEW_ROWS;
}
