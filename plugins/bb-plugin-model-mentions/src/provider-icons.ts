import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { PROVIDER_ICON_SLOTS, providerIconName } from "./icon-names";

export const iconContract = defineRpcContract({
  "icons.directory": {
    input: z.null(),
    output: z.array(z.string()).max(PROVIDER_ICON_SLOTS),
  },
});

type Provider = Awaited<
  ReturnType<BbPluginApi["sdk"]["providers"]["list"]>
>[number];

export function registerProviderIcons(bb: BbPluginApi) {
  const key = "provider-icon-slots";
  const schema = z.array(z.string().min(1).max(512)).max(PROVIDER_ICON_SLOTS);
  const read = async () => schema.parse((await bb.storage.kv.get(key)) ?? []);
  let pending: Promise<unknown> = Promise.resolve();
  const aliases = new Map<string, Promise<string>>();

  bb.rpc.register(iconContract, {
    "icons.directory": read,
  });
  bb.onDispose(async () => {
    await pending;
    aliases.clear();
  });

  return async (provider: Provider): Promise<string> => {
    if (!provider.logoUrl) return provider.icon?.glyph ?? "Code";
    const existing = aliases.get(provider.id);
    if (existing) return existing;
    const allocate = pending.then(async () => {
      const slots = await read();
      let slot = slots.indexOf(provider.id);
      if (slot < 0) {
        if (slots.length === PROVIDER_ICON_SLOTS)
          throw new Error(
            "Model mentions has reached its 256 SVG-provider icon limit",
          );
        slot = slots.length;
        slots.push(provider.id);
        await bb.storage.kv.set(key, slots);
        bb.realtime.publish("provider-icons", null);
      }
      return providerIconName(slot);
    });
    aliases.set(provider.id, allocate);
    pending = allocate.catch(() => {
      aliases.delete(provider.id);
    });
    return allocate;
  };
}
