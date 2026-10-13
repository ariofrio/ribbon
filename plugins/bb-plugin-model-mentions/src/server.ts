import type {
  BbPluginApi,
  PluginMentionItem,
  PluginMentionSearchContext,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import { registerProviderIcons } from "./provider-icons";

const field = z.string().min(1).max(512);
const modelChoice = z
  .object({
    providerId: field,
    providerName: field,
    model: field,
    displayName: field,
  })
  .strict();
const providerChoice = modelChoice.pick({
  providerId: true,
  providerName: true,
});
const reasoningChoice = providerChoice
  .extend({ reasoningLevel: field, label: field })
  .strict();

function matches(query: string, ...values: string[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/u);
  const haystack = values.join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function encode(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

function decode<T>(id: string, schema: z.ZodType<T>): T {
  if (id.length > 8192) throw new Error("Invalid mention");
  return schema.parse(JSON.parse(decodeURIComponent(id)));
}

function taskContext(name: string, execution: object): string {
  return `This mention selects ${name} for the task described in the message. Use the exact execution fields ${JSON.stringify(execution)} when spawning a subthread or enqueueing the requested follow-up. Apply the choice to the task described; the mention does not change the current thread's model. If the target cannot use this choice, report that rather than silently substituting another choice.`;
}

export default function modelMentions(bb: BbPluginApi): void {
  const icon = registerProviderIcons(bb);
  const settings = bb.settings.define({
    modelMentions: {
      type: "boolean",
      label: "Enable model mentions",
      default: true,
      description:
        "Suggest models from your providers when you type @ and a model name.",
    },
    providerMentions: {
      type: "boolean",
      label: "Enable provider mentions",
      default: false,
      description: "Suggest providers by name, such as @Claude Code or @Codex.",
    },
    reasoningMentions: {
      type: "boolean",
      label: "Enable reasoning mentions",
      default: false,
      description:
        "Suggest reasoning levels supported by your providers' models, such as @high.",
    },
  });

  async function routing(ctx: PluginMentionSearchContext) {
    if (!ctx.threadId) return {};
    const thread = await bb.sdk.threads.get({ threadId: ctx.threadId });
    return thread.environmentId ? { environmentId: thread.environmentId } : {};
  }

  bb.ui.registerMentionProvider({
    id: "model",
    label: "Models",
    async search(ctx) {
      if (!(await settings.get()).modelMentions || !ctx.query.trim()) return [];
      const query = ctx.query.trim().replace(/^model:\s*/iu, "");
      const route = await routing(ctx);
      const signal = AbortSignal.timeout(1750);
      const providers = (
        await bb.sdk.providers.list({ ...route, signal })
      ).filter((p) => p.available);
      const providerRanks = new Map<PluginMentionItem, number>();
      const results = await Promise.allSettled(
        providers.map(async (provider) => {
          const catalog = await bb.sdk.providers.models({
            ...route,
            providerId: provider.id,
            signal,
          });
          if (catalog.modelLoadError) return [];
          const seen = new Set<string>();
          const items = await Promise.all(
            catalog.models.map(async (model): Promise<PluginMentionItem[]> => {
              const providerId = model.routeProviderId ?? provider.id;
              const target =
                providers.find((p) => p.id === providerId) ?? provider;
              if (
                seen.has(`${providerId}:${model.model}`) ||
                !matches(
                  query,
                  model.displayName,
                  model.model,
                  target.displayName,
                  providerId,
                )
              )
                return [];
              seen.add(`${providerId}:${model.model}`);
              const item: PluginMentionItem = {
                id: encode({
                  providerId,
                  providerName: target.displayName,
                  model: model.model,
                  displayName: model.displayName,
                }),
                title: model.displayName,
                subtitle: `Model · ${target.displayName}`,
                icon: await icon(target),
              };
              providerRanks.set(
                item,
                query.split(/\s+/u).filter(
                  (word) =>
                    word.length > 0 && matches(word, target.displayName, providerId),
                ).length,
              );
              return [item];
            }),
          );
          return items.flat();
        }),
      );
      return results
        .flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        )
        .sort((a, b) => providerRanks.get(b)! - providerRanks.get(a)!)
        .slice(0, 50);
    },
    resolve(id) {
      const choice = decode(id, modelChoice);
      return {
        context: taskContext(
          `${JSON.stringify(choice.displayName)} from ${JSON.stringify(choice.providerName)}`,
          { providerId: choice.providerId, model: choice.model },
        ),
      };
    },
  });

  bb.ui.registerMentionProvider({
    id: "provider",
    label: "Providers",
    async search(ctx) {
      if (!(await settings.get()).providerMentions || !ctx.query.trim())
        return [];
      const providers = await bb.sdk.providers.list({
        ...(await routing(ctx)),
        signal: AbortSignal.timeout(1750),
      });
      return Promise.all(
        providers
          .filter((p) => p.available && matches(ctx.query, p.displayName, p.id))
          .slice(0, 50)
          .map(async (p) => ({
            id: encode({ providerId: p.id, providerName: p.displayName }),
            title: p.displayName,
            subtitle: "Provider",
            icon: await icon(p),
          })),
      );
    },
    resolve(id) {
      const choice = decode(id, providerChoice);
      return {
        context: taskContext(JSON.stringify(choice.providerName), {
          providerId: choice.providerId,
        }),
      };
    },
  });

  bb.ui.registerMentionProvider({
    id: "reasoning",
    label: "Reasoning levels",
    async search(ctx) {
      if (!(await settings.get()).reasoningMentions || !ctx.query.trim())
        return [];
      const route = await routing(ctx);
      const signal = AbortSignal.timeout(1750);
      const providers = (
        await bb.sdk.providers.list({ ...route, signal })
      ).filter((p) => p.available);
      const results = await Promise.allSettled(
        providers.map(async (provider) => {
          const catalog = await bb.sdk.providers.models({
            ...route,
            providerId: provider.id,
            signal,
          });
          if (catalog.modelLoadError) return [];
          const levels = [
            ...new Set(
              catalog.models.flatMap((m) =>
                m.supportedReasoningEfforts.map((e) => e.reasoningEffort),
              ),
            ),
          ];
          const items = await Promise.all(
            levels.map(async (level): Promise<PluginMentionItem[]> => {
              const label =
                provider.reasoningLevels?.find((l) => l.id === level)?.label ??
                level[0]!.toUpperCase() + level.slice(1);
              if (
                !matches(
                  ctx.query,
                  label,
                  level,
                  provider.displayName,
                  provider.id,
                )
              )
                return [];
              return [
                {
                  id: encode({
                    providerId: provider.id,
                    providerName: provider.displayName,
                    reasoningLevel: level,
                    label,
                  }),
                  title: label,
                  subtitle: `Reasoning · ${provider.displayName}`,
                  icon: await icon(provider),
                },
              ];
            }),
          );
          return items.flat();
        }),
      );
      return results
        .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .slice(0, 50);
    },
    resolve(id) {
      const choice = decode(id, reasoningChoice);
      return {
        context:
          taskContext(
            `${JSON.stringify(choice.label)} reasoning on ${JSON.stringify(choice.providerName)}`,
            {
              providerId: choice.providerId,
              reasoningLevel: choice.reasoningLevel,
            },
          ) +
          " Check that the chosen model supports this level; provider models can support different levels.",
      };
    },
  });
}
