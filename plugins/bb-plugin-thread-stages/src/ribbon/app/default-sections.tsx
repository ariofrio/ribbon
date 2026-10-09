import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { useSidebarData } from "../../app/model/use-sidebar-data.js";
import type { ActionMenuSurface } from "../../app/ui/action-menu-items.js";
import { PERSONAL_PROJECT_ID } from "../../icons/store";

/**
 * The Default sections plugin owns each project's default section; this list
 * only draws the menus that set one. A plugin cannot import another's code or
 * join its realtime channel, so the defaults arrive over its versioned RPC and
 * edits are announced on a broadcast channel both plugins name.
 */
const PLUGIN_ID = "default-sections";
const CHANNEL = "bb.default-sections";

const envelopeSchema = z.union([
  z.object({
    ok: z.literal(true),
    result: z.object({
      defaults: z.array(
        z.object({ projectId: z.string(), sectionId: z.string() }),
      ),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.unknown() }),
]);

async function call(
  method: "listDefaultsV1" | "setDefaultV1",
  input: unknown,
): Promise<Map<string, string>> {
  const response = await fetch(
    `/api/v1/plugins/${PLUGIN_ID}/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const envelope = envelopeSchema.parse(await response.json());
  if (!envelope.ok) {
    const { error } = envelope;
    throw new Error(
      typeof error === "string"
        ? error
        : z.object({ message: z.string() }).safeParse(error).data?.message ??
            `Default sections request failed (${response.status})`,
    );
  }
  return new Map(
    envelope.result.defaults.map(({ projectId, sectionId }) => [
      projectId,
      sectionId,
    ]),
  );
}

function announce() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: "defaults-changed" });
    channel.close();
  } catch {
    // Listeners without BroadcastChannel catch up on focus.
  }
}

interface DefaultSectionsController {
  defaults: ReadonlyMap<string, string>;
  setDefault(projectId: string, sectionId: string | null): void;
}

const DefaultSectionsContext = createContext<DefaultSectionsController | null>(
  null,
);

/**
 * One copy of the defaults for every heading. Null while Default sections is
 * not installed or not running, which draws no menu at all.
 */
export function DefaultSectionsProvider({ children }: { children: ReactNode }) {
  const [defaults, setDefaults] = useState<ReadonlyMap<string, string> | null>(
    null,
  );

  const refresh = useCallback(() => {
    call("listDefaultsV1", null).then(setDefaults, () => setDefaults(null));
  }, []);

  useEffect(() => {
    refresh();
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = refresh;
    } catch {
      // Older clients fall back to the focus listener below.
    }
    // The CLI and other machines announce nothing here.
    window.addEventListener("focus", refresh);
    return () => {
      channel?.close();
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const setDefault = useCallback(
    (projectId: string, sectionId: string | null) => {
      setDefaults((current) => {
        if (current === null) return current;
        const next = new Map(current);
        if (sectionId === null) next.delete(projectId);
        else next.set(projectId, sectionId);
        return next;
      });
      call("setDefaultV1", { projectId, sectionId }).then(
        (next) => {
          setDefaults(next);
          announce();
        },
        (error: unknown) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to change the default section.",
          );
          refresh();
        },
      );
    },
    [refresh],
  );

  const value = useMemo(
    () => (defaults === null ? null : { defaults, setDefault }),
    [defaults, setDefault],
  );
  return (
    <DefaultSectionsContext.Provider value={value}>
      {children}
    </DefaultSectionsContext.Provider>
  );
}

/**
 * The submenus need a menu that can nest; the compact drawer cannot, and the
 * plugin's settings page covers it there.
 */
function useDefaultSections(): DefaultSectionsController | null {
  const controller = useContext(DefaultSectionsContext);
  return useIsCompactViewport() ? null : controller;
}

function menuParts(surface: ActionMenuSurface) {
  return surface === "context"
    ? {
        Sub: ContextMenuSub,
        SubTrigger: ContextMenuSubTrigger,
        SubContent: ContextMenuSubContent,
        RadioGroup: ContextMenuRadioGroup,
        RadioItem: ContextMenuRadioItem,
        CheckboxItem: ContextMenuCheckboxItem,
        Separator: ContextMenuSeparator,
      }
    : {
        Sub: DropdownMenuSub,
        SubTrigger: DropdownMenuSubTrigger,
        SubContent: DropdownMenuSubContent,
        RadioGroup: DropdownMenuRadioGroup,
        RadioItem: DropdownMenuRadioItem,
        CheckboxItem: DropdownMenuCheckboxItem,
        Separator: DropdownMenuSeparator,
      };
}

const SUB_CONTENT_CLASS =
  "max-h-[min(24rem,calc(100vh-2rem))] min-w-44 overflow-y-auto";
/** Radix reserves the empty string, so no section needs a value of its own. */
const THREADS = "threads";

/** A project heading's "Default section ▸", in bb's sections' order. */
export function ProjectDefaultSectionMenu({
  surface,
  projectId,
}: {
  surface: ActionMenuSurface;
  projectId: string;
}) {
  const controller = useDefaultSections();
  if (controller === null || projectId === PERSONAL_PROJECT_ID) return null;
  return (
    <ProjectDefaultSectionSubmenu
      controller={controller}
      surface={surface}
      projectId={projectId}
    />
  );
}

function ProjectDefaultSectionSubmenu({
  controller,
  surface,
  projectId,
}: {
  controller: DefaultSectionsController;
  surface: ActionMenuSurface;
  projectId: string;
}) {
  const { sections } = useSidebarData();
  if (sections.length === 0) return null;
  const { Sub, SubTrigger, SubContent, RadioGroup, RadioItem, Separator } =
    menuParts(surface);
  return (
    <Sub>
      <SubTrigger>
        <Icon name="SectionMove" aria-hidden="true" />
        Default section
      </SubTrigger>
      <SubContent className={SUB_CONTENT_CLASS}>
        <RadioGroup
          value={controller.defaults.get(projectId) ?? THREADS}
          onValueChange={(value) =>
            controller.setDefault(projectId, value === THREADS ? null : value)
          }
        >
          <RadioItem value={THREADS}>Threads</RadioItem>
          <Separator />
          {sections.map((section) => (
            <RadioItem key={section.id} value={section.id}>
              {section.name}
            </RadioItem>
          ))}
        </RadioGroup>
      </SubContent>
    </Sub>
  );
}

/** A section heading's "Default for ▸", one checkbox per project. */
export function SectionDefaultProjectsMenu({
  sectionId,
}: {
  sectionId: string;
}) {
  const controller = useDefaultSections();
  if (controller === null) return null;
  return (
    <SectionDefaultProjectsSubmenu controller={controller} sectionId={sectionId} />
  );
}

function SectionDefaultProjectsSubmenu({
  controller,
  sectionId,
}: {
  controller: DefaultSectionsController;
  sectionId: string;
}) {
  const { projects } = useSidebarData();
  const eligible = projects.filter(({ id }) => id !== PERSONAL_PROJECT_ID);
  if (eligible.length === 0) return null;
  const { Sub, SubTrigger, SubContent, CheckboxItem } = menuParts("dropdown");
  return (
    <Sub>
      <SubTrigger>
        <Icon name="Folder" aria-hidden="true" />
        Default for
      </SubTrigger>
      <SubContent className={SUB_CONTENT_CLASS}>
        {eligible.map((project) => (
          <CheckboxItem
            key={project.id}
            checked={controller.defaults.get(project.id) === sectionId}
            // Keep the menu open, so several projects can be ticked at once.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              controller.setDefault(project.id, checked ? sectionId : null)
            }
          >
            {project.name}
          </CheckboxItem>
        ))}
      </SubContent>
    </Sub>
  );
}
