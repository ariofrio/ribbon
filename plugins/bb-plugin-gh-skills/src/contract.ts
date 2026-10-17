import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { repositoryInput } from "./repository";

export const installedSkill = z.object({
  id: z.string(), skillName: z.string(), sourceURL: z.string(),
  version: z.string(), pinned: z.boolean(), path: z.string(),
  description: z.string().default(""), sourcePath: z.string().default(""),
});
export type InstalledSkill = z.infer<typeof installedSkill>;
const searchSkill = z.object({
  skillName: z.string(), namespace: z.string(), repo: z.string(), path: z.string(), description: z.string(), stars: z.number(),
});
export type SearchSkill = z.infer<typeof searchSkill>;
const argument = z.string().trim().min(1).max(1024).refine((value) => !/^[\-]|[\x00-\x1f]/u.test(value), "Invalid argument");
export const sourceInput = z.object({
  repository: repositoryInput,
  skill: argument.optional(),
  allowHidden: z.boolean().default(false),
});
const output = z.object({ output: z.string() });
export const skillOperation = z.object({
  id: z.string(), kind: z.enum(["install", "update", "check", "remove"]), target: z.string(),
  repository: z.string().optional(),
  state: z.enum(["running", "succeeded", "failed"]), startedAt: z.number(), finishedAt: z.number().optional(),
  output: z.string().optional(), error: z.string().optional(),
});
export type SkillOperation = z.infer<typeof skillOperation>;
export const skillUpdateCheck = output.extend({
  checkedAt: z.number(),
  updates: z.array(z.object({ skillName: z.string(), repository: z.string(), from: z.string(), to: z.string(), ref: z.string() })),
});
export type SkillUpdateCheck = z.infer<typeof skillUpdateCheck>;

export const rpcContract = defineRpcContract({
  "skills.operation": { input: z.null(), output: skillOperation.nullable() },
  "skills.check": { input: z.object({ force: z.boolean().default(false) }).strict(), output: skillUpdateCheck },
  "skills.list": {
    input: z.null(),
    output: z.object({ directory: z.string(), skills: z.array(installedSkill) }),
  },
  "skills.install": {
    input: sourceInput.extend({
      pin: argument.optional(), all: z.boolean().default(false), force: z.boolean().default(false),
    }).strict().refine((value) => Boolean(value.skill) !== value.all, "Choose one skill or install all skills"),
    output,
  },
  "skills.update": {
    input: z.object({
      id: argument.optional(), all: z.boolean().default(false), dryRun: z.boolean().default(false),
      force: z.boolean().default(false), unpin: z.boolean().default(false),
    }).strict().refine((value) => Boolean(value.id) !== value.all, "Choose one skill or all skills"),
    output,
  },
  "skills.read": {
    input: z.object({ id: argument }).strict(), output: z.object({ content: z.string() }),
  },
  "skills.remove": { input: z.object({ id: argument }).strict(), output },
  "skills.search": {
    input: z.object({ query: argument, owner: argument.optional(), page: z.number().int().min(1).max(100).default(1), limit: z.number().int().min(1).max(20).default(20) }).strict(),
    output: z.object({ skills: z.array(searchSkill) }),
  },
  "skills.preview": { input: sourceInput.required({ skill: true }).strict(), output: output.extend({ content: z.string().optional(), description: z.string().optional(), sourcePath: z.string().optional(), ref: z.string().optional() }) },
  "skills.discover": {
    input: sourceInput.omit({ skill: true }).extend({ pin: argument.optional() }).strict(),
    output: output.extend({ skills: z.array(z.object({ name: z.string(), description: z.string() })) }),
  },
});
