// OWNER: scene-builder. Root of everything rendered inside <Canvas>: the space station (confirmed theme) and the
// workspace's boxes and crew placed by the station ThemeLayout.
import { Suspense, useMemo } from 'react'
import { StationEnvironment } from '../theme/station/StationEnvironment'
import { StationSky } from '../theme/station/StationSky'
import { ArchiveTag } from './ArchiveTag'
import { Avatars } from './Avatars'
import { CameraRig } from './CameraRig'
import { DragLayer } from './DragLayer'
import { MeetingRoomState } from './MeetingRoomState'
import { TaskBoxes } from './TaskBoxes'
import { TaskTooltip } from './TaskTooltip'
import { clickSlop } from './runtime'
import { NoPick } from './shared'
import { podsShown, stationFor } from './stationSeats'
import { useOffice } from '../store'

export function OfficeScene() {
  const members = useOffice((s) => s.members)
  const pods = useMemo(() => podsShown(stationFor(members).seats), [members])
  return (
    <>
      <StationSky />
      <CameraRig />
      {/* Anything that doesn't stop propagation lands here: a click on empty space / the hull clears the selection. */}
      <group
        onClick={(e) => {
          if (e.delta > clickSlop(e)) return
          const s = useOffice.getState()
          if (s.drag) return
          if (s.selection) s.select(null)
        }}
      >
        {/* Large invisible plane so clicks around the station count too. */}
        <mesh position={[12, -0.45, 9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <NoPick>
          <StationEnvironment podsShown={pods} />
        </NoPick>
        {/* The crew glTF loads after the station: nothing waits for it. */}
        <Suspense fallback={null}>
          <Avatars />
        </Suspense>
        <TaskBoxes />
        <MeetingRoomState />
        <ArchiveTag />
      </group>
      <TaskTooltip />
      <DragLayer />
    </>
  )
}
