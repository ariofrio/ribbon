import { definePluginApp, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { CompactViewportOverrideProvider } from "@/components/ui/hooks/use-compact-viewport";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesSync } from "./app/preferences/PreferencesSync.js";
import { ProjectList } from "./app/list/ProjectList.js";
import { useSidebarThreadReveal } from "./app/list/useSidebarThreadReveal.js";
import { registerWorkflowCommands } from "./ribbon/app/commands.js";
import { RibbonDataProvider } from "./ribbon/app/data.js";
import { IconsProvider } from "./ribbon/app/icons.js";

function ThreadList({
  activeThreadId,
  isCompactViewport,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  useSidebarThreadReveal();
  return (
    <CompactViewportOverrideProvider isCompactViewport={isCompactViewport}>
      <TooltipProvider>
        <PreferencesSync />
        <RibbonDataProvider>
          <IconsProvider>
            <ProjectList
              activeThreadId={activeThreadId}
              onProjectSelect={onNavigate}
              searchQuery={searchQuery}
            />
          </IconsProvider>
        </RibbonDataProvider>
      </TooltipProvider>
    </CompactViewportOverrideProvider>
  );
}

export default definePluginApp((app) => {
  registerWorkflowCommands(app);
  app.slots.experimental_threadList({
    id: "thread-stages",
    title: "Thread stages",
    description:
      "bb's thread list with workflow stages, stable thread order, and section and project icons.",
    component: ThreadList,
  });
});
