// Colour textures of the design's glTF avatars (스페이 crew — Avatar, 라코 board mascot — BoardMascot).
import { NoColorSpace, type Texture } from 'three'

/**
 * The design paints its textures for three r150's legacy output (no colour decoding); the canvas renders the same
 * way (`linear`), so the glTF's colour textures are read as-is. Shared by every clone, set once.
 */
const preparedTextures = new WeakSet<Texture>()
export function useLinearTextures(textures: (Texture | null)[]) {
  for (const t of textures) {
    if (!t || preparedTextures.has(t)) continue
    t.colorSpace = NoColorSpace
    t.needsUpdate = true
    preparedTextures.add(t)
  }
}
