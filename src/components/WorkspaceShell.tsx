import { ContentSplit } from '@/components/ContentSplit'
import { IconRail } from '@/components/IconRail'

interface WorkspaceShellProps {
  hidden?: boolean
}

export function WorkspaceShell({ hidden }: WorkspaceShellProps) {
  return (
    <>
      <IconRail hidden={hidden} />
      <ContentSplit hidden={hidden} />
    </>
  )
}
