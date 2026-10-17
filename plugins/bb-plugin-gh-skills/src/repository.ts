import { z } from "zod";

export const repositoryInput = z.string().trim()
  .transform((value) => value.replace(/^https:\/\/github\.com\//iu, "").replace(/\/$/u, "").replace(/\.git$/u, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u, "Enter OWNER/REPO or a GitHub repository URL."));
