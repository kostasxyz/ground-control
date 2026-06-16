import { useStore } from '@/state/store'
import { initials } from '@/lib/constants'

const railIc =
  'relative flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-[6px] border-[0.5px] border-transparent font-extrabold transition-all duration-150'
const railIcIdle =
  'bg-orange/4 text-cream-dim hover:bg-orange/12 hover:text-orange-bright'
const railIcSelected = 'border-orange bg-orange/15 text-orange-bright'

/**
 * ------------------------------------------------
 * Workspace project rail.
 * @param {{ hidden?: boolean }} props - Visibility props.
 * @returns {JSX.Element | null} Project rail or null when hidden.
 */
export function IconRail({ hidden = false }: { hidden?: boolean }) {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const selectProject = useStore((s) => s.selectProject)
  const addProject = useStore((s) => s.addProject)

  if (hidden) return null

  return (
    <aside className="flex w-[39px] shrink-0 flex-col items-center gap-2 border-r border-line bg-rail py-2.5 backdrop-blur-[30px]">
      {projects
        .filter((p) => !p.archived && (p.pinned || p.id === activeProjectId))
        .map((p) => {
          const selected = p.id === activeProjectId
          return (
            <button
              key={p.id}
              className={`${railIc} font-display text-heading-2xs ${selected ? railIcSelected : railIcIdle}`}
              title={p.name}
              style={
                !selected && p.color ? { color: p.color } : undefined
              }
              onClick={() => selectProject(p.id)}
            >
              {initials(p.name)}
            </button>
          )
        })}
      <button
        className={`${railIc} ${railIcIdle} font-sans text-heading`}
        title="New workspace"
        onClick={() => void addProject()}
      >
        +
      </button>
    </aside>
  )
}
