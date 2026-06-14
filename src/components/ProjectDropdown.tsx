import { useMemo } from 'react'
import { useStore } from '@/state/store'
import { Select } from './ui/Select'
import { ProjectPin } from './ProjectPin'

/**
 * ------------------------------------------------
 * Titlebar project switcher on `ui/Select`. Trigger keeps the workspace
 * project-name glow look; store wiring stays here, not in the primitive
 * (ADR-008-01).
 * @returns {JSX.Element} Project dropdown element.
 */
export function ProjectDropdown() {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const selectProject = useStore((s) => s.selectProject)

  const options = useMemo(() => projects.filter((p) => !p.archived), [projects])
  const selected = options.find((p) => p.id === activeProjectId) ?? null

  return (
    <Select.Root
      value={activeProjectId}
      onValueChange={(id) => {
        if (id != null && id !== activeProjectId) selectProject(id)
      }}
      items={options.map((p) => ({ value: p.id, label: p.name }))}
    >
      <Select.Trigger
        variant="bare"
        title="Switch project"
        className="flex h-[30px] max-w-[220px] cursor-pointer items-center gap-2 rounded-md border-[0.5px] border-transparent bg-transparent px-2 text-body font-semibold text-cream outline-none transition-all duration-150 hover:border-orange hover:bg-orange/13 focus-visible:border-orange focus-visible:bg-orange/13 aria-expanded:border-orange aria-expanded:bg-orange/13"
      >
        {selected && <ProjectPin name={selected.name} dot />}
        <span className="min-w-0 truncate font-display text-heading-sm font-bold glow-orange">
          {selected?.name ?? 'Select project'}
        </span>
      </Select.Trigger>
      <Select.Popup className="min-w-[240px] max-w-[360px] p-1.5">
        {options.map((p) => (
          <Select.Item
            key={p.id}
            value={p.id}
            title={p.path}
            className="gap-2.5 rounded-md px-2.5 py-2 text-body"
            leading={<ProjectPin name={p.name} size="md" />}
          >
            {p.name}
          </Select.Item>
        ))}
      </Select.Popup>
    </Select.Root>
  )
}
