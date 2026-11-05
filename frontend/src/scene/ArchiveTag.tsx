// Archive (done) count tag: the archive shows only the most recent done issues / PRs, so older ones are counted here ("+N").
// The docking bay and scanner stack every box instead — those are the ones to act on now.
import { useOffice } from '../store'
import { ARCHIVE, HULL_Y, WORLD_SCALE } from '../theme/station/geometry'
import { SceneHtml } from './shared'
import { DONE_VISIBLE, recentDone } from './slots'
import { useStationScene } from './useStationScene'

export function ArchiveTag() {
  const scene = useStationScene()
  const snapshot = useOffice((s) => s.office?.snapshot ?? null)
  const hidden = scene && snapshot ? Math.max(0, recentDone(scene.entities, snapshot).length - DONE_VISIBLE) : 0
  if (hidden === 0) return null
  return (
    <group position={[ARCHIVE.x * WORLD_SCALE, (HULL_Y + ARCHIVE.radius + 1) * WORLD_SCALE, ARCHIVE.z * WORLD_SCALE]}>
      <SceneHtml center zIndexRange={[0, 0]} pointerEvents="none">
        <div
          style={{
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.96)',
            boxShadow: '0 2px 10px rgba(30,45,90,0.16)',
            font: '600 11px var(--font, sans-serif)',
            color: '#1b2333',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          완료 +{hidden}
        </div>
      </SceneHtml>
    </group>
  )
}
