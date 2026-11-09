// OWNER: scene-builder. Root of everything rendered inside <Canvas>: the space station (confirmed theme) and the open v1
// office's crew and issue / PR boxes, placed by the SceneModel and the station ThemeLayout (useStationScene).
// The 3D view is read-only: clicks open the v1 detail drawer; nothing is dragged (#102 T5-c-2).
import { useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { StationEnvironment } from '../theme/station/StationEnvironment'
import { StationSky } from '../theme/station/StationSky'
import { WarpStreaks } from '../theme/station/WarpStreaks'
import { ActivityNotes } from './ActivityNotes'
import { AgendaTrash } from './AgendaTrash'
import { ArchiveTag } from './ArchiveTag'
import { Avatars } from './Avatars'
import { CameraRig } from './CameraRig'
import { CommBoard } from './CommBoard'
import { DockShip } from './DockShip'
import { InstructorShip } from './InstructorShip'
import { MeetingRoomState } from './MeetingRoomState'
import { RequirementDeck } from './RequirementDeck'
import { podsShown } from './stationScene'
import { TaskBoxes } from './TaskBoxes'
import { TaskTooltip } from './TaskTooltip'
import { clickSlop, sceneApi, shipLive } from './runtime'
import { NoPick } from './shared'
import { useStationScene } from './useStationScene'
import { useSkyPalette } from './useSkyPalette'
import { useOffice } from '../store'

const NO_PODS = podsShown(new Map())

/** Lets code outside the Canvas (camera insets, e2e projection) reach the live R3F state. */
function SceneApiBridge() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    sceneApi.get = get
    return () => {
      if (sceneApi.get === get) sceneApi.get = null
    }
  }, [get])
  return null
}

export function OfficeScene() {
  const scene = useStationScene()
  const skyPalette = useSkyPalette()
  return (
    <>
      <SceneApiBridge />
      <StationSky palette={skyPalette} />
      <WarpStreaks source={shipLive} />
      <CameraRig />
      {/* Anything that doesn't stop propagation lands here: a click on empty space / the hull clears the selection. */}
      <group
        onClick={(e) => {
          if (e.delta > clickSlop(e)) return
          const s = useOffice.getState()
          if (s.officeSelection) s.selectInOffice(null)
        }}
      >
        {/* Large invisible plane so clicks around the station count too. */}
        <mesh position={[12, -0.45, 9]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <NoPick>
          <StationEnvironment podsShown={scene?.pods ?? NO_PODS} />
        </NoPick>
        {/* The crew glTF loads after the station: nothing waits for it. */}
        <Suspense fallback={null}>
          <Avatars />
        </Suspense>
        <TaskBoxes />
        <MeetingRoomState />
        <AgendaTrash />
        <RequirementDeck />
        <CommBoard />
        {/* 강사 우주선(#290) — 라코 glTF를 기다리는 동안에도 나머지 장면은 그대로 */}
        <Suspense fallback={null}>
          <InstructorShip />
        </Suspense>
        <ActivityNotes />
        <ArchiveTag />
        <DockShip />
      </group>
      <TaskTooltip />
    </>
  )
}
